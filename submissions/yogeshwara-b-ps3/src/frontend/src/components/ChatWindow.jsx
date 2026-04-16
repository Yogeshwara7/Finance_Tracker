/**
 * ChatWindow — Form Mode UI.
 *
 * Create flow  — single-page form (all fields at once, profile pre-filled)
 * View flow    — contact lookup → expense list
 * Modify flow  — contact lookup → expense list → Change Date / Delete
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

// ── Validation ────────────────────────────────────────────────────────────────
const DATE_RE  = /^\d{2}-\d{2}-\d{4}$/;
const PHONE_RE = /^\+\d{1,4}\d{10}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateSlot(field, value) {
  switch (field) {
    case 'full_name':
      return value.trim().split(/\s+/).length < 2 ? 'Enter first and last name.' : null;
    case 'card_type':
      return !['Debit Card', 'Credit Card'].includes(value) ? 'Choose Debit Card or Credit Card.' : null;
    case 'category':
      return !['Transport', 'Shopping', 'Food'].includes(value) ? 'Choose Transport, Shopping, or Food.' : null;
    case 'amount': {
      const n = Number(value);
      return isNaN(n) || n <= 0 ? 'Enter a positive number.' : null;
    }
    case 'description':
      return !value.trim() ? 'Description cannot be empty.'
        : value.length > 300 ? 'Max 300 characters.' : null;
    case 'expense_date':
      if (!DATE_RE.test(value)) return 'Use DD-MM-YYYY format.';
      {
        const [dd, mm, yyyy] = value.split('-');
        const d = new Date(`${yyyy}-${mm}-${dd}`);
        if (isNaN(d.getTime())) return 'Invalid date.';
        if (d > new Date()) return 'Date cannot be in the future.';
      }
      return null;
    case 'contact_number':
      return !PHONE_RE.test(value) ? 'Include country code, e.g. +919876543210.' : null;
    case 'email':
      return !EMAIL_RE.test(value) ? 'Enter a valid email address.' : null;
    default: return null;
  }
}

// ── Typing indicator ──────────────────────────────────────────────────────────
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

// ── Delete confirmation ───────────────────────────────────────────────────────
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

// ── Expense list (view / modify) ──────────────────────────────────────────────
function ExpenseList({ expenses, mode, onDelete, onUpdateDate, onRetryContact }) {
  const [editingId,    setEditingId]    = useState(null);
  const [newDate,      setNewDate]      = useState('');
  const [dateError,    setDateError]    = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [actionMsg,    setActionMsg]    = useState('');

  if (!expenses.length) {
    return (
      <div className="my-3 space-y-2">
        <p className="text-sm text-gray-500">No expenses found for that number.</p>
        <button onClick={onRetryContact} className="text-sm text-blue-600 hover:underline">
          Enter a different number →
        </button>
      </div>
    );
  }

  const handleSave = async (id) => {
    if (!newDate) { setDateError('Please pick a date.'); return; }
    const [yyyy, mm, dd] = newDate.split('-');
    const ddmmyyyy = `${dd}-${mm}-${yyyy}`;
    const err = validateSlot('expense_date', ddmmyyyy);
    if (err) { setDateError(err); return; }
    try {
      await onUpdateDate(id, ddmmyyyy);
      setEditingId(null); setDateError('');
      setActionMsg('Date updated successfully.');
    } catch (e) { setDateError(e.message); }
  };

  return (
    <div className="my-3 space-y-2">
      {actionMsg && <p className="text-xs text-green-600 mb-1">{actionMsg}</p>}
      {expenses.map((exp) => (
        <div key={exp.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm">
          {confirmingId === exp.id ? (
            <DeleteConfirm
              expense={exp}
              onConfirm={async () => {
                try { await onDelete(exp.id); setConfirmingId(null); setActionMsg('Expense deleted.'); }
                catch (e) { setActionMsg(e.message); }
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
                    <button onClick={() => { setEditingId(exp.id); setNewDate(''); setDateError(''); }}
                      className="text-xs text-blue-600 hover:underline">Change Date</button>
                    <button onClick={() => setConfirmingId(exp.id)}
                      className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                )}
              </div>
              {editingId === exp.id && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-2 items-center">
                    <input type="date" max={new Date().toISOString().split('T')[0]}
                      value={newDate} onChange={(e) => { setNewDate(e.target.value); setDateError(''); }}
                      className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 cursor-pointer" />
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

// ── Create Form (Form Mode) ───────────────────────────────────────────────────
function CreateForm({ profile, onBack }) {
  const today = new Date().toISOString().split('T')[0];

  const [fields, setFields] = useState({
    full_name:      profile?.full_name           || '',
    card_type:      profile?.default_card_type   || '',
    category:       '',
    amount:         '',
    description:    '',
    expense_date:   today,
    contact_number: profile?.contact_number      || '',
    email:          profile?.email               || '',
  });
  const [errors,    setErrors]    = useState({});
  const [submitting,setSubmitting]= useState(false);
  const [success,   setSuccess]   = useState(null);
  const [submitErr, setSubmitErr] = useState('');

  const set = (field, value) => {
    setFields(prev => ({ ...prev, [field]: value }));
    setErrors(prev => ({ ...prev, [field]: null }));
  };

  const validate = () => {
    const errs = {};
    const toValidate = {
      ...fields,
      expense_date: fields.expense_date
        ? (() => { const [y,m,d] = fields.expense_date.split('-'); return `${d}-${m}-${y}`; })()
        : '',
    };
    for (const key of Object.keys(fields)) {
      const err = validateSlot(key, toValidate[key] ?? '');
      if (err) errs[key] = err;
    }
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSubmitting(true); setSubmitErr('');
    try {
      const [y, m, d] = fields.expense_date.split('-');
      const res = await createExpense({ ...fields, expense_date: `${d}-${m}-${y}` });
      setSuccess(res.id);
    } catch (err) {
      setSubmitErr(`Failed to save: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 px-4 py-12 text-center">
        <div className="text-4xl mb-3">🎉</div>
        <p className="text-lg font-semibold text-gray-800 mb-1">Expense saved!</p>
        <p className="text-sm text-gray-400 mb-6">ID: {success}</p>
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
      </div>
    );
  }

  const inputCls = (field) =>
    `w-full border rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50 ${errors[field] ? 'border-red-400' : 'border-gray-300'}`;

  return (
    <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
      <div className="max-w-lg mx-auto">
        <button onClick={onBack} className="text-sm text-blue-600 hover:underline mb-4 block">
          ← Back to Menu
        </button>
        <p className="text-base font-semibold text-gray-800 mb-1">Log an Expense</p>
        <p className="text-xs text-gray-400 mb-5">Profile fields are pre-filled — just add the expense details.</p>

        <form onSubmit={handleSubmit} className="space-y-4">

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input value={fields.full_name} onChange={e => set('full_name', e.target.value)}
              placeholder="First Last" className={inputCls('full_name')} />
            {errors.full_name && <p className="text-xs text-red-500 mt-1">{errors.full_name}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Card Type</label>
            <div className="flex gap-2">
              {['Debit Card', 'Credit Card'].map(opt => (
                <button type="button" key={opt} onClick={() => set('card_type', opt)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition
                    ${fields.card_type === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {opt}
                </button>
              ))}
            </div>
            {errors.card_type && <p className="text-xs text-red-500 mt-1">{errors.card_type}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <div className="flex gap-2">
              {['Transport', 'Shopping', 'Food'].map(opt => (
                <button type="button" key={opt} onClick={() => set('category', opt)}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium border transition
                    ${fields.category === opt
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-gray-50 text-gray-600 border-gray-300 hover:border-blue-400'}`}>
                  {opt}
                </button>
              ))}
            </div>
            {errors.category && <p className="text-xs text-red-500 mt-1">{errors.category}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (₹)</label>
            <input type="number" min="0.01" step="0.01"
              value={fields.amount} onChange={e => set('amount', e.target.value)}
              placeholder="e.g. 250" className={inputCls('amount')} />
            {errors.amount && <p className="text-xs text-red-500 mt-1">{errors.amount}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input value={fields.description} onChange={e => set('description', e.target.value)}
              placeholder="Brief description (max 300 chars)" className={inputCls('description')} />
            {errors.description && <p className="text-xs text-red-500 mt-1">{errors.description}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Expense Date</label>
            <input type="date" max={today}
              value={fields.expense_date} onChange={e => set('expense_date', e.target.value)}
              className={inputCls('expense_date')} />
            {errors.expense_date && <p className="text-xs text-red-500 mt-1">{errors.expense_date}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Mobile Number</label>
            <input value={fields.contact_number} onChange={e => set('contact_number', e.target.value)}
              placeholder="+919876543210" className={inputCls('contact_number')} />
            {errors.contact_number && <p className="text-xs text-red-500 mt-1">{errors.contact_number}</p>}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
            <input type="email" value={fields.email} onChange={e => set('email', e.target.value)}
              placeholder="you@example.com" className={inputCls('email')} />
            {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
          </div>

          {submitErr && <p className="text-sm text-red-600">{submitErr}</p>}

          <button type="submit" disabled={submitting}
            className="w-full bg-blue-600 text-white py-2.5 rounded-xl text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-50 transition">
            {submitting ? 'Saving…' : 'Submit Expense'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ── Main ChatWindow ───────────────────────────────────────────────────────────
export default function ChatWindow({ profile }) {
  const {
    messages, currentTask, isLoading,
    addMessage, resetConversation,
  } = useConversation();

  const [input,           setInput]           = useState('');
  const [expenses,        setExpenses]        = useState(null);
  const [awaitingContact, setAwaitingContact] = useState(false);
  const bottomRef = useRef(null);

  // fetchExpenses defined before useEffect so it's in scope
  const fetchExpenses = async (contact, isManual = false) => {
    if (isManual) addMessage('user', contact);
    try {
      const data = await getExpensesByContact(contact);
      setExpenses(data);
      setAwaitingContact(false);
      if (isManual) {
        if (data.length === 0) {
          addMessage('bot', 'No expenses found for that number.');
        } else {
          const verb = currentTask === 'modify' ? 'modify or delete' : 'view';
          addMessage('bot', `Found ${data.length} expense(s). You can ${verb} them below.`);
        }
      }
    } catch (e) {
      addMessage('bot', `Could not fetch expenses: ${e.message}`);
      setAwaitingContact(true);
    }
  };

  // Auto-fetch only for view/modify, never for create
  // Silently load on mount — no chat messages for auto-fetch
  useEffect(() => {
    if ((currentTask === 'view' || currentTask === 'modify') && profile?.contact_number && expenses === null) {
      fetchExpenses(profile.contact_number, false);
    }
  }, [currentTask]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, expenses]);

  // Create task → render form directly (no chat)
  if (currentTask === 'create') {
    return <CreateForm profile={profile} onBack={resetConversation} />;
  }

  const handleSend = async () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    if (expenses === null || awaitingContact) await fetchExpenses(text, true);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleDelete = async (id) => {
    await deleteExpense(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
  };

  const handleUpdateDate = async (id, date) => {
    const updated = await updateExpenseDate(id, date);
    setExpenses(prev => prev.map(e => e.id === id ? updated : e));
  };

  const handleRetryContact = () => {
    setExpenses(null);
    setAwaitingContact(true);
    addMessage('bot', 'No problem — enter your mobile number again (with country code):');
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <button onClick={resetConversation} className="text-sm text-blue-600 hover:underline mb-3 block">
            ← Back to Menu
          </button>

          {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          {isLoading && <TypingIndicator />}

          {expenses !== null && (
            <ExpenseList expenses={expenses} mode={currentTask}
              onDelete={handleDelete} onUpdateDate={handleUpdateDate}
              onRetryContact={handleRetryContact} />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {(expenses === null || awaitingContact) && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-3 sm:px-4 py-3">
          <div className="max-w-2xl mx-auto flex gap-2">
            <input type="text" value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter mobile number with country code…"
              className="flex-1 border border-gray-300 rounded-xl px-4 py-2.5 text-sm
                         focus:outline-none focus:ring-2 focus:ring-blue-400 bg-gray-50"
            />
            <button onClick={handleSend} disabled={!input.trim()}
              className="bg-blue-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium
                         hover:bg-blue-700 disabled:opacity-40 transition shrink-0">
              Go
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
