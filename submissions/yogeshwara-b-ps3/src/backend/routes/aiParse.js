/**
 * POST /api/ai-parse
 * Extracts expense fields using HuggingFace Inference API.
 */
import { Router } from 'express';

const router = Router();

const HF_MODEL = process.env.HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';

const SYSTEM_PROMPT = `Extract expense fields from the user message. Return ONLY a JSON object.
Fields: full_name, card_type ("Debit Card"/"Credit Card"), category ("Transport"/"Shopping"/"Food"), amount (number), description, expense_date (DD-MM-YYYY, today=${new Date().toLocaleDateString('en-GB').replace(/\//g,'-')}), contact_number, email.
Return only confident fields. If nothing detected, return {}.`;

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required.' });

    const res2 = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.HF_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: HF_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user',   content: message },
        ],
        temperature: 0.1,
        max_tokens: 256,
      }),
    });

    if (!res2.ok) { console.error('[AI Parse] HF error:', res2.status); return res.json({ fields: {} }); }

    const json    = await res2.json();
    const content = json.choices?.[0]?.message?.content?.trim() || '';
    const match  = content.match(/\{[\s\S]*\}/);
    let fields   = {};
    try { if (match) fields = JSON.parse(match[0]); } catch { fields = {}; }
    res.json({ fields });
  } catch (err) {
    console.error('[AI Parse] Error:', err.message);
    res.json({ fields: {} });
  }
});

export default router;
