/**
 * ConversationContext — Production-grade conversational state engine.
 *
 * Improvements applied:
 *  1. Confidence-based slot overwrite protection
 *  2. Robust name extraction (lowercase, initials, normalisation)
 *  3. Strict date validation (no JS auto-correction)
 *  4. Intent classification layer (faq | slot_fill | amend | multi_fill)
 *  5. Confidence scoring on all parsed fields
 *  6. Async race-condition lock (isProcessingRef)
 *  7. localStorage persistence across refreshes
 *  8. Expanded category keywords (fuel, petrol, groceries…)
 *  9. Description fallback extraction from remaining text
 * 10. Conversational UX messages
 */
import { createContext, useContext, useReducer, useCallback, useRef, useEffect } from 'react';
import { queryFaq, aiParse } from '../api/client.js';

// ─────────────────────────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────────────────────────

export const SLOT_ORDER = [
  'full_name', 'card_type', 'category', 'amount',
  'description', 'expense_date', 'contact_number', 'email',
];

export const FIELD_LABELS = {
  full_name: 'Full Name', card_type: 'Card Type', category: 'Category',
  amount: 'Amount', description: 'Description', expense_date: 'Expense Date',
  contact_number: 'Mobile Number', email: 'Email',
};

const PROMPTS = {
  full_name:      "What's your full name? (first and last name)",
  card_type:      'Which card type? (Debit Card / Credit Card)',
  category:       'What category? (Transport / Shopping / Food)',
  amount:         'How much did you spend? (e.g. 250 or 1499.50)',
  description:    'Brief description of the expense (max 300 chars).',
  expense_date:   'Date of expense? (DD-MM-YYYY)',
  contact_number: 'Your mobile number with country code? (e.g. +911234567890)',
  email:          'Your email address?',
};

const HINTS = {
  card_type:      'Tip: type "Debit Card" or "Credit Card"',
  category:       'Tip: type "Transport", "Shopping", or "Food"',
  expense_date:   'Tip: use DD-MM-YYYY format, e.g. 05-04-2026',
  contact_number: 'Tip: include country code, e.g. +919876543210',
};

const TASK_OPENERS = {
  create: "I already have your profile details on file.\n\nJust tell me: what category? (Food / Transport / Shopping)",
  view:   "Fetching your expenses now...",
  modify: "Fetching your expenses — you can change the date or delete any of them.",
};

// ─────────────────────────────────────────────────────────────────────────────
// REGEX
// ─────────────────────────────────────────────────────────────────────────────

const RE = {
  date:   /\b(\d{2}-\d{2}-\d{4})\b/,
  email:  /\b([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})\b/,
  phone:  /(\+\d{1,4}\s?\d{10})\b/,
  number: /\b(\d+(?:\.\d{1,2})?)\b/,
  dateV:  /^\d{2}-\d{2}-\d{4}$/,
  phoneV: /^\+\d{1,4}\d{10}$/,
  emailV: /^[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}$/,
  // Name: 2+ words, letters + optional single initial (e.g. "Yogeshwara B")
  name:   /^([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z]\.?){1,4})/,
};

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT KEYWORDS
// ─────────────────────────────────────────────────────────────────────────────

const AMEND_KW = [
  'change', 'update', 'correct', 'actually', 'wrong', 'meant',
  'fix', 'edit', 'modify', 'replace', 'revise', 'oops', 'sorry',
  'no wait', 'not that', 'i made a mistake', 'that was wrong',
  'should be', 'it should', 'make it', 'set it to', 'put it as',
  'i meant', 'instead', 'rather', 'not',
];

const FIELD_ALIASES = {
  full_name:      ['name', 'full name', 'my name', 'called', "i'm", 'i am'],
  card_type:      ['card', 'card type', 'payment'],
  category:       ['category', 'cat', 'type of expense', 'expense type'],
  amount:         ['amount', 'price', 'cost', 'spent', 'paid', 'value', 'rupees', 'rs', '₹'],
  description:    ['description', 'desc', 'note', 'details', 'for', 'about'],
  expense_date:   ['date', 'expense date', 'on', 'dated'],
  contact_number: ['number', 'mobile', 'phone', 'contact', 'cell'],
  email:          ['email', 'mail', 'e-mail'],
};

// ─────────────────────────────────────────────────────────────────────────────
// ENUM NORMALISATION — fuzzy matching
// ─────────────────────────────────────────────────────────────────────────────

function normaliseCardType(text) {
  const t = text.toLowerCase().replace(/[^a-z]/g, '');
  if (/debit/.test(t))  return { value: 'Debit Card',  confidence: /debitcard/.test(t) ? 1.0 : 0.85 };
  if (/credit/.test(t)) return { value: 'Credit Card', confidence: /creditcard/.test(t) ? 1.0 : 0.85 };
  return null;
}

function normaliseCategory(text) {
  const t = text.toLowerCase();
  // Transport — expanded
  if (/transport|travel|cab|uber|ola|metro|bus|train|auto|fuel|petrol|diesel|toll|parking|flight|taxi/.test(t))
    return { value: 'Transport', confidence: 0.9 };
  // Shopping — expanded
  if (/shop|buy|purchase|amazon|flipkart|myntra|cloth|wear|apparel|mall|store|order|product/.test(t))
    return { value: 'Shopping', confidence: 0.9 };
  // Food — expanded
  if (/food|eat|restaurant|swiggy|zomato|lunch|dinner|breakfast|snack|groceries|grocery|cafe|coffee|tea|meal|drink/.test(t))
    return { value: 'Food', confidence: 0.9 };
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NATURAL LANGUAGE DATE PARSER
// Handles: "11th april", "april 11", "11 april 2026", "today", "yesterday"
// Returns DD-MM-YYYY string or null
// ─────────────────────────────────────────────────────────────────────────────

const MONTHS = {
  jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
  jul:7, aug:8, sep:9, oct:10, nov:11, dec:12,
  january:1, february:2, march:3, april:4, june:6,
  july:7, august:8, september:9, october:10, november:11, december:12,
};

function parseNaturalDate(text) {
  const t = text.toLowerCase().replace(/[,]/g, ' ');

  // "today" / "yesterday"
  const now = new Date();
  if (/\btoday\b/.test(t)) return formatDMY(now);
  if (/\byesterday\b/.test(t)) {
    const d = new Date(now); d.setDate(d.getDate() - 1); return formatDMY(d);
  }

  // DD-MM-YYYY already handled by RE.date — skip
  if (RE.dateV.test(t.trim())) return null;

  // "11th april" / "april 11" / "11 april 2026" / "11th april 2026"
  const ordinal = /(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+)(?:\s+(\d{4}))?/;
  const reverse = /([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/;

  let day, monthName, year;

  const m1 = t.match(ordinal);
  const m2 = t.match(reverse);

  if (m1 && MONTHS[m1[2]]) {
    day       = parseInt(m1[1]);
    monthName = m1[2];
    // Use explicit year if provided, otherwise default to current year
    year      = m1[3] ? parseInt(m1[3]) : now.getFullYear();
  } else if (m2 && MONTHS[m2[1]]) {
    day       = parseInt(m2[2]);
    monthName = m2[1];
    year      = m2[3] ? parseInt(m2[3]) : now.getFullYear();
  } else {
    return null;
  }

  const month = MONTHS[monthName];
  if (!month || day < 1 || day > 31) return null;

  const d = new Date(`${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`);
  if (isNaN(d.getTime()) || d.getDate() !== day) return null;

  return formatDMY(d);
}

function formatDMY(d) {
  const dd   = String(d.getDate()).padStart(2, '0');
  const mm   = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function normaliseName(raw) {
  return raw
    .trim()
    .split(/\s+/)
    .map((w) => {
      // Handle initials like "B" or "B."
      if (/^[a-zA-Z]\.?$/.test(w)) return w.toUpperCase().replace('.', '') + '.';
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// STRICT DATE VALIDATION — no JS auto-correction
// ─────────────────────────────────────────────────────────────────────────────

export function validateSlot(field, value) {
  if (value === null || value === undefined || value === '') {
    return `${FIELD_LABELS[field]} is required.`;
  }
  const v = String(value).trim();

  switch (field) {
    case 'full_name':
      return v.split(/\s+/).filter(Boolean).length < 2
        ? 'Please enter your first and last name (at least 2 words).' : null;

    case 'card_type':
      return !['Debit Card', 'Credit Card'].includes(v)
        ? 'Please enter "Debit Card" or "Credit Card".' : null;

    case 'category':
      return !['Transport', 'Shopping', 'Food'].includes(v)
        ? 'Please enter "Transport", "Shopping", or "Food".' : null;

    case 'amount': {
      const n = Number(v);
      return isNaN(n) || n <= 0 ? 'Please enter a positive number (e.g. 250).' : null;
    }

    case 'description':
      return !v ? 'Description cannot be empty.'
        : v.length > 300 ? 'Description must be 300 characters or fewer.' : null;

    case 'expense_date': {
      if (!RE.dateV.test(v)) return 'Use DD-MM-YYYY format — e.g. 05-04-2026.';
      const [dd, mm, yyyy] = v.split('-').map(Number);
      const d = new Date(`${yyyy}-${String(mm).padStart(2,'0')}-${String(dd).padStart(2,'0')}`);
      // Strict check — JS auto-corrects invalid dates (e.g. 32-01-2026 → Feb 1)
      if (
        isNaN(d.getTime()) ||
        d.getFullYear() !== yyyy ||
        d.getMonth() + 1 !== mm ||
        d.getDate() !== dd
      ) return 'That is not a valid calendar date.';
      if (d > new Date()) return 'Date cannot be in the future.';
      return null;
    }

    case 'contact_number':
      return !RE.phoneV.test(v.replace(/\s/g, ''))
        ? 'Enter country code + 10 digits — e.g. +919876543210.' : null;

    case 'email':
      return !RE.emailV.test(v) ? 'Enter a valid email address.' : null;

    default:
      return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// INTENT CLASSIFICATION — cleaner than boolean flags
// Returns: 'amend' | 'multi_fill' | 'slot_fill' | 'faq'
// ─────────────────────────────────────────────────────────────────────────────

function classifyIntent(text, slots) {
  const lower = text.toLowerCase();

  // Amendment keywords present → amend
  if (AMEND_KW.some((kw) => lower.includes(kw))) return 'amend';

  // Parse and count detected fields
  const parsed = parseMessage(text);
  const count  = Object.keys(parsed).length;

  if (count > 1) return 'multi_fill';
  if (count === 1) return 'slot_fill';

  // Nothing parsed — likely FAQ or free text
  return 'faq';
}

// ─────────────────────────────────────────────────────────────────────────────
// CO-REFERENCING — extract multiple fields with confidence scores
// ─────────────────────────────────────────────────────────────────────────────

export function parseMessage(message) {
  const result  = {};   // { field: { value, confidence } }
  let   working = message;

  // ── Email ─────────────────────────────────────────────────────────────────
  const emailM = working.match(RE.email);
  if (emailM) {
    result.email = { value: emailM[1], confidence: 1.0 };
    working = working.replace(emailM[1], ' ');
  }

  // ── Phone ─────────────────────────────────────────────────────────────────
  const phoneM = working.match(RE.phone);
  if (phoneM) {
    result.contact_number = { value: phoneM[1].replace(/\s/g, ''), confidence: 1.0 };
    working = working.replace(phoneM[1], ' ');
  }

  // ── Date ──────────────────────────────────────────────────────────────────
  const dateM = working.match(RE.date);
  if (dateM) {
    result.expense_date = { value: dateM[1], confidence: 1.0 };
    working = working.replace(dateM[1], ' ');
  } else {
    // Try natural language date
    const nlDate = parseNaturalDate(working);
    if (nlDate) {
      result.expense_date = { value: nlDate, confidence: 0.9 };
      // Strip the matched date words from working
      working = working.replace(/(\d{1,2})(?:st|nd|rd|th)?\s+[a-z]+(?:\s+\d{4})?/i, ' ')
                       .replace(/[a-z]+\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+\d{4})?/i, ' ');
    }
  }

  // ── Card type ─────────────────────────────────────────────────────────────
  const cardR = normaliseCardType(working);
  if (cardR) {
    result.card_type = cardR;
    working = working.replace(/debit\s*card|credit\s*card|debit|credit/gi, ' ');
  }

  // ── Category ──────────────────────────────────────────────────────────────
  const catR = normaliseCategory(working);
  if (catR) {
    result.category = catR;
    working = working.replace(
      /transport|travel|cab|uber|ola|metro|bus|train|auto|fuel|petrol|diesel|toll|parking|flight|taxi|shop|buy|purchase|amazon|flipkart|myntra|cloth|wear|apparel|mall|store|order|product|food|eat|restaurant|swiggy|zomato|lunch|dinner|breakfast|snack|groceries|grocery|cafe|coffee|tea|meal|drink/gi,
      ' '
    );
  }

  // ── Amount ────────────────────────────────────────────────────────────────
  const numM = working.match(RE.number);
  if (numM) {
    const n = parseFloat(numM[1]);
    if (n > 0) {
      result.amount = { value: n, confidence: 0.9 };
      working = working.replace(numM[1], ' ');
    }
  }

  // ── Full name — explicit patterns first ───────────────────────────────────
  const namePatterns = [
    /(?:name\s+is|i(?:'m|\s+am)|call\s+me|this\s+is)\s+([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z]\.?){1,4})/i,
    /(?:name\s+is|i(?:'m|\s+am)|call\s+me)\s+([a-z][a-z\s]{2,30})/i,
  ];
  let nameFound = false;
  for (const pat of namePatterns) {
    const m = message.match(pat);
    if (m) {
      result.full_name = { value: normaliseName(m[1]), confidence: 0.95 };
      working = working.replace(m[1], ' ');
      nameFound = true;
      break;
    }
  }

  // ── Full name — fallback: leading proper noun(s) ──────────────────────────
  if (!nameFound) {
    const STOP = new Set([
      'debit','credit','card','transport','shopping','food','travel','cab',
      'uber','ola','metro','bus','train','auto','fuel','petrol','buy','purchase',
      'amazon','flipkart','eat','restaurant','swiggy','zomato','lunch','dinner',
      'breakfast','snack','groceries','grocery','the','and','or','my','is','a',
      'an','for','on','at','in','with','to','from','of','by','as','it','its',
      'hi','hello','hey','please','thanks','ok','okay',
    ]);

    let candidate = working.replace(/[,;|\/\\]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    const leadM   = candidate.match(/^([A-Za-z][a-zA-Z]*(?:\s+[A-Za-z]\.?)*)/);
    if (leadM) {
      const words = leadM[1].trim().split(/\s+/).filter(Boolean);
      const clean = [];
      for (const w of words) {
        if (STOP.has(w.toLowerCase())) break;
        clean.push(w);
      }
      if (clean.length >= 2) {
        result.full_name = { value: normaliseName(clean.join(' ')), confidence: 0.75 };
      }
    }
  }

  // ── Description — remaining meaningful text (fallback) ────────────────────
  // Only extract if no other field consumed the text and it's long enough
  if (!result.description) {
    let remaining = working.replace(/[,;|]/g, ' ').replace(/\s{2,}/g, ' ').trim();
    // Remove name if already extracted
    if (result.full_name) remaining = remaining.replace(result.full_name.value, '').trim();
    if (remaining.length >= 5 && remaining.length <= 300 && !/^\d+$/.test(remaining)) {
      result.description = { value: remaining, confidence: 0.5 };
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// AMENDMENT DETECTION
// ─────────────────────────────────────────────────────────────────────────────

export function detectAmendment(message) {
  const lower = message.toLowerCase();
  if (!AMEND_KW.some((kw) => lower.includes(kw))) return null;

  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    for (const alias of aliases) {
      if (!lower.includes(alias)) continue;
      let value = null;

      if (field === 'card_type') {
        const r = normaliseCardType(message); if (r) value = r.value;
      } else if (field === 'category') {
        const r = normaliseCategory(message); if (r) value = r.value;
      } else if (field === 'expense_date') {
        const m = message.match(RE.date);
        if (m) value = m[1];
        else value = parseNaturalDate(message); // "11th april", "today" etc.
      } else if (field === 'email') {
        const m = message.match(RE.email); if (m) value = m[1];
      } else if (field === 'contact_number') {
        const m = message.match(RE.phone); if (m) value = m[1].replace(/\s/g, '');
      } else if (field === 'amount') {
        const m = message.match(RE.number); if (m) value = parseFloat(m[1]);
      } else if (field === 'full_name') {
        const m = message.match(/(?:to|is|:)\s+([A-Za-z][a-zA-Z\s.]{2,40})/i);
        if (m) value = normaliseName(m[1].trim());
      } else if (field === 'description') {
        const m = message.match(/(?:to|is|:)\s+(.{3,300})/i);
        if (m) value = m[1].trim();
      }

      if (value !== null) return { field, value };
    }
  }
  // Also try natural language date amendment without explicit field alias
  // e.g. "it should be 11th april" — no field alias but clear date intent
  const nlDate = parseNaturalDate(message);
  if (nlDate && AMEND_KW.some((kw) => lower.includes(kw))) {
    return { field: 'expense_date', value: nlDate };
  }

  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function emptySlots() {
  return {
    full_name: null, card_type: null, category: null, amount: null,
    description: null, expense_date: null, contact_number: null, email: null,
  };
}

function promptFor(field) {
  const hint = HINTS[field] ? `\n${HINTS[field]}` : '';
  return PROMPTS[field] + hint;
}

/** Extract plain value from a confidence-scored result entry. */
function val(entry) {
  return entry && typeof entry === 'object' && 'value' in entry ? entry.value : entry;
}

/** Confidence threshold — only accept parsed fields above this. */
const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Determine if a parsed field should overwrite an already-filled slot.
 * Allows implicit correction when user sends a single-field message
 * that clearly targets the most recently filled slot.
 */
function isLikelyOverride(field, entry, currentSlots) {
  if (currentSlots[field] === null) return true; // slot empty — always fill
  const confidence = entry?.confidence ?? 1.0;
  // High-confidence single-field messages can overwrite
  return confidence >= 0.9;
}

// Conversational acknowledgement messages
const FILL_ACK = [
  (fields) => `Nice — I've captured your ${fields}.`,
  (fields) => `Got it! ${fields} noted.`,
  (fields) => `Perfect, ${fields} saved.`,
  (fields) => `Thanks — ${fields} recorded.`,
];
function ackMessage(filledLabels) {
  const idx = Math.floor(Math.random() * FILL_ACK.length);
  return FILL_ACK[idx](filledLabels.join(' and '));
}

// ─────────────────────────────────────────────────────────────────────────────
// REDUCER
// ─────────────────────────────────────────────────────────────────────────────

const initialState = {
  messages:    [],
  currentTask: null,
  slots:       emptySlots(),
  isLoading:   false,
  turnCount:   0,
  aiMode:      false,  // false = rule-based, true = AI (OpenRouter)
};

function reducer(state, action) {
  switch (action.type) {
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages:  [...state.messages, action.payload],
        turnCount: state.turnCount + (action.payload.role === 'user' ? 1 : 0),
      };
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };
    case 'SET_TASK':
      return {
        ...state,
        currentTask: action.payload,
        slots:       emptySlots(),
        turnCount:   0,
        messages:    action.opener
          ? [{ role: 'bot', text: action.opener, timestamp: new Date() }]
          : [],
      };
    case 'FILL_SLOTS':
      return { ...state, slots: { ...state.slots, ...action.payload } };
    case 'SET_SLOT':
      return { ...state, slots: { ...state.slots, [action.field]: action.value } };
    case 'RESET':
      return { ...initialState, aiMode: state.aiMode };
    case 'TOGGLE_AI':
      return { ...state, aiMode: !state.aiMode };
    default:
      return state;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CONTEXT
// ─────────────────────────────────────────────────────────────────────────────

const ConversationContext = createContext(null);

const STORAGE_KEY = 'ps3_conversation';

export function ConversationProvider({ children }) {
  // Rehydrate from localStorage on first load
  const saved = (() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();

  const [state, dispatch] = useReducer(reducer, saved || initialState);
  const { messages, currentTask, slots, isLoading, aiMode } = state;

  // Persist state to localStorage on every change
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* quota exceeded — ignore */ }
  }, [state]);

  // Ref-based slot access — avoids stale closures in async callbacks
  const slotsRef       = useRef(slots);
  slotsRef.current     = slots;

  // Race-condition lock — prevents overlapping async message handlers
  const isProcessingRef = useRef(false);

  const addMessage = useCallback((role, text) => {
    dispatch({ type: 'ADD_MESSAGE', payload: { role, text, timestamp: new Date() } });
  }, []);

  const setTask = useCallback((taskName) => {
    dispatch({ type: 'SET_TASK', payload: taskName, opener: TASK_OPENERS[taskName] || null });
  }, []);

  const resetConversation = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    dispatch({ type: 'RESET' });
  }, []);

  const setSlots = useCallback((updater) => {
    if (typeof updater === 'function') {
      dispatch({ type: 'FILL_SLOTS', payload: updater(slotsRef.current) });
    } else {
      dispatch({ type: 'FILL_SLOTS', payload: updater });
    }
  }, []);

  const toggleAiMode = useCallback(() => {
    dispatch({ type: 'TOGGLE_AI' });
  }, []);

  const sendUserMessage = useCallback(async (text) => {
    // ── Race-condition guard ────────────────────────────────────────────────
    if (isProcessingRef.current) return { complete: false };
    isProcessingRef.current = true;

    addMessage('user', text);
    dispatch({ type: 'SET_LOADING', payload: true });

    try {
      const currentSlots = slotsRef.current;
      const nextField    = SLOT_ORDER.find((s) => currentSlots[s] === null);
      const allFilled    = !nextField;

      // ── Intent classification ───────────────────────────────────────────
      const intent = classifyIntent(text, currentSlots);

      // ── AMEND ──────────────────────────────────────────────────────────
      if (intent === 'amend') {
        const amendment = detectAmendment(text);
        if (amendment) {
          const label = FIELD_LABELS[amendment.field];
          dispatch({ type: 'SET_SLOT', field: amendment.field, value: amendment.value });
          addMessage('bot', `Got it — I've updated ${label} to "${amendment.value}". Here's your updated summary:`);
          dispatch({ type: 'SET_LOADING', payload: false });
          isProcessingRef.current = false;
          return { complete: false, amendment: true };
        }
      }

      // ── FAQ ────────────────────────────────────────────────────────────
      if (intent === 'faq' || allFilled) {
        const faqRes = await queryFaq(text);
        if (faqRes.answer) {
          addMessage('bot', faqRes.answer);
          dispatch({ type: 'SET_LOADING', payload: false });
          isProcessingRef.current = false;
          return { complete: false };
        }
        // If no FAQ match and all slots filled, nothing to do
        if (allFilled) {
          dispatch({ type: 'SET_LOADING', payload: false });
          isProcessingRef.current = false;
          return { complete: false };
        }
      }

      // ── Parse fields ────────────────────────────────────────────────────
      // AI mode: call OpenRouter via backend; Rule mode: local regex NLP
      let parsed = {};
      if (state.aiMode) {
        try {
          const aiRes = await aiParse(text);
          // Convert flat AI response to confidence-scored format
          for (const [field, value] of Object.entries(aiRes.fields || {})) {
            if (value !== null && value !== undefined && value !== '') {
              parsed[field] = { value, confidence: 0.95 };
            }
          }
        } catch {
          // AI failed — fall back to rule-based silently
          parsed = parseMessage(text);
        }
      } else {
        parsed = parseMessage(text);
      }
      const parsedFields = Object.keys(parsed);
      const updatedSlots = { ...currentSlots };

      // ── MULTI_FILL / SLOT_FILL ──────────────────────────────────────────
      const justFilled = [];

      if (parsedFields.length > 0) {
        for (const field of parsedFields) {
          const entry      = parsed[field];
          const confidence = entry?.confidence ?? 1.0;
          if (confidence < CONFIDENCE_THRESHOLD) continue;

          const rawVal = val(entry);
          if (rawVal === null || rawVal === undefined) continue;

          // Confidence-based overwrite protection
          if (!isLikelyOverride(field, entry, updatedSlots)) continue;

          // Validate before storing
          const err = validateSlot(field, rawVal);
          if (!err) {
            updatedSlots[field] = rawVal;
            justFilled.push(field);
          }
        }
      }

      // If nothing was filled from parsing, treat as single-slot fill
      if (justFilled.length === 0 && nextField) {
        // Normalise enum values
        let normVal = text.trim();
        const cardR = normaliseCardType(normVal);
        const catR  = normaliseCategory(normVal);
        if (nextField === 'card_type' && cardR) normVal = cardR.value;
        else if (nextField === 'category' && catR) normVal = catR.value;
        else if (nextField === 'full_name') normVal = normaliseName(normVal);

        const err = validateSlot(nextField, normVal);
        if (err) {
          addMessage('bot', `⚠️ ${err}`);
          addMessage('bot', promptFor(nextField));
          dispatch({ type: 'SET_LOADING', payload: false });
          isProcessingRef.current = false;
          return { complete: false };
        }
        updatedSlots[nextField] = normVal;
        justFilled.push(nextField);
      }

      dispatch({ type: 'FILL_SLOTS', payload: updatedSlots });

      // ── Completion check ────────────────────────────────────────────────
      const complete = SLOT_ORDER.every((s) => updatedSlots[s] !== null);
      if (complete) {
        const firstName = updatedSlots.full_name?.split(' ')[0] || 'there';
        addMessage('bot', `Great, ${firstName}! I have everything I need. Please review your expense below and confirm.`);
        dispatch({ type: 'SET_LOADING', payload: false });
        isProcessingRef.current = false;
        return { complete: true, updatedSlots };
      }

      // ── Acknowledge multi-fill + prompt next ────────────────────────────
      if (justFilled.length > 1) {
        const labels = justFilled.map((f) => FIELD_LABELS[f]);
        addMessage('bot', ackMessage(labels));
      }

      const nextEmpty = SLOT_ORDER.find((s) => updatedSlots[s] === null);
      addMessage('bot', promptFor(nextEmpty));
      dispatch({ type: 'SET_LOADING', payload: false });
      isProcessingRef.current = false;
      return { complete: false, updatedSlots };

    } catch (err) {
      addMessage('bot', `Something went wrong: ${err.message}`);
      dispatch({ type: 'SET_LOADING', payload: false });
      isProcessingRef.current = false;
      return { complete: false };
    }
  }, [addMessage]);

  return (
    <ConversationContext.Provider value={{
      messages, currentTask, slots, isLoading, aiMode,
      addMessage, sendUserMessage, setTask, resetConversation, setSlots,
      toggleAiMode, FIELD_LABELS, SLOT_ORDER,
    }}>
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversation() {
  const ctx = useContext(ConversationContext);
  if (!ctx) throw new Error('useConversation must be used inside ConversationProvider');
  return ctx;
}
