/**
 * POST /api/ai-chat
 * Conversational AI using HuggingFace Inference API (Qwen2.5-72B).
 */
import { Router } from 'express';

const router = Router();

const HF_MODEL = process.env.HF_MODEL || 'Qwen/Qwen2.5-72B-Instruct';

async function callHuggingFace(messages) {
  const res = await fetch('https://router.huggingface.co/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.HF_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: HF_MODEL,
      messages,
      temperature: 0.2,   // lower = more deterministic
      max_tokens: 512,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error('[AI Chat] HuggingFace error:', res.status, err);
    return null;
  }
  const json = await res.json();
  return json.choices?.[0]?.message?.content?.trim() || null;
}

// Fix #2: deterministic, structured extraction over creative interpretation
// Fix #3: strict JSON enforcement
// Fix #4: ambiguity guard — ask if category unclear
const SYSTEM_PROMPT = `You are Finn, a friendly and intelligent expense tracking assistant. You think like a human assistant — you understand what the user wants from context, not just keywords.

## YOUR PERSONALITY
You are warm, helpful, and conversational. You follow the user's lead. You don't ask unnecessary questions. You reason about what the user means and respond naturally.

## WHAT YOU CAN HELP WITH
1. Logging a new expense
2. Viewing the user's expense history
3. Editing or deleting an expense (only date changes and deletes are supported)
4. Showing spending analytics

## HOW TO THINK ABOUT INTENT
Don't pattern-match keywords. Think about what the user actually wants:
- If they mention spending money, buying something, or want to log/add/record → they want to create an expense
- If they want to see, check, view, or list their expenses → they want to view
- If they want to change, edit, update, delete, or remove an expense → they want to modify
- If they ask about spending patterns, summaries, charts, or analytics → they want analytics
- Anything else → respond helpfully with intent null

## EXPENSE CREATION
When creating an expense, you need: category, amount, description, expense_date.
The user's profile already has their name, card type, phone, and email — never ask for these.

Categories (only 3): Food, Transport, Shopping
- Food: anything edible — restaurants, delivery, groceries, drinks
- Transport: travel costs — cab, fuel, metro, flight, bus (NOT buying a vehicle)
- Shopping: buying physical things — clothes, electronics, furniture, vehicles, gadgets

Date rules: today = 09-04-2026, yesterday = 08-04-2026, default year = 2026

Extract everything the user gives you in one message. Ask for only one missing thing at a time. Be natural about it.

## EXPENSE MODIFICATION
Only date changes and deletes are supported.
If user wants to change something else (amount, category, card), tell them kindly that only date and delete are supported, and suggest creating a new expense instead.

For date changes: extract which expense (by category, description, or position like "2nd", "last") and the new date.
For deletes: extract which expense to delete.

## OUTPUT FORMAT
Always respond with ONLY a valid JSON object — no text outside it, no markdown:
{"reply": "your response", "fields": {}, "intent": "create|view|modify|analytics|null"}

For modify actions include action details in fields:
{"reply": "...", "fields": {"action": "update_date", "match_category": "Food", "new_date": "03-04-2026"}, "intent": "modify"}
{"reply": "...", "fields": {"action": "delete", "match_position": 2}, "intent": "modify"}

## EXAMPLES
User: "hi" → {"reply": "Hey! 👋 I'm Finn, your expense assistant. Want to log something, check your expenses, or see your analytics?", "fields": {}, "intent": null}
User: "I spent 500 on food" → {"reply": "₹500 for Food — got it! What was it for?", "fields": {"category": "Food", "amount": 500}, "intent": "create"}
User: "swiggy biryani 200 today" → {"reply": "₹200 swiggy biryani on 09-04-2026 — logged under Food!", "fields": {"category": "Food", "amount": 200, "description": "swiggy biryani", "expense_date": "09-04-2026"}, "intent": "create"}
User: "view expense" → {"reply": "Sure! Fetching your expenses now.", "fields": {}, "intent": "view"}
User: "show my expenses" → {"reply": "On it! Pulling up your expenses.", "fields": {}, "intent": "view"}
User: "can i edit it" → {"reply": "Of course! Want me to pull up your expenses so you can tell me which one to change?", "fields": {}, "intent": "modify"}
User: "change date of food to 3rd april" → {"reply": "Got it — updating the Food expense date to 03-04-2026.", "fields": {"action": "update_date", "match_category": "Food", "new_date": "03-04-2026"}, "intent": "modify"}
User: "delete the 2nd one" → {"reply": "Deleting the 2nd expense.", "fields": {"action": "delete", "match_position": 2}, "intent": "modify"}
User: "show analytics" → {"reply": "Opening your spending analytics!", "fields": {}, "intent": "analytics"}
User: "how much did I spend this month" → {"reply": "Let me pull up your spending breakdown!", "fields": {}, "intent": "analytics"}`;

// Fix #6: robust JSON extraction — find the outermost complete JSON object
function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text); } catch {}

  // Find first { and match to its closing }
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

router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory = [], currentSlots = {}, userProfile = null } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required.' });

    const profileContext = userProfile
      ? `\n\nUSER PROFILE (already known — do NOT ask for these):
full_name: ${userProfile.full_name}
card_type: ${userProfile.default_card_type}
contact_number: ${userProfile.contact_number}
email: ${userProfile.email}`
      : '';

    const EXPENSE_FIELDS = ['category','amount','description','expense_date'];
    const missing = EXPENSE_FIELDS.filter(f => !currentSlots[f]);
    const slotsInfo = Object.keys(currentSlots).length > 0
      ? `\n\nCOLLECTED SO FAR: ${JSON.stringify(currentSlots)}\nSTILL NEEDED: ${missing.join(', ') || 'all collected'}\nAsk for the first still-needed field only.`
      : '';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + profileContext + slotsInfo },
      ...conversationHistory.slice(-10).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: message },
    ];

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 20000)
    );

    const content = await Promise.race([callHuggingFace(messages), timeout])
      .catch(() => null);

    if (!content) {
      return res.json({ reply: "Sorry, I'm having trouble right now. Please try again.", fields: {}, intent: null });
    }

    // Fix #6: robust JSON extraction
    const parsed = extractJSON(content);

    if (!parsed) {
      console.error('[AI Chat] Failed to parse JSON from:', content.slice(0, 200));
      return res.json({ reply: content.slice(0, 300), fields: {}, intent: null });
    }

    res.json({
      reply:  typeof parsed.reply  === 'string' ? parsed.reply  : "I'm here to help!",
      fields: typeof parsed.fields === 'object' ? parsed.fields : {},
      intent: typeof parsed.intent === 'string' ? parsed.intent : null,
    });

  } catch (err) {
    console.error('[AI Chat] Error:', err.message);
    res.json({ reply: "Something went wrong. Please try again.", fields: {}, intent: null });
  }
});

export default router;
