import { Router } from 'express';
import { supabase } from '../server.js';
import { validateExpense } from '../middleware/validate.js';
import { sendExpenseConfirmation } from '../utils/mailer.js';

const router = Router();

// ── POST /api/expenses ────────────────────────────────────────────────────────
router.post('/', validateExpense, async (req, res, next) => {
  try {
    const {
      full_name, card_type, category, amount,
      description, contact_number, email,
      _expense_date_iso, // set by validateExpense
    } = req.body;

    const { data, error } = await supabase
      .from('expenses')
      .insert({
        full_name,
        card_type,
        category,
        amount: Number(amount),
        description,
        expense_date: _expense_date_iso,
        contact_number,
        email,
      })
      .select('*')
      .single();

    if (error) throw error;

    // Fire-and-forget confirmation email — never blocks the response
    sendExpenseConfirmation(data);

    res.status(201).json({ id: data.id, message: 'Expense recorded successfully.' });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/expenses?contact= ────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { contact } = req.query;

    if (!contact) {
      return res.status(400).json({ error: 'contact query parameter is required.' });
    }

    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('contact_number', contact)
      .order('expense_date', { ascending: false });

    if (error) throw error;

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/expenses/:id ─────────────────────────────────────────────────────
router.get('/:id', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('expenses')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/expenses/:id — update expense_date only ─────────────────────────
router.put('/:id', async (req, res, next) => {
  try {
    const { expense_date } = req.body;

    if (!expense_date) {
      return res.status(400).json({ error: 'expense_date is required.' });
    }

    // Accept both DD-MM-YYYY and ISO formats
    let isoDate = expense_date;
    if (/^\d{2}-\d{2}-\d{4}$/.test(expense_date)) {
      const [dd, mm, yyyy] = expense_date.split('-');
      isoDate = `${yyyy}-${mm}-${dd}`;
    }

    const parsed = new Date(isoDate);
    if (isNaN(parsed.getTime())) {
      return res.status(400).json({ error: 'Invalid date format. Use DD-MM-YYYY.' });
    }
    if (parsed > new Date()) {
      return res.status(400).json({ error: 'expense_date cannot be in the future.' });
    }

    const { data, error } = await supabase
      .from('expenses')
      .update({ expense_date: isoDate })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Expense not found.' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/expenses/:id ──────────────────────────────────────────────────
router.delete('/:id', async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('expenses')
      .delete()
      .eq('id', req.params.id);

    if (error) throw error;

    res.json({ success: true, deleted_id: req.params.id });
  } catch (err) {
    next(err);
  }
});

export default router;
