/**
 * validateExpense — request body validation middleware for POST /api/expenses.
 * Collects all field errors and returns them together so the client can
 * surface every problem in one round-trip.
 */

const CARD_TYPES = ['Debit Card', 'Credit Card'];
const CATEGORIES = ['Transport', 'Shopping', 'Food'];
const DATE_RE    = /^\d{2}-\d{2}-\d{4}$/;
const PHONE_RE   = /^\+\d{1,4}\d{10}$/;
const EMAIL_RE   = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Convert DD-MM-YYYY → YYYY-MM-DD (ISO) for Postgres DATE column.
 * Returns null if the string doesn't match the expected pattern.
 */
export function toISODate(ddmmyyyy) {
  if (!DATE_RE.test(ddmmyyyy)) return null;
  const [dd, mm, yyyy] = ddmmyyyy.split('-');
  return `${yyyy}-${mm}-${dd}`;
}

export function validateExpense(req, res, next) {
  const errors = [];
  const {
    full_name,
    card_type,
    category,
    amount,
    description,
    expense_date,
    contact_number,
    email,
  } = req.body;

  // full_name — at least 2 words
  if (!full_name || full_name.trim().split(/\s+/).length < 2) {
    errors.push({ field: 'full_name', message: 'Please provide your first and last name.' });
  }

  // card_type
  if (!CARD_TYPES.includes(card_type)) {
    errors.push({ field: 'card_type', message: `card_type must be one of: ${CARD_TYPES.join(', ')}.` });
  }

  // category
  if (!CATEGORIES.includes(category)) {
    errors.push({ field: 'category', message: `category must be one of: ${CATEGORIES.join(', ')}.` });
  }

  // amount — positive number
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) {
    errors.push({ field: 'amount', message: 'amount must be a positive number.' });
  }

  // description — non-empty, max 300 chars
  if (!description || typeof description !== 'string' || description.trim().length === 0) {
    errors.push({ field: 'description', message: 'description cannot be empty.' });
  } else if (description.length > 300) {
    errors.push({ field: 'description', message: 'description must be 300 characters or fewer.' });
  }

  // expense_date — DD-MM-YYYY, not in the future
  if (!DATE_RE.test(expense_date)) {
    errors.push({ field: 'expense_date', message: 'expense_date must be in DD-MM-YYYY format.' });
  } else {
    const iso = toISODate(expense_date);
    const parsed = new Date(iso);
    if (isNaN(parsed.getTime())) {
      errors.push({ field: 'expense_date', message: 'expense_date is not a valid calendar date.' });
    } else if (parsed > new Date()) {
      errors.push({ field: 'expense_date', message: 'expense_date cannot be in the future.' });
    } else {
      // Attach converted ISO date so the route handler doesn't need to redo it
      req.body._expense_date_iso = iso;
    }
  }

  // contact_number — +<country code><10 digits>
  if (!PHONE_RE.test(contact_number)) {
    errors.push({
      field: 'contact_number',
      message: 'contact_number must include country code followed by 10 digits (e.g. +911234567890).',
    });
  }

  // email
  if (!EMAIL_RE.test(email)) {
    errors.push({ field: 'email', message: 'Please provide a valid email address.' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
}
