/**
 * nlpParser — lightweight NLP helpers for co-referencing and amendment detection.
 * No external NLP library required; uses regex and keyword matching.
 */

const DATE_RE    = /\b(\d{2}-\d{2}-\d{4})\b/;
const EMAIL_RE   = /\b([^\s@]+@[^\s@]+\.[^\s@]+)\b/;
const PHONE_RE   = /(\+\d{1,4}\d{10})\b/;
const NUMBER_RE  = /\b(\d+(?:\.\d+)?)\b/;

const AMENDMENT_KEYWORDS = [
  'change', 'update', 'correct', 'actually', 'wrong', 'meant',
  'fix', 'edit', 'modify', 'replace', 'revise', 'oops', 'sorry',
  'no wait', 'not that', 'i made a mistake', 'that was wrong',
  'should be', 'it should', 'make it', 'set it to', 'put it as',
];

const FIELD_ALIASES = {
  full_name:      ['name', 'full name', 'my name'],
  card_type:      ['card', 'card type'],
  category:       ['category', 'cat'],
  amount:         ['amount', 'price', 'cost', 'spent'],
  description:    ['description', 'desc', 'note'],
  expense_date:   ['date', 'expense date'],
  contact_number: ['number', 'mobile', 'phone', 'contact'],
  email:          ['email', 'mail'],
};

/**
 * Attempt to extract multiple fields from a single free-text message.
 * Returns an object containing only the fields that were detected.
 *
 * @param {string} message
 * @returns {Partial<Record<string, string|number>>}
 */
export function parseMessage(message) {
  const lower   = message.toLowerCase();
  const result  = {};

  // ── full_name — "name is <words>" ─────────────────────────────────────────
  const nameMatch = lower.match(/(?:name is|i(?:'m| am))\s+([a-z]+(?: [a-z]+)+)/i);
  if (nameMatch) {
    // Preserve original casing from the raw message
    const startIdx = message.toLowerCase().indexOf(nameMatch[1]);
    result.full_name = message.slice(startIdx, startIdx + nameMatch[1].length).trim();
  }

  // ── card_type ─────────────────────────────────────────────────────────────
  if (lower.includes('debit card'))        result.card_type = 'Debit Card';
  else if (lower.includes('credit card'))  result.card_type = 'Credit Card';

  // ── category ──────────────────────────────────────────────────────────────
  if (lower.includes('transport'))       result.category = 'Transport';
  else if (lower.includes('shopping'))   result.category = 'Shopping';
  else if (lower.includes('food'))       result.category = 'Food';

  // ── expense_date — DD-MM-YYYY ─────────────────────────────────────────────
  const dateMatch = message.match(DATE_RE);
  if (dateMatch) result.expense_date = dateMatch[1];

  // ── email ─────────────────────────────────────────────────────────────────
  const emailMatch = message.match(EMAIL_RE);
  if (emailMatch) result.email = emailMatch[1];

  // ── contact_number ────────────────────────────────────────────────────────
  const phoneMatch = message.match(PHONE_RE);
  if (phoneMatch) result.contact_number = phoneMatch[1];

  // ── amount — standalone number (only if no date/phone already consumed it) ─
  // Strip already-matched tokens to avoid false positives
  let stripped = message;
  if (dateMatch)  stripped = stripped.replace(dateMatch[1], '');
  if (phoneMatch) stripped = stripped.replace(phoneMatch[1], '');

  const numMatch = stripped.match(NUMBER_RE);
  if (numMatch && !result.amount) {
    result.amount = parseFloat(numMatch[1]);
  }

  return result;
}

/**
 * Detect amendment intent in a message.
 * Returns { field, value } if an amendment is found, otherwise null.
 *
 * @param {string} message
 * @returns {{ field: string, value: string } | null}
 */
export function detectAmendment(message) {
  const lower = message.toLowerCase();

  // Must contain at least one amendment keyword
  const hasKeyword = AMENDMENT_KEYWORDS.some((kw) => lower.includes(kw));
  if (!hasKeyword) return null;

  // Try to identify which field is being amended
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias)) {
        // Extract the new value depending on field type
        let value = null;

        if (field === 'card_type') {
          if (lower.includes('debit'))        value = 'Debit Card';
          else if (lower.includes('credit'))  value = 'Credit Card';
        } else if (field === 'category') {
          if (lower.includes('transport'))    value = 'Transport';
          else if (lower.includes('shopping'))value = 'Shopping';
          else if (lower.includes('food'))    value = 'Food';
        } else if (field === 'expense_date') {
          const m = message.match(DATE_RE);
          if (m) value = m[1];
        } else if (field === 'email') {
          const m = message.match(EMAIL_RE);
          if (m) value = m[1];
        } else if (field === 'contact_number') {
          const m = message.match(PHONE_RE);
          if (m) value = m[1];
        } else if (field === 'amount') {
          const m = message.match(NUMBER_RE);
          if (m) value = parseFloat(m[1]);
        } else {
          // full_name, description — grab everything after "is" / "to"
          const afterIs = lower.match(/(?:is|to)\s+(.+)/);
          if (afterIs) {
            const raw = message.slice(message.toLowerCase().indexOf(afterIs[1]));
            value = raw.trim();
          }
        }

        if (value !== null) return { field, value };
      }
    }
  }

  return null;
}
