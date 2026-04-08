import { Router } from 'express';
import { supabase } from '../server.js';

const router = Router();

/**
 * Returns the ISO start date string for a given period.
 * period: 'this_month' | 'last_month' | 'last_3_months' | 'last_6_months' | 'all'
 */
function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'this_month':
      return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    case 'last_month': {
      const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return d.toISOString().split('T')[0];
    }
    case 'last_3_months': {
      const d = new Date(now.getFullYear(), now.getMonth() - 2, 1);
      return d.toISOString().split('T')[0];
    }
    case 'last_6_months': {
      const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      return d.toISOString().split('T')[0];
    }
    default: // 'all'
      return null;
  }
}

function getPeriodEnd(period) {
  const now = new Date();
  if (period === 'last_month') {
    // End of last month
    return new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
  }
  return now.toISOString().split('T')[0]; // today
}

// ── GET /api/analytics?contact=&period= ──────────────────────────────────────
router.get('/', async (req, res, next) => {
  try {
    const { contact, period = 'this_month' } = req.query;

    if (!contact) {
      return res.status(400).json({ error: 'contact query parameter is required.' });
    }

    const periodStart = getPeriodStart(period);
    const periodEnd   = getPeriodEnd(period);

    // Build query — filter by date range if period is not 'all'
    let query = supabase
      .from('expenses')
      .select('*')
      .eq('contact_number', contact)
      .order('expense_date', { ascending: false });

    if (periodStart) query = query.gte('expense_date', periodStart);
    if (period !== 'all') query = query.lte('expense_date', periodEnd);

    const { data, error } = await query;
    if (error) throw error;

    // by_category totals
    const by_category = { Transport: 0, Shopping: 0, Food: 0 };
    for (const exp of data) {
      if (by_category[exp.category] !== undefined) {
        by_category[exp.category] += Number(exp.amount);
      }
    }

    // period total
    const period_total = data.reduce((sum, exp) => sum + Number(exp.amount), 0);

    // last 5 in the selected period
    const last_5 = data.slice(0, 5);

    res.json({ by_category, monthly_total: period_total, last_5, period, periodStart, periodEnd });
  } catch (err) {
    next(err);
  }
});

export default router;
