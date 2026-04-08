/**
 * DialogEngine — manages the slot-filling conversation state for creating
 * an expense record through a guided chat flow.
 */

const SLOT_ORDER = [
  'full_name',
  'card_type',
  'category',
  'amount',
  'description',
  'expense_date',
  'contact_number',
  'email',
];

const PROMPTS = {
  full_name:      "What's your full name? (first and last name)",
  card_type:      'Which card type are you using? (Debit Card / Credit Card)',
  category:       'What category does this expense fall under? (Transport / Shopping / Food)',
  amount:         'How much did you spend? (enter a number)',
  description:    'Give a brief description of the expense (max 300 characters).',
  expense_date:   'What was the date of the expense? (DD-MM-YYYY)',
  contact_number: 'What is your mobile number with country code? (e.g. +911234567890)',
  email:          'What is your email address?',
};

const FIELD_LABELS = {
  full_name:      'Full Name',
  card_type:      'Card Type',
  category:       'Category',
  amount:         'Amount',
  description:    'Description',
  expense_date:   'Expense Date',
  contact_number: 'Mobile Number',
  email:          'Email',
};

class DialogEngine {
  constructor() {
    this.slots = this._emptySlots();
  }

  _emptySlots() {
    return {
      full_name:      null,
      card_type:      null,
      category:       null,
      amount:         null,
      description:    null,
      expense_date:   null,
      contact_number: null,
      email:          null,
    };
  }

  /** Returns the prompt for the next unfilled slot, or null if complete. */
  getNextPrompt() {
    const next = SLOT_ORDER.find((s) => this.slots[s] === null);
    return next ? PROMPTS[next] : null;
  }

  /** Returns the field key of the next unfilled slot. */
  getNextField() {
    return SLOT_ORDER.find((s) => this.slots[s] === null) || null;
  }

  /** Fill a single slot. */
  fillSlot(field, value) {
    if (field in this.slots) {
      this.slots[field] = value;
    }
  }

  /** Returns true when every slot has a value. */
  isComplete() {
    return SLOT_ORDER.every((s) => this.slots[s] !== null);
  }

  /** Clears all slots. */
  reset() {
    this.slots = this._emptySlots();
  }

  /**
   * Update a specific slot mid-conversation and return a confirmation message.
   * @param {string} field
   * @param {*} value
   * @returns {string} confirmation message
   */
  amendSlot(field, value) {
    if (!(field in this.slots)) {
      return `I don't recognise the field "${field}".`;
    }
    this.slots[field] = value;
    const label = FIELD_LABELS[field] || field;
    return `Got it — I've updated ${label} to "${value}".`;
  }

  /** Human-readable label for a field key. */
  getLabel(field) {
    return FIELD_LABELS[field] || field;
  }
}

// Export a singleton so all routes share the same instance per process.
// In a multi-user scenario you would key instances by session/user ID.
export default new DialogEngine();
export { DialogEngine, SLOT_ORDER, PROMPTS, FIELD_LABELS };
