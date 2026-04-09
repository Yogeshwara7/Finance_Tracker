/**
 * AIChatWindow — Smart Mode
 * Fixes applied:
 *  1. Single unified send handler (no duplication)
 *  2. Intent always overrides flow (no stale flow conflicts)
 *  3. Strict confirm detection regex
 *  4. AI call count via ref (no race condition)
 *  5. System actions take priority over AI reply
 *  6. Structured preview message (no magic strings)
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { useConversation } from '../context/ConversationContext.jsx';
import MessageBubble from './MessageBubble.jsx';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import {
  createExpense, getExpensesByContact,
  updateExpenseDate, deleteExpense, aiChat,
} from '../api/client.js';

const SLOT_ORDER     = ['full_name','card_type','category','amount','description','expense_date','contact_number','email'];
const EXPENSE_FIELDS = ['category','amount','description','expense_date'];
const AI_LIMIT       = 30;

const FIELD_LABELS = {
  full_name: 'Full Name', card_type: 'Card Type', category: 'Category',
  amount: 'Amount (₹)', description: 'Description', expense_date: 'Date',
  contact_number: 'Mobile', email: 'Email',
};

function validateField(f, v) {
  if (v === null || v === undefined || v === '') return false;
  if (f === 'amount')         return !isNaN(Number(v)) && Number(v) > 0;
  if (f === 'card_type')      return ['Debit Card','Credit Card'].includes(v);
  if (f === 'category')       return ['Transport','Shopping','Food'].includes(v);
  if (f === 'expense_date')   return /^\d{2}-\d{2}-\d{4}$/.test(v);
  if (f === 'contact_number') return /^\+\d{1,4}\d{10}$/.test(v);
  if (f === 'email')          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (f === 'full_name')      return String(v).trim().split(/\s+/).length >= 2;
  return String(v).trim().length > 0;
}

const isConfirmText = (text) => /^(confirm|yes|ok|submit|proceed|done|looks good|correct|no changes|save it)$/i.test(text.trim());

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

function SummaryCard({ slots, onEdit, onConfirm, submitting, submitError, onRetry, onCancel }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 my-3 shadow-sm">
      <p className="text-sm font-semibold text-blue-700 mb-3">Review your expense</p>
      <table className="w-full text-sm mb-4">
        <tbody>
          {SLOT_ORDER.map((field) => (
            <tr key={field} className="border-b border-blue-100 last:border-0">
              <td className="py-1.5 text-gray-500 w-1/3">{FIELD_LABELS[field]}</td>
              <td className="py-1.5 text-gray-800 font-medium">{String(slots[field] ?? '')}</td>
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

function DeleteConfirm({ expense, onConfirm, onCancel }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl p-4 my-2 shadow-sm">
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

function ExpenseList({ expenses, mode, onDelete, onUpdateDate, onRetry }) {
  const [editingId,    setEditingId]    = useState(null);
  const [newDate,      setNewDate]      = useState('');
  const [confirmingId, setConfirmingId] = useState(null);
  const [msg,          setMsg]          = useState('');

  if (!expenses.length) {
    return (
      <div className="my-2 space-y-2">
        <p className="text-sm text-gray-500">No expenses found for that number.</p>
        <button onClick={onRetry} className="text-sm text-blue-600 hover:underline">Try a different number →</button>
      </div>
    );
  }

  const handleSave = async (id) => {
    if (!newDate) return;
    const [yyyy, mm, dd] = newDate.split('-');
    try { await onUpdateDate(id, `${dd}-${mm}-${yyyy}`); setEditingId(null); setMsg('Date updated.'); }
    catch (e) { setMsg(e.message); }
  };

  return (
    <div className="my-2 space-y-2">
      {msg && <p className="text-xs text-green-600">{msg}</p>}
      {expenses.map((exp) => (
        <div key={exp.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm">
          {confirmingId === exp.id ? (
            <DeleteConfirm expense={exp}
              onConfirm={async () => { await onDelete(exp.id); setConfirmingId(null); setMsg('Deleted.'); }}
              onCancel={() => setConfirmingId(null)} />
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium text-gray-800">{exp.category} — ₹{Number(exp.amount).toLocaleString('en-IN')}</p>
                  <p className="text-gray-500 text-xs">{exp.expense_date} · {exp.description}</p>
                  <p className="text-gray-400 text-xs">{exp.card_type} · {exp.full_name}</p>
                </div>
                {mode === 'modify' && (
                  <div className="flex gap-2 ml-2 shrink-0">
                    <button onClick={() => { setEditingId(exp.id); setNewDate(''); }} className="text-xs text-blue-600 hover:underline">Change Date</button>
                    <button onClick={() => setConfirmingId(exp.id)} className="text-xs text-red-500 hover:underline">Delete</button>
                  </div>
                )}
              </div>
              {editingId === exp.id && (
                <div className="mt-2 flex gap-2 items-center">
                  <input type="date" max={new Date().toISOString().split('T')[0]} value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 cursor-pointer" />
                  <button onClick={() => handleSave(exp.id)} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg">Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-gray-500 hover:underline">Cancel</button>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ── PreviewCard — structured, no magic strings ────────────────────────────────
function PreviewCard({ collected, profile: p, onConfirm, onEdit }) {
  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-sm w-80">
      <p className="text-blue-700 font-medium mb-2">Here's what I've collected:</p>
      <table className="w-full mb-2">
        <tbody>
          {Object.entries(collected).map(([k, v]) => (
            <tr key={k} className="border-b border-blue-100 last:border-0">
              <td className="py-1 text-gray-500 w-2/5 text-xs">{FIELD_LABELS[k] || k}</td>
              <td className="py-1 text-gray-800 font-medium text-xs">{String(v)}</td>
              <td className="py-1 text-right">
                <button onClick={() => onEdit(k)} className="text-xs text-blue-500 hover:underline">Edit</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {p && (
        <>
          <p className="text-gray-500 text-xs font-medium border-t border-blue-100 pt-2 mb-1">Your saved profile:</p>
          <div className="space-y-0.5 mb-2">
            <p className="text-gray-600 text-xs">• {p.full_name} · {p.default_card_type}</p>
            <p className="text-gray-600 text-xs">• {p.contact_number}</p>
            <p className="text-gray-600 text-xs truncate">• {p.email}</p>
          </div>
        </>
      )}
      <p className="text-gray-500 text-xs border-t border-blue-100 pt-2 mb-2">Anything to change? Or confirm to save.</p>
      <button onClick={onConfirm}
        className="w-full bg-blue-600 text-white py-1.5 rounded-xl text-xs font-medium hover:bg-blue-700 transition">
        Looks good, confirm →
      </button>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIChatWindow({ profile }) {
  const { resetConversation } = useConversation();

  const profileSlots = profile ? {
    full_name:      profile.full_name,
    card_type:      profile.default_card_type,
    contact_number: profile.contact_number,
    email:          profile.email,
  } : {};

  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [isLoading,     setIsLoading]     = useState(false);
  const [flow,          setFlow]          = useState(null);
  const [slots,         setSlots]         = useState({});
  const [expenses,      setExpenses]      = useState(null);
  const [awaitContact,  setAwaitContact]  = useState(false);
  const [showPreview,   setShowPreview]   = useState(false);  // pre-confirm review
  const [showSummary,   setShowSummary]   = useState(false);  // final summary card
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [lastContact,   setLastContact]   = useState(null);
  const [contactPrompt, setContactPrompt] = useState(false);
  const [editingField,  setEditingField]  = useState(null);

  // Fix #3: use ref for AI call count to avoid race conditions
  const aiCallCountRef = useRef(0);
  const [aiCallDisplay, setAiCallDisplay] = useState(0);

  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); },
    [messages, isLoading, showSummary, showPreview, expenses]);

  const addMsg = (role, text) =>
    setMessages((prev) => [...prev, { role, text, timestamp: new Date() }]);

  const resetFlow = useCallback(() => {
    setFlow(null); setSlots({}); setExpenses(null);
    setAwaitContact(false); setShowPreview(false); setShowSummary(false);
    setSubmitError(''); setShowAnalytics(false);
    setContactPrompt(false); setEditingField(null);
    resetConversation();
  }, [resetConversation]);

  const handleBack = () => { setMessages([]); resetFlow(); setLastContact(null); };

  // ── Core AI call ────────────────────────────────────────────────────────────
  const callAI = async (userText, currentSlots) => {
    if (aiCallCountRef.current >= AI_LIMIT) {
      addMsg('bot', '⚠️ AI limit reached for this session. Please refresh to continue.');
      return null;
    }
    aiCallCountRef.current += 1;
    setAiCallDisplay(aiCallCountRef.current);

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Response timed out. Please try again.')), 30000)
    );
    try {
      const res = await Promise.race([
        aiChat(userText, messages, currentSlots, profile),
        timeout,
      ]);
      return res;
    } catch (e) {
      addMsg('bot', `⚠️ ${e.message}`);
      return null;
    }
  };

  const mergeFields = (base, rawFields) => {
    const updated = { ...base };
    for (const [f, v] of Object.entries(rawFields || {})) {
      if (!v) continue;
      if (validateField(f, v)) updated[f] = f === 'amount' ? Number(v) : v;
    }
    return updated;
  };

  const fetchExpenses = async (contact, currentFlow) => {
    setIsLoading(true);
    setContactPrompt(false);
    try {
      const data = await getExpensesByContact(contact);
      setExpenses(data); setAwaitContact(false); setLastContact(contact);
      addMsg('bot', data.length === 0
        ? "No expenses found for that number. Want to try a different one?"
        : `Found ${data.length} expense(s). ${currentFlow === 'modify' ? 'Use the buttons below to edit or delete.' : 'Here they are:'}`
      );
    } catch (e) {
      addMsg('bot', `Couldn't fetch expenses: ${e.message}. Try again?`);
      setAwaitContact(true);
    } finally { setIsLoading(false); }
  };

  const triggerContactFlow = (currentFlow) => {
    if (lastContact) {
      setContactPrompt(true);
      addMsg('bot', `I have ${lastContact} on file. Use the same number?`);
    } else {
      setAwaitContact(true);
      addMsg('bot', 'Enter your mobile number (with country code) to continue.');
    }
  };

  // ── Unified send handler (Fix #4) ──────────────────────────────────────────
  const send = useCallback(async (text) => {
    if (!text || isLoading) return;
    addMsg('user', text);
    setIsLoading(true);

    try {
      // ── Editing a field from preview/summary ────────────────────────────
      if (editingField) {
        const field = editingField;
        setEditingField(null);
        let value = text.trim();
        if (field === 'amount') value = Number(value);
        if (validateField(field, value)) {
          const updated = { ...slots, [field]: value };
          setSlots(updated);
          setShowPreview(false);
          setShowSummary(false);
          // Re-check if all expense fields still filled after edit
          const allFilled = EXPENSE_FIELDS.every(f => validateField(f, updated[f]));
          if (allFilled) {
            setShowPreview(true);
          } else {
            addMsg('bot', `Updated ${FIELD_LABELS[field]}. What's the ${FIELD_LABELS[EXPENSE_FIELDS.find(f => !validateField(f, updated[f]))]}?`);
          }
        } else {
          const res = await callAI(text, slots);
          const extracted = res?.fields?.[field];
          if (extracted && validateField(field, extracted)) {
            const updated = { ...slots, [field]: extracted };
            setSlots(updated);
            setShowPreview(true);
          } else {
            addMsg('bot', res?.reply || `That doesn't look right for ${FIELD_LABELS[field]}. Try again?`);
            setEditingField(field);
          }
        }
        setIsLoading(false);
        return;
      }

      // ── Awaiting contact number ─────────────────────────────────────────
      if (awaitContact) {
        const phoneMatch = text.match(/(\+\d{1,4}\s?\d{10})/);
        if (phoneMatch) {
          setIsLoading(false);
          await fetchExpenses(phoneMatch[1].replace(/\s/g, ''), flow);
          return;
        }
        const res = await callAI(text, slots);
        if (res?.reply) addMsg('bot', res.reply);
        setIsLoading(false);
        return;
      }

      // ── Pre-confirm stage: user responding to preview card ──────────────
      if (showPreview && !showSummary) {
        if (isConfirmText(text)) {
          setShowPreview(false);
          setShowSummary(true);
          setIsLoading(false);
          return;
        }
        // User wants to change something — let AI handle it
        const res = await callAI(text, slots);
        if (res?.fields && Object.keys(res.fields).length > 0) {
          const updated = mergeFields(slots, res.fields);
          setSlots(updated);
          setShowPreview(false);
          // Re-show preview with updated data
          const allFilled = EXPENSE_FIELDS.every(f => validateField(f, updated[f]));
          if (allFilled) setShowPreview(true);
          else if (res.reply) addMsg('bot', res.reply);
        } else {
          if (res?.reply) addMsg('bot', res.reply);
        }
        setIsLoading(false);
        return;
      }

      // ── Call AI ─────────────────────────────────────────────────────────
      const currentSlots = flow === 'create' ? { ...profileSlots, ...slots } : slots;
      const res = await callAI(text, currentSlots);
      if (!res) { setIsLoading(false); return; }

      const { reply, fields, intent } = res;

      // Fix #2: Intent always overrides flow
      let activeFlow = flow;
      if (intent && intent !== 'null' && intent !== flow) {
        activeFlow = intent;
        if (intent === 'analytics') {
          setFlow('analytics'); setShowAnalytics(true);
          if (reply) addMsg('bot', reply); // Fix #5: AI reply shown only when no system action
          setIsLoading(false);
          return;
        }
        if (intent === 'view' || intent === 'modify') {
          setFlow(intent); setSlots({}); setExpenses(null);
          setShowPreview(false); setShowSummary(false);
          if (expenses !== null && flow === intent) {
            addMsg('bot', intent === 'modify' ? 'Use the buttons below.' : 'Here are your expenses:');
          } else {
            if (reply) addMsg('bot', reply);
            triggerContactFlow(intent);
          }
          setIsLoading(false);
          return;
        }
        if (intent === 'create') {
          setFlow('create');
          setSlots(profileSlots);
          setExpenses(null); setShowPreview(false); setShowSummary(false);
          activeFlow = 'create';
        }
      }

      // ── Create flow: merge fields ───────────────────────────────────────
      if (activeFlow === 'create') {
        const base = { ...profileSlots, ...slots };
        const updatedSlots = mergeFields(base, fields);
        setSlots(updatedSlots);

        const allExpenseFilled = EXPENSE_FIELDS.every(f => validateField(f, updatedSlots[f]));

        // Fix #5: system action takes priority — don't show AI reply if showing preview
        if (allExpenseFilled) {
          setShowPreview(true);
          setIsLoading(false);
          return;
        }
        // Not all filled yet — show AI reply to ask for next field
        if (reply) addMsg('bot', reply);
        setIsLoading(false);
        return;
      }

      // ── Default: show AI reply ──────────────────────────────────────────
      if (reply) addMsg('bot', reply);

    } catch (e) {
      addMsg('bot', `Something went wrong: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, editingField, awaitContact, showPreview, showSummary, flow, slots, expenses, lastContact, profile, profileSlots, messages]);

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput('');
    send(text);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const res = await createExpense(slots);
      setShowSummary(false); setShowPreview(false);
      addMsg('bot', `Expense saved! 🎉 (ID: ${res.id})\n\nWant to log another or do something else?`);
      resetFlow();
    } catch (err) {
      setSubmitError(`Something went wrong: ${err.message}`);
    } finally { setSubmitting(false); }
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setShowPreview(false);
    setShowSummary(false);
    addMsg('bot', `What should I change ${FIELD_LABELS[field]} to?`);
  };

  const allFilled = SLOT_ORDER.every((s) => validateField(s, slots[s]));

  if (showAnalytics) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
        <AnalyticsDashboard onBack={() => {
          setShowAnalytics(false); setFlow(null);
          addMsg('bot', 'Back to chat! What else can I help you with?');
        }} />
      </div>
    );
  }

  // Collected expense fields for preview card
  const collectedForPreview = {
    category:     slots.category,
    amount:       slots.amount,
    description:  slots.description,
    expense_date: slots.expense_date,
  };

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {flow && (
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <span className="text-6xl">💬</span>
              <p className="text-lg font-medium text-gray-600">Smart Mode</p>
              <p className="text-sm text-center max-w-xs">
                Just type naturally — "I spent 300 on food", "show my expenses", or anything else.
              </p>
            </div>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          {isLoading && <TypingIndicator />}

          {/* Contact prompt */}
          {contactPrompt && !isLoading && (
            <div className="flex items-center gap-2 my-2 flex-wrap">
              <button onClick={() => { setContactPrompt(false); fetchExpenses(lastContact, flow); }}
                className="px-4 py-2 bg-blue-600 text-white text-xs rounded-xl hover:bg-blue-700 transition">
                Yes, use {lastContact}
              </button>
              <button onClick={() => { setContactPrompt(false); setAwaitContact(true); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-xs rounded-xl hover:bg-gray-300 transition">
                Use a different number
              </button>
            </div>
          )}

          {aiCallDisplay > 0 && (
            <p className="text-xs text-gray-300 text-right mt-1">AI calls: {aiCallDisplay}/{AI_LIMIT}</p>
          )}

          {/* Expense list */}
          {expenses !== null && (flow === 'view' || flow === 'modify') && !isLoading && (
            <ExpenseList expenses={expenses} mode={flow}
              onDelete={async (id) => { await deleteExpense(id); setExpenses((p) => p.filter((e) => e.id !== id)); }}
              onUpdateDate={async (id, date) => { const u = await updateExpenseDate(id, date); setExpenses((p) => p.map((e) => e.id === id ? u : e)); }}
              onRetry={() => { setExpenses(null); setAwaitContact(true); addMsg('bot', 'Enter your mobile number:'); }}
            />
          )}

          {/* Pre-confirm preview card — Fix #6: structured component, no magic string */}
          {showPreview && flow === 'create' && !showSummary && !isLoading && (
            <PreviewCard
              collected={collectedForPreview}
              profile={profile}
              onConfirm={() => { setShowPreview(false); setShowSummary(true); }}
              onEdit={handleEditField}
            />
          )}

          {/* Final summary card */}
          {showSummary && flow === 'create' && allFilled && (
            <SummaryCard slots={slots}
              onEdit={handleEditField} onConfirm={handleConfirmSubmit}
              submitting={submitting} submitError={submitError}
              onRetry={handleConfirmSubmit}
              onCancel={() => { setShowSummary(false); setSubmitError(''); resetFlow(); }}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto flex gap-2">
          <input type="text" value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type anything — I'll understand…"
            className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 text-sm
                       focus:outline-none focus:border-blue-400 bg-white shadow-sm"
          />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium
                       hover:bg-blue-700 disabled:opacity-40 transition shrink-0">
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
