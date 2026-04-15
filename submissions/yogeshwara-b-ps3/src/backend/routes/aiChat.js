/**
 * POST /api/ai-chat
 * Conversational AI using HuggingFace Inference API (Qwen2.5-72B).
 */
import { Router } from 'express';

const router   = Router();
const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct:featherless-ai';

// ── Response validator ────────────────────────────────────────────────────────
const VALID_INTENTS = new Set(['create', 'view', 'modify', 'analytics']);

function validateResponse(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const reply       = typeof raw.reply  === 'string' ? raw.reply  : '';
  const fields      = raw.fields && typeof raw.fields === 'object' ? raw.fields : {};
  const intent = raw.intent === null ? null : (VALID_INTENTS.has(raw.intent) ? raw.intent : null);
  const suggestions = Array.isArray(raw.suggestions) ? raw.suggestions.slice(0, 3) : [];
  const options     = Array.isArray(raw.options) ? raw.options.slice(0, 5) : [];
  const quiz        = Array.isArray(raw.quiz) ? raw.quiz : [];
  return { reply, fields, intent, suggestions, options, quiz };
}

// ── Date helpers ──────────────────────────────────────────────────────────────
function getDates() {
  const now       = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const fmt = (d) =>
    `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
  return { today: fmt(now), yesterday: fmt(yesterday) };
}

// ── HuggingFace call ──────────────────────────────────────────────────────────
async function callHuggingFace(messages) {
  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      model:       HF_MODEL,
      messages,
      temperature: 0.2,
      max_tokens:  1024,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[AI Chat] HuggingFace HTTP error:', res.status, err);
    return null;
  }

  const json = await res.json();
  if (!json.choices?.length) {
    console.error('[AI Chat] Empty choices array');
    return null;
  }
  return json.choices[0].message?.content?.trim() || null;
}

// ── JSON extractor ────────────────────────────────────────────────────────────
function extractJSON(text) {
  try { return JSON.parse(text); } catch {}
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); } catch {}
      }
    }
  }
  return null;
}

// ── Intent normalizer ─────────────────────────────────────────────────────────
function normalizeIntent(raw) {
  if (raw === 'null' || raw === '' || raw === undefined) return null;
  return raw ?? null;
}

// ── Fallback response ─────────────────────────────────────────────────────────
const FALLBACK = (msg) => ({
  reply: msg, fields: {}, intent: null, suggestions: [], options: [], quiz: [],
});

// ── System prompt ─────────────────────────────────────────────────────────────
function buildSystemPrompt(profileContext, slotsContext, today, yesterday) {
  return `You are Finn, a sharp and efficient expense tracking assistant.

════════════════════════════════════════
SECTION 0 — CONTROL & FALLBACK LOGIC (CRITICAL)
════════════════════════════════════════
Before doing anything, decide:
1. Is the user talking about expenses?
2. Can you confidently classify intent?

If the message is unrelated, greeting only, or unclear:
- intent = null, fields = {}, quiz = [], options = [], suggestions = []
- Reply: "I can help track your expenses. Want to log something or check your spending?"

STRICT RULE: If intent is null → NEVER generate quiz or options.

════════════════════════════════════════
SECTION 1 — STRICT OUTPUT CONTRACT
════════════════════════════════════════
You MUST respond with ONLY a single valid JSON object. No text outside. No markdown.
Schema (ALL 6 keys required every time):
{"reply":"<string>","fields":{},"intent":"create|view|modify|analytics|null","suggestions":[],"options":[],"quiz":[]}

Rules:
- Use null (not "null") for intent when not applicable
- reply = plain text only, never embed JSON
- Always include all 6 keys even if empty

════════════════════════════════════════
SECTION 2 — INTENT CLASSIFICATION
════════════════════════════════════════
CREATE → spent, paid, bought, ordered, cost, booked, ₹, numbers
VIEW   → show, list, history, what did I spend
MODIFY → delete, remove, change, update an expense
ANALYTICS → total, how much, breakdown, compare, summary
NULL   → unrelated / unclear / greeting

════════════════════════════════════════
SECTION 3 — CATEGORY RULES
════════════════════════════════════════
Food     → ANYTHING edible: chocolates, coffee, biryani, groceries, snacks, drinks, cake, juice, sweets, biscuits
Transport → travel costs: uber, petrol, bus, metro, flight, auto, cab, toll, parking
Shopping  → non-food physical items: clothes, electronics, furniture, gadgets, appliances, books, shoes

RULE: If edible → always Food. Chocolates = Food. Never ask if obvious.
If genuinely ambiguous → include category in quiz with options ["Food","Transport","Shopping"].

════════════════════════════════════════
SECTION 4 — CREATE FLOW
════════════════════════════════════════
Required: category, amount, description, expense_date

1. Extract ALL fields present in user message in one shot
2. Use quiz when intent=create AND 2+ fields missing AND at least one signal exists
3. Use options when only 1 field missing
4. For date: always ask with options ["Today","Yesterday","Custom date"] — never assume today
5. For description: generate 3 context-aware options based on what user said + "Something else"
   Example: user said "chocolates" → options: ["Cadbury chocolates","Gift chocolates","Chocolate box","Something else"]

Quiz size rule:
- If currentSlots already has some fields → quiz max 1 question for the NEXT missing field only
- If no slots collected yet → quiz up to 3 questions for all missing fields

Quiz format (max 3 steps):
[{"question":"...","field":"...","options":[]}]

════════════════════════════════════════
SECTION 5 — MODIFY FLOW
════════════════════════════════════════
IMPORTANT DISTINCTION:
- BEFORE saving (during review): ALL fields can be changed — description, amount, category, date, etc.
- AFTER saving to DB: Only date changes and deletes are supported.

When user is in review stage and asks to change any field → extract the new value and return it in fields.
When user asks to modify an already-saved expense → only date and delete are supported, say so clearly.

════════════════════════════════════════
SECTION 6 — EXAMPLES
════════════════════════════════════════
User: "hi"
→ {"reply":"Hey! I can help track your expenses. What do you need?","fields":{},"intent":null,"suggestions":[],"options":[],"quiz":[]}

User: "tell me a joke"
→ {"reply":"I can help track your expenses. Want to log something or check your spending?","fields":{},"intent":null,"suggestions":[],"options":[],"quiz":[]}

User: "spent 200"
→ {"reply":"Got it! Let me get a few details:","fields":{"amount":200},"intent":"create","suggestions":[],"options":[],"quiz":[{"question":"What category?","field":"category","options":["Food","Transport","Shopping"]},{"question":"What was it for?","field":"description","options":[]},{"question":"When was this?","field":"expense_date","options":["Today","Yesterday","Custom date"]}]}

User: "i spent 100 on chocolates"
→ {"reply":"₹100 for chocolates under Food — one more:","fields":{"amount":100,"category":"Food","description":"chocolates"},"intent":"create","suggestions":[],"options":["Today","Yesterday","Custom date"],"quiz":[]}

User: "coffee 120"
→ {"reply":"₹120 coffee — when was this?","fields":{"amount":120,"category":"Food","description":"coffee"},"intent":"create","suggestions":[],"options":["Today","Yesterday","Custom date"],"quiz":[]}

User: "spent 500 on food"
→ {"reply":"₹500 under Food — let me get the rest:","fields":{"amount":500,"category":"Food"},"intent":"create","suggestions":[],"options":[],"quiz":[{"question":"What was it for?","field":"description","options":["Swiggy order","Restaurant meal","Grocery run","Something else"]},{"question":"When was this?","field":"expense_date","options":["Today","Yesterday","Custom date"]}]}

User: "bought shoes for 2000 yesterday"
→ {"reply":"₹2000 for shoes on ${yesterday} — logged under Shopping!","fields":{"amount":2000,"category":"Shopping","description":"shoes","expense_date":"${yesterday}"},"intent":"create","suggestions":[],"options":[],"quiz":[]}

User: "[quiz answers] description: chocolates, expense_date: 10-04-2026"
→ {"reply":"Got it!","fields":{"description":"chocolates","expense_date":"10-04-2026"},"intent":"create","suggestions":[],"options":[],"quiz":[]}

User: "show my expenses"
→ {"reply":"Pulling up your expenses.","fields":{},"intent":"view","suggestions":[],"options":[],"quiz":[]}

User: "how much did I spend this month"
→ {"reply":"Fetching your monthly summary.","fields":{"time_period":"this_month","metric":"total"},"intent":"analytics","suggestions":[],"options":[],"quiz":[]}

User: "change date of food to 5th april"
→ {"reply":"Updating the Food expense date to 05-04-2026.","fields":{"action":"update_date","match_category":"Food","new_date":"05-04-2026"},"intent":"modify","suggestions":[],"options":[],"quiz":[]}

User: "delete the last expense"
→ {"reply":"Deleting your last expense.","fields":{"action":"delete","match_position":-1},"intent":"modify","suggestions":[],"options":[],"quiz":[]}

User: "can i edit an expense"
→ {"reply":"Sure! Want me to pull up your expenses so you can tell me which one to change?","fields":{},"intent":"modify","suggestions":[],"options":[],"quiz":[]}
${profileContext}${slotsContext}`;
}

// ── Route ─────────────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory = [], currentSlots = {}, userProfile = null } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required.' });

    const { today, yesterday } = getDates();

    const profileContext = userProfile
      ? `\n\nUSER PROFILE (already known — do NOT ask for these):\nfull_name: ${userProfile.full_name}\ncard_type: ${userProfile.default_card_type}\ncontact_number: ${userProfile.contact_number}\nemail: ${userProfile.email}`
      : '';

    const EXPENSE_FIELDS = ['category', 'amount', 'description', 'expense_date'];
    const missing = EXPENSE_FIELDS.filter(f => !currentSlots[f]);
    const slotsContext = Object.keys(currentSlots).length > 0
      ? `\n\nCOLLECTED SO FAR: ${JSON.stringify(currentSlots)}\nSTILL NEEDED: ${missing.join(', ') || 'all collected'}\nSince some fields are already collected, use quiz with MAX 1 question for the next missing field only.`
      : '';

    const systemPrompt = buildSystemPrompt(profileContext, slotsContext, today, yesterday);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory.slice(-6).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: message },
    ];

    // Retry once on failure
    let content = await callHuggingFace(messages);
    if (!content) {
      console.log('[AI Chat] Attempt 1 failed — retrying...');
      content = await callHuggingFace(messages);
    }

    if (!content) {
      return res.json(FALLBACK("Sorry, I'm having trouble right now. Please try again."));
    }

    const raw = extractJSON(content);
    if (!raw) {
      console.error('[AI Chat] JSON extraction failed. Raw:', content.slice(0, 200));
      return res.json(FALLBACK("I got confused there. Could you rephrase that?"));
    }

    raw.intent = normalizeIntent(raw.intent);

    const validated = validateResponse(raw);
    if (!validated) {
      console.error('[AI Chat] Validation failed, raw:', JSON.stringify(raw).slice(0, 300));
      return res.json(FALLBACK("I got confused there. Could you rephrase that?"));
    }

    return res.json(validated);

  } catch (err) {
    console.error('[AI Chat] Unhandled error:', err.message);
    return res.json(FALLBACK("Something went wrong on my end. Try again in a moment."));
  }
});

export default router;
