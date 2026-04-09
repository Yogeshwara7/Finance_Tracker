/**
 * POST /api/ai-chat
 * Full conversational AI using HuggingFace Inference API.
 *
 * NOTE: Your HF token needs "Make calls to Inference Providers" permission.
 * Go to huggingface.co/settings/tokens → click your token → enable that permission.
 */
import { Router } from 'express';

const router = Router();

const HF_MODEL = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';

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
      temperature: 0.3,
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

const SYSTEM_PROMPT = `You are Finn, a friendly expense tracking assistant for a personal finance app.

SUPPORTED CATEGORIES — ONLY these 3 exist:
- Transport (travel, cab, uber, fuel, metro, bus, flight, parking, toll)
- Shopping (clothes, amazon, flipkart, mall, online order, products)
- Food (restaurant, swiggy, zomato, groceries, lunch, dinner, cafe, snacks)

HARD RULES:
1. UNSUPPORTED CATEGORY: If user mentions a category not in the 3 above (gym, construction, dancing, medical, etc.), reply: "Sorry, we only support Transport, Shopping, and Food. [their category] doesn't fit — would you like to map it to one of these?"
2. ONE FIELD AT A TIME: When collecting expense data, ask for exactly ONE field per reply.
3. FIELD ORDER: full_name → card_type → category → amount → description → expense_date → contact_number → email
4. ACKNOWLEDGE + ASK: Confirm what was provided, then ask for the next missing field only.
5. MULTI-FIELD: If user provides multiple fields at once, extract all and ask for the next missing one.

CAPABILITIES:
1. Create expense — collect 8 fields one at a time
2. View expenses — ask for mobile number
3. Modify/Delete expenses — ask for mobile number
4. Show analytics — ask for mobile number

Return ONLY a JSON object with these exact keys:
{"reply": "your response", "fields": {}, "intent": "create|view|modify|analytics|null"}

EXAMPLES:
- "hi" → {"reply": "Hey! 👋 How can I help you today?", "fields": {}, "intent": null}
- "log expense" → {"reply": "Sure! What's your full name?", "fields": {}, "intent": "create"}
- "can I log gym expense?" → {"reply": "Sorry, we only support Transport, Shopping, and Food. Gym doesn't fit — would you like to log it under one of these?", "fields": {}, "intent": null}
- "Yogeshwara B" → {"reply": "Got it! Debit Card or Credit Card?", "fields": {"full_name": "Yogeshwara B"}, "intent": "create"}
- "debit, food, 300" → {"reply": "₹300 for Food on Debit Card! Give me a quick description.", "fields": {"card_type": "Debit Card", "category": "Food", "amount": 300}, "intent": "create"}

IMPORTANT: Your response must ALWAYS be a single JSON object. Never respond with plain text. Always include all three keys: reply, fields, intent.`;

router.post('/', async (req, res) => {
  try {
    const { message, conversationHistory = [], currentSlots = {}, userProfile = null } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required.' });

    // Build profile context so AI knows what's already known
    const profileContext = userProfile
      ? `\n\nUSER PROFILE (pre-filled, do NOT ask for these unless user wants to change):
- full_name: ${userProfile.full_name}
- default_card_type: ${userProfile.default_card_type}
- contact_number: ${userProfile.contact_number}
- email: ${userProfile.email}
When creating an expense, skip asking for these fields. Just confirm them briefly and ask for the missing ones (category, amount, description, expense_date).`
      : '';

    const slotsInfo = Object.keys(currentSlots).length > 0
      ? `\n\nAlready collected: ${JSON.stringify(currentSlots)}\nStill needed: ${
          ['full_name','card_type','category','amount','description','expense_date','contact_number','email']
            .filter(f => !currentSlots[f]).join(', ')
        }\nAsk for the first still-needed field only.`
      : '';

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + profileContext + slotsInfo },
      ...conversationHistory.slice(-6).map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.text,
      })),
      { role: 'user', content: message },
    ];

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), 15000)
    );

    const content = await Promise.race([callHuggingFace(messages), timeout])
      .catch(() => null);

    if (!content) {
      return res.json({ reply: "Sorry, I'm having trouble right now. Please try again.", fields: {}, intent: null });
    }

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    let parsed = {};
    try {
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        // Model returned plain text — use it directly as the reply
        parsed = { reply: content.slice(0, 300), fields: {}, intent: null };
      }
    } catch (e) {
      // Malformed JSON — extract what we can
      const replyMatch  = content.match(/"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/);
      const intentMatch = content.match(/"intent"\s*:\s*"([^"]+)"/);
      parsed = {
        reply:  replyMatch  ? replyMatch[1].replace(/\\n/g, '\n') : content.slice(0, 300),
        fields: {},
        intent: intentMatch ? intentMatch[1] : null,
      };
    }

    res.json({
      reply:  parsed.reply  || "I'm here to help! What would you like to do?",
      fields: parsed.fields || {},
      intent: parsed.intent || null,
    });

  } catch (err) {
    console.error('[AI Chat] Error:', err.message);
    res.json({ reply: "Something went wrong. Please try again.", fields: {}, intent: null });
  }
});

export default router;
