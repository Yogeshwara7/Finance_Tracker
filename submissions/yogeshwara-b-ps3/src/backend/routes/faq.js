import { Router } from 'express';

const router = Router();

// FAQ knowledge base — keyword → answer (at least 5 required by spec)
const FAQ = [
  { keyword: 'categor', answer: 'Supported categories are: Transport, Shopping, and Food.' },
  { keyword: 'card',    answer: 'Accepted card types: Debit Card or Credit Card.' },
  { keyword: 'date',    answer: 'Use DD-MM-YYYY format — e.g. 05-04-2026.' },
  { keyword: 'delete',  answer: "Choose 'Modify / Delete Expense' from the menu, then enter your mobile number." },
  { keyword: 'secure',  answer: 'Your data is stored securely in Supabase and never shared.' },
  { keyword: 'amount',  answer: 'Enter any positive number — e.g. 250 or 1499.50. No currency symbol needed.' },
  { keyword: 'contact', answer: 'Enter your mobile number with country code — e.g. +919876543210.' },
  { keyword: 'email',   answer: 'Enter a valid email address — e.g. name@example.com.' },
];

// ── POST /api/faq ─────────────────────────────────────────────────────────────
router.post('/', (req, res) => {
  const { query } = req.body;

  if (!query || typeof query !== 'string') {
    return res.status(400).json({ error: 'query string is required.' });
  }

  const lower  = query.toLowerCase();
  const match  = FAQ.find((f) => lower.includes(f.keyword));

  res.json({ answer: match ? match.answer : null });
});

export default router;
