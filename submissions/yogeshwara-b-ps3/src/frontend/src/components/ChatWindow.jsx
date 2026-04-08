/**
 * ChatWindow — full conversational UI.
 *
 * Handles:
 *  • Create flow  — slot-filling → confirmation summary → POST
 *  • View flow    — contact lookup → expense list → re-entry on wrong number
 *  • Modify flow  — contact lookup → expense list → Change Date (PUT) or Delete (DELETE)
 *                   with confirmation dialog before destructive actions
 *  • Entity amendment via Edit buttons and inline "actually…" messages
 *  • API failure with Retry / Cancel buttons
 *  • Inline validation re-prompt without losing filled slots
 */
import { useState, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext.jsx';
import MessageBubble from './MessageBubble.jsx';
import {
  createExpense,
  getExpensesByContact,
  updateExpenseDate,
  deleteExpense,
} from '../api/client.js';

// ── Helpers ───────────────────────────────────────────────────────────────────
const DATE_RE  = /^\d{2}-\d{2}-\d{4}$/;
const PHONE_RE = /^\+\d{1,4}\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validate a single slot value; returns an error string or null. */
function validateSlot(field, value) {
  switch (field) {
    case 'full_name':
      return value.trim().split(/\s+/).length < 2
        ? 'Please enter your first and last name (at least 2 words).'
        : null;
    case 'card_type':
      return !['Debit Card', 'Credit Card'].includes(value)
        ? 'Please type exactly "Debit Card" or "Credit Card".'
        : null;
    case 'category':
      return !['Transport', 'Shopping', 'Food'].includes(value)
        ? 'Please type exactly "Transport", "Shopping", or "Food".'
        : null;
    case 'amount': {
      const n = Number(value);
      return isNaN(n) || n <= 0 ? 'Please enter a positive number (e.g. 250).' : null;
    }
    case 'description':
      return !value.trim()
        ? 'Description cannot be empty.'
        : value.length > 300
        ? 'Description must be 300 characters or fewer.'
        : null;
    case 'expense_date':
      if (!DATE_RE.test(value)) return 'Use DD-MM-YYYY format — e.g. 05-04-2026.';
      {
        const [dd, mm, yyyy] = value.split('-');
        const d = new Date(`${yyyy}-${mm}-${dd}`);
        if (isNaN(d.getTime())) return 'That date is not valid.';
        if (d > new Date()) return 'Date cannot be in the future.';
      }
      return null;
    case 'contact_number':
      return !PHONE_RE.test(value)
        ? 'Enter country code + 10 digits — e.g. +919876543210.'
        : null;
    case 'email':
      return !EMAIL_RE.test(value) ? 'Enter a valid email address.' : null;
    default:
      return null;
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm flex gap-1 items-center">
        <span className="w-2 h-2 bg-gray-400 rounded-full dot-1 inline-block" />
        <span className="w-2 h-2 bg-gray-400 rounded-full dot-2 inline-block" />
        <span className="w-2 h-2 bg-gray-400 rounded-full dot-3 inline-block" />
      </div>
    </div>
  );
}

function SummaryCard({ slots, labels, onEdit, onConfirm, submitting, submitError, onRetry, onCancel }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 my-3 shadow-sm">
      <p className="text-sm font-semibold text-blue-700 mb-3">Review your expense</p>
      <table className="w-full text-sm mb-4">
        <tbody>
          {Object.entries(slots).map(([field, value]) => (
            <tr key={field} className="border-b border-blue-100 last:border-0">
              <td className="py-1.5 text-gray-500 w-1/3">{labels[field]}</td>
              <td className="py-1.5 text-gray-800 font-medium">{String(value)}</td>
              <td className="py-1.5 text-right">
                <button onClick={() => onEdit(field)} className="text-xs text-blue-600 hover:underline">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {submitError && <p className="text-sm text-red-600 mb-3">{submitError}</p>}

      {submitError ? (
        <div className="flex gap-2">
          <button onClick={onRetry}  className="flex-1 bg-blue-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-blue-700 transition">Retry</button>
          <button onClick={onCancel} className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-300 transition">Cancel</button>
        </div>
      ) : (
        <button onClick={onConfirm} disabled={submitting}
          className="w-full bg-blue-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
          {submitting ? 'Saving…' : 'Confirm & Submit'}
        </button>
      )}
    </div>
  );
}

/** Delete confirmation dialog rendered inline in the chat. */
function DeleteConfirm({ expense, onConfirm, onCancel }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 my-3 shadow-sm">
      <p className="text-sm font-semibold text-red-700 mb-2">Confirm Delete</p>
      <p className="text-sm text-gray-700 mb-4">
        Delete <span className="font-medium">{expense.category}</span> — ₹{Number(expense.amount).toLocaleString('en-IN')} on {expense.expense_date}?
        <br /><span className="text-xs text-gray-400">This cannot be undone.</span>
      </p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="flex-1 bg-red-600 text-white py-2 rounded-xl text-sm font-medium hover:bg-red-700 transition">Yes, Delete</button>
        <button onClick={onCancel}  className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-xl text-sm font-medium hover:bg-gray-300 transition">Cancel</button>
      </div>
    </div>
  );
}

/** Expense list used in both View and Modify flows. */
function ExpenseList({ expenses, mode, onDelete, onUpdateDate, onRetryContact }) {
  const [editingId,    setEditingId]    = useState(null);
  const [newDate,      setNewDate]      = useState('');
  const [dateError,    setDateError]    = useState('');
  const [confirmingId, setConfirmingId] = useState(null); // id pending delete confirm
  const [actionMsg,    setActionMsg]    = useState('');

  if (!expenses.length) {
    return (
      <div className="my-3 space-y-2">
        <p className="text-sm text-gray-500">
          No expenses found for that number. Please check and try again.
        </p>
        <button
          onClick={onRetryContact}
          className="text-sm text-blue-600 hover:underline"
        >
          Enter a different number →
        </button>
      </div>
    );
  }

  const handleSave = async (id) => {
    if (!newDate) { setDateError('Please pick a date.'); return; }
    // Convert YYYY-MM-DD (native picker) → DD-MM-YYYY (backend format)
    const [yyyy, mm, dd] = newDate.split('-');
    const ddmmyyyy = `${dd}-${mm}-${yyyy}`;
    const err = validateSlot('expense_date', ddmmyyyy);
    if (err) { setDateError(err); return; }
    try {
      await onUpdateDate(id, ddmmyyyy);
      setEditingId(null);
      setDateError('');
      setActionMsg('Date updated successfully.');
    } catch (e) { setDateError(e.message); }
  };

  return (
    <div className="my-3 space-y-2">
      {actionMsg && <p className="text-xs text-green-600 mb-1">{actionMsg}</p>}

      {expenses.map((exp) => (
        <div key={exp.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm">
          {/* Delete confirmation overlay */}
          {confirmingId === exp.id ? (
            <DeleteConfirm
              expense={exp}
              onConfirm={async () => {
                try {
                  await onDelete(exp.id);
                  setConfirmingId(null);
                  setActionMsg('Expense deleted.');
                } catch (e) { setActionMsg(e.message); }
              }}
              onCancel={() => setConfirmingId(null)}
            />
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-800">
                    {exp.category} — ₹{Number(exp.amount).toLocaleString('en-IN')}
                  </p>
                  <p className="text-gray-500 text-xs">{exp.expense_date} · {exp.description}</p>
                  <p className="text-gray-400 text-xs mt-0.5">{exp.card_type} · {exp.full_name}</p>
                </div>

                {mode === 'modify' && (
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button
                      onClick={() => { setEditingId(exp.id); setNewDate(''); setDateError(''); }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Change Date
                    </button>
                    <button
                      onClick={() => setConfirmingId(exp.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {editingId === exp.id && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-2 items-center">
                    {/* Native calendar picker — value is YYYY-MM-DD internally */}
                    <input
                      type="date"
                      max={new Date().toISOString().split('T')[0]}
                      value={newDate}
                      onChange={(e) => { setNewDate(e.target.value); setDateError(''); }}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 cursor-pointer"
                    />
                    <button onClick={() => handleSave(exp.id)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg">Save</button>
                    <button onClick={() => { setEditingId(null); setDateError(''); }} className="text-xs text-gray-500 hover:underline">Cancel</button>
                  </div>
                  {dateError && <p className="text-xs text-red-500">{dateError}</p>}
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Main ChatWindow ───────────────────────────────────────────────────────────
export default function ChatWindow() {
  const {
    messages, currentTask, slots, isLoading,
    addMessage, sendUserMessage, setSlots, resetConversation,
    FIELD_LABELS, SLOT_ORDER,
  } = useConversation();

  const [input,        setInput]        = useState('');
  const [showSummary,  setShowSummary]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [expenses,     setExpenses]     = useState(null);   // null = not yet fetched
  const [editingField, setEditingField] = useState(null);   // field being amended via Edit btn
  const [awaitingContact, setAwaitingContact] = useState(false); // re-entry mode
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, showSummary, expenses]);

  // ── Fetch expenses by contact ───────────────────────────────────────────────
  const fetchExpenses = async (contact) => {
    addMessage('user', contact);
    try {
      const data = await getExpensesByContact(contact);
      setExpenses(data);
      setAwaitingContact(false);
      if (data.length === 0) {
        addMessage('bot', 'No expenses found for that number.');
      } else {
        const verb = currentTask === 'modify' ? 'modify or delete' : 'view';
        addMessage('bot', `Found ${data.length} expense(s). You can ${verb} them below.`);
      }
    } catch (e) {
      addMessage('bot', `Could not fetch expenses: ${e.message}`);
      setAwaitingContact(true);
    }
  };

  // ── Send handler ────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');

    // 1. Editing a specific field via the Edit button in summary card
    if (editingField) {
      const err = validateSlot(editingField, text);
      if (err) {
        addMessage('user', text);
        addMessage('bot', `⚠️ ${err} Please try again.`);
        return; // keep editingField set so next message retries
      }
      setSlots((prev) => ({ ...prev, [editingField]: text }));
      addMessage('user', text);
      addMessage('bot', `Updated ${FIELD_LABELS[editingField]} to "${text}". Here's your updated summary:`);
      setEditingField(null);
      setShowSummary(true);
      return;
    }

    // 2. View / Modify — awaiting contact number (initial or re-entry)
    if ((currentTask === 'view' || currentTask === 'modify') &&
        (expenses === null || awaitingContact)) {
      await fetchExpenses(text);
      return;
    }

    // 3. Create flow — normal slot-filling via context
    const result = await sendUserMessage(text);

    if (result?.amendment) {
      setShowSummary(true);
      return;
    }
    if (result?.complete) {
      setShowSummary(true);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Confirm & submit ────────────────────────────────────────────────────────
  const handleConfirmSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await createExpense(slots);
      setShowSummary(false);
      addMessage('bot', `Expense saved successfully! 🎉\nExpense ID: ${res.id}`);
    } catch (err) {
      setSubmitError(`Sorry, something went wrong saving your expense. ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Edit a field from summary card ──────────────────────────────────────────
  const handleEditField = (field) => {
    setEditingField(field);
    addMessage('bot', `Sure! What should I change ${FIELD_LABELS[field]} to?`);
    setShowSummary(false);
  };

  // ── Delete expense ──────────────────────────────────────────────────────────
  const handleDelete = async (id) => {
    await deleteExpense(id);
    setExpenses((prev) => prev.filter((e) => e.id !== id));
  };

  // ── Update date ─────────────────────────────────────────────────────────────
  const handleUpdateDate = async (id, date) => {
    const updated = await updateExpenseDate(id, date);
    setExpenses((prev) => prev.map((e) => (e.id === id ? updated : e)));
  };

  // ── Re-entry: user wants to try a different number ──────────────────────────
  const handleRetryContact = () => {
    setExpenses(null);
    setAwaitingContact(true);
    addMessage('bot', 'No problem — enter your mobile number again (with country code):');
  };

  const allFilled = SLOT_ORDER.every((s) => slots[s] !== null);

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={resetConversation} className="text-sm text-blue-600 hover:underline mb-3 block">
            ← Back to Menu
          </button>

          {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          {isLoading && <TypingIndicator />}

          {expenses !== null && (currentTask === 'view' || currentTask === 'modify') && (
            <ExpenseList expenses={expenses} mode={currentTask}
              onDelete={handleDelete} onUpdateDate={handleUpdateDate} onRetryContact={handleRetryContact} />
          )}

          {showSummary && currentTask === 'create' && allFilled && (
            <SummaryCard slots={slots} labels={FIELD_LABELS} onEdit={handleEditField}
              onConfirm={handleConfirmSubmit} submitting={submitting} submitError={submitError}
              onRetry={handleConfirmSubmit}
              onCancel={() => { setShowSummary(false); setSubmitError(''); resetConversation(); }} />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-3 sm:px-4 py-3">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message…"
            className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
          />
          <button onClick={handleSend} disabled={!input.trim()}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-40 transition shrink-0">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
