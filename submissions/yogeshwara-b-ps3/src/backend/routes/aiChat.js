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
      max_tokens: 1024,
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

const SYSTEM_PROMPT = `You are Finn, a smart conversational expense tracking assistant. You reason about what the user means, not just what they literally say.

## YOUR JOB
Understand the user's intent, extract any expense data from their message, and respond naturally. You are having a conversation — not filling a form.

## INTENT DETECTION
Detect intent from natural language:
- "I spent 500 on food" → intent: create
- "log an expense", "add expense", "I bought..." → intent: create
- "show my expenses", "what did I spend", "my transactions" → intent: view
- "delete", "remove", "modify", "change", "edit" → intent: modify
- "analytics", "summary", "how much did I spend", "breakdown" → intent: analytics
- greetings, questions, anything else → intent: null

## SUPPORTED CATEGORIES (only these 3)
- Food: restaurant, swiggy, zomato, groceries, lunch, dinner, cafe, snacks, eating, breakfast, biryani, pizza, burger, coffee, tea, juice, hotel food, canteen, mess, tiffin, dabba, fruits, vegetables, milk, bread, eggs, chicken, mutton, fish, ice cream, dessert, bakery, fast food
- Transport: travel, cab, uber, ola, fuel, metro, bus, flight, parking, toll, petrol, diesel, auto, rickshaw, train, taxi, bike rental, car rental, ferry, boat, highway, road trip, airport, railway, ticket, pass, recharge, rapido
- Shopping: clothes, amazon, flipkart, mall, online order, products, watch, shoes, bag, pants, jeans, shirt, glasses, sunglasses, vessel, utensils, furniture, electronics, gadgets, accessories, jewellery, toys, stationery, books, kurta, saree, dress, jacket, hoodie, cap, belt, wallet, phone, laptop, charger, earphones, headphones, appliances, crockery, bedsheet, pillow, curtain

If user mentions an unsupported category (gym, medical, rent, etc.), say: "We only support Food, Transport, and Shopping. Would you like to map '[their category]' to one of these?"

## ENTITY EXTRACTION — BE SMART
Extract fields from natural language:
- "I spent 500 on food yesterday" → amount=500, category=Food, expense_date=yesterday's date
- "300, bought clothes and a watch" → amount=300, description="bought clothes and a watch"
- "food, 200, swiggy order" → category=Food, amount=200, description="swiggy order"
- "use credit card" → card_type="Credit Card"
- "today", "yesterday" → resolve to actual DD-MM-YYYY date

## FIELDS TO COLLECT FOR EXPENSE CREATION
full_name, card_type, category, amount, description, expense_date, contact_number, email

Rules:
- If user profile is provided, those fields are already known — NEVER ask for them again
- Extract ALL fields the user provides in one message simultaneously
- Ask for only ONE missing field at a time
- If user provides amount + context text, use the context as description
- Acknowledge what was captured, then ask for the next missing field

## CORRECTIONS
If user says "actually", "no wait", "change", "wrong", "I meant" — update the field they're correcting. Don't re-ask already confirmed fields.

## RESPONSE FORMAT
Always return ONLY a valid JSON object:
{"reply": "your conversational response", "fields": {extracted fields}, "intent": "create|view|modify|analytics|null"}

Never include text outside the JSON. Never wrap in markdown code blocks.

## EXAMPLES
- "hi" → {"reply": "Hey! 👋 I'm Finn, your expense assistant. Want to log an expense, view your history, or check analytics?", "fields": {}, "intent": null}
- "I spent 500 on food" → {"reply": "Got it — ₹500 for Food! Quick description of what it was?", "fields": {"category": "Food", "amount": 500}, "intent": "create"}
- "swiggy order" → {"reply": "Nice! What date was this expense? (DD-MM-YYYY)", "fields": {"description": "swiggy order"}, "intent": "create"}
- "show my expenses" → {"reply": "Sure! I'll need your mobile number to look those up.", "fields": {}, "intent": "view"}
- "delete last one" → {"reply": "I can help with that. What's your mobile number so I can find your expenses?", "fields": {}, "intent": "modify"}
- "actually use credit card" → {"reply": "Updated to Credit Card!", "fields": {"card_type": "Credit Card"}, "intent": "create"}`;


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

    const ALL_FIELDS = ['full_name','card_type','category','amount','description','expense_date','contact_number','email'];
    const missing = ALL_FIELDS.filter(f => !currentSlots[f]);
    const slotsInfo = Object.keys(currentSlots).length > 0
      ? `\n\nCURRENT SESSION STATE:\nAlready known: ${JSON.stringify(currentSlots)}\nStill missing: ${missing.join(', ') || 'none — all fields collected!'}\nAsk for the first missing field only. Do not re-ask fields already known.`
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
