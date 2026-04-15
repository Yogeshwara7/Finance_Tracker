/**
 * AIChatWindow — Smart Mode
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

const isConfirmText = (t) =>
  /\b(confirm|yes|ok|submit|proceed|done|looks good|correct|no changes|save it|yup|yep|sure|go ahead|all good)\b/i.test(t.trim());

const fmtDate = (d) =>
  `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;

// ── TypingIndicator ───────────────────────────────────────────────────────────
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

// ── ReviewCard ────────────────────────────────────────────────────────────────
function ReviewCard({ slots, profile: p, onEdit, onConfirm, onCancel, submitting, submitError, onRetry }) {
  const display = {
    full_name:      slots.full_name      || p?.full_name,
    card_type:      slots.card_type      || p?.default_card_type,
    category:       slots.category,
    amount:         slots.amount,
    description:    slots.description,
    expense_date:   slots.expense_date,
    contact_number: slots.contact_number || p?.contact_number,
    email:          slots.email          || p?.email,
  };

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 shadow-sm">
      <p className="text-sm font-semibold text-blue-700 mb-3">Review your expense</p>
      <table className="w-full text-sm mb-4">
        <tbody>
          {SLOT_ORDER.map((field) => (
            <tr key={field} className="border-b border-blue-100 last:border-0">
              <td className="py-1.5 text-gray-500 w-1/3 text-xs">{FIELD_LABELS[field]}</td>
              <td className="py-1.5 text-gray-800 font-medium text-xs">{String(display[field] ?? '')}</td>
              <td className="py-1.5 text-right">
                <button onClick={() => onEdit(field)} className="text-xs text-blue-500 hover:underline">Edit</button>
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

// ── DeleteConfirm ─────────────────────────────────────────────────────────────
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

// ── ExpenseList ───────────────────────────────────────────────────────────────
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
    try {
      await onUpdateDate(id, `${dd}-${mm}-${yyyy}`);
      setEditingId(null);
      setMsg('Date updated.');
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="my-2 space-y-2">
      {msg && <p className="text-xs text-green-600">{msg}</p>}
      {expenses.map((exp) => (
        <div key={exp.id} className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm">
          {confirmingId === exp.id ? (
            <DeleteConfirm
              expense={exp}
              onConfirm={async () => { await onDelete(exp.id); setConfirmingId(null); setMsg('Deleted.'); }}
              onCancel={() => setConfirmingId(null)}
            />
          ) : (
            <>
              <div className="flex justify-between items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-gray-800">{exp.category}</span>
                    <span className="text-gray-400 text-xs">·</span>
                    <span className="font-semibold text-blue-600">₹{Number(exp.amount).toLocaleString('en-IN')}</span>
                  </div>
                  <p className="text-gray-700 text-xs mb-0.5">{exp.description}</p>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400 mt-1">
                    <span>📅 {exp.expense_date}</span>
                    <span>💳 {exp.card_type}</span>
                    <span>👤 {exp.full_name}</span>
                    <span>📞 {exp.contact_number}</span>
                    <span>✉️ {exp.email}</span>
                  </div>
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
  const [suggestions,   setSuggestions]   = useState([]);
  const [localField,    setLocalField]    = useState(null);
  const [quizFlow,      setQuizFlow]      = useState(null);
  const [isLoading,     setIsLoading]     = useState(false);
  const [flow,          setFlow]          = useState(null);
  const [slots,         setSlots]         = useState({});
  const [awaitContact,  setAwaitContact]  = useState(false);
  const [showReview,    setShowReview]    = useState(false);
  const [submitting,    setSubmitting]    = useState(false);
  const [submitError,   setSubmitError]   = useState('');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [lastContact,   setLastContact]   = useState(null);
  const [contactPrompt, setContactPrompt] = useState(false);
  const [editingField,  setEditingField]  = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  const aiCallCountRef  = useRef(0);
  const [aiCallDisplay, setAiCallDisplay] = useState(0);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading, showReview]);

  const addMsg = (role, text, extra = {}) =>
    setMessages((prev) => [...prev, { role, text, timestamp: new Date(), ...extra }]);

  const resetFlow = useCallback(() => {
    setFlow(null); setSlots({}); setAwaitContact(false);
    setShowReview(false); setSubmitError(''); setShowAnalytics(false);
    setContactPrompt(false); setEditingField(null); setPendingAction(null);
    setSuggestions([]); setLocalField(null); setQuizFlow(null);
    resetConversation();
  }, [resetConversation]);

  const handleBack = () => { setMessages([]); resetFlow(); setLastContact(null); };

  const callAI = async (userText, currentSlots) => {
    if (aiCallCountRef.current >= AI_LIMIT) {
      addMsg('bot', '⚠️ AI limit reached. Please refresh to continue.');
      return null;
    }
    aiCallCountRef.current += 1;
    setAiCallDisplay(aiCallCountRef.current);
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Response timed out. Please try again.')), 30000)
    );
    try {
      return await Promise.race([aiChat(userText, messages, currentSlots, profile), timeout]);
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

  // Clean version — no message injection
  const showReviewCard = (updatedSlots) => {
    setSlots(updatedSlots);
    setShowReview(true);
  };

  const fetchExpenses = async (contact, fetchMode) => {
    setIsLoading(true); setContactPrompt(false);
    try {
      const data = await getExpensesByContact(contact);
      setAwaitContact(false); setLastContact(contact);
      if (data.length === 0) {
        addMsg('bot', "No expenses found. Want to try a different number?");
      } else {
        addMsg('bot', `Found ${data.length} expense(s):`, {
          isExpenseList: true,
          expenses: data,
          listMode: fetchMode === 'modify' ? 'modify' : 'view',
        });
      }
    } catch (e) {
      addMsg('bot', `Couldn't fetch expenses: ${e.message}`);
      setAwaitContact(true);
    } finally { setIsLoading(false); }
  };

  const send = useCallback(async (text) => {
    if (!text) return;
    addMsg('user', text);
    setSuggestions([]);
    setLocalField(null);
    setQuizFlow(null);
    // Freeze any live expense list when user sends a new message
    setMessages(prev => prev.map(m =>
      m.isExpenseList && !m.frozen ? { ...m, frozen: true } : m
    ));
    setIsLoading(true);

    try {
      // ── Pending action confirmation ───────────────────────────────────
      if (pendingAction) {
        if (isConfirmText(text)) {
          const { action, target, new_date } = pendingAction;
          setPendingAction(null);
          try {
            if (action === 'update_date') {
              await updateExpenseDate(target.id, new_date);
              addMsg('bot', `Done! Date updated to ${new_date}.`);
            } else if (action === 'delete') {
              await deleteExpense(target.id);
              addMsg('bot', 'Deleted!');
            }
            setFlow(null);
          } catch (e) { addMsg('bot', `Something went wrong: ${e.message}`); }
          setIsLoading(false); return;
        } else if (/\bno\b|\bcancel\b|\bnope\b/i.test(text.trim())) {
          setPendingAction(null);
          addMsg('bot', 'Cancelled. Anything else?');
          setIsLoading(false); return;
        }
        addMsg('bot', 'Please confirm with "yes" or cancel with "no".');
        setIsLoading(false); return;
      }

      // ── Editing a field from review card ──────────────────────────────
      if (editingField) {
        const field = editingField;
        setEditingField(null);
        let value = text.trim();
        if (field === 'amount') value = Number(value);
        if (validateField(field, value)) {
          const updated = { ...slots, [field]: value };
          setSlots(updated);
          if (EXPENSE_FIELDS.every(f => validateField(f, updated[f]))) {
            showReviewCard(updated);
          } else {
            const nextMissing = EXPENSE_FIELDS.find(f => !validateField(f, updated[f]));
            addMsg('bot', `Updated! What's the ${FIELD_LABELS[nextMissing]}?`);
          }
        } else {
          const res = await callAI(text, slots);
          const extracted = res?.fields?.[field];
          if (extracted && validateField(field, extracted)) {
            const updated = { ...slots, [field]: extracted };
            setSlots(updated);
            showReviewCard(updated);
          } else {
            addMsg('bot', res?.reply || `That doesn't look right for ${FIELD_LABELS[field]}. Try again?`);
            setEditingField(field);
          }
        }
        setIsLoading(false); return;
      }

      // ── Review card active — accept text corrections or confirm ───────
      if (showReview) {
        if (isConfirmText(text)) {
          setShowReview(false);
          setIsLoading(false);
          setSubmitting(true); setSubmitError('');
          try {
            const res = await createExpense({ ...profileSlots, ...slots });
            addMsg('bot', `Expense saved! 🎉 (ID: ${res.id})`);
            resetFlow();
          } catch (err) {
            setSubmitError(err.message);
            setShowReview(true);
          } finally { setSubmitting(false); }
          return;
        }
        // Always call AI to extract the corrected field value
        const res = await callAI(text, { ...profileSlots, ...slots });
        if (res?.fields && Object.keys(res.fields).length > 0) {
          const updated = mergeFields({ ...slots }, res.fields);
          setSlots(updated);
          setShowReview(true); // keep review open with updated data
          if (res.reply) addMsg('bot', res.reply);
        } else if (res?.reply) {
          addMsg('bot', res.reply);
        }
        setIsLoading(false); return;
      }

      // ── Awaiting contact number ───────────────────────────────────────
      if (awaitContact) {
        const phoneMatch = text.match(/(\+\d{1,4}\s?\d{10})/);
        if (phoneMatch) {
          setIsLoading(false);
          await fetchExpenses(phoneMatch[1].replace(/\s/g, ''), flow);
          return;
        }
        const res = await callAI(text, slots);
        if (res?.reply) addMsg('bot', res.reply);
        setIsLoading(false); return;
      }

      // ── AI decides intent ─────────────────────────────────────────────
      const currentSlots = flow === 'create' ? { ...profileSlots, ...slots } : slots;
      const res = await callAI(text, currentSlots);
      if (!res) { setIsLoading(false); return; }

      const { reply, fields, intent, suggestions: newSuggestions, options: newOptions, quiz: newQuiz } = res;

      setSuggestions(newSuggestions || []);
      setLocalField(newOptions?.length > 0 ? { options: newOptions } : null);
      if (newQuiz?.length > 0) {
        setQuizFlow({ steps: newQuiz, currentStep: 0, answers: {} });
        setLocalField(null);
      }

      // Analytics
      if (intent === 'analytics') {
        setFlow('analytics'); setShowAnalytics(true);
        if (reply) addMsg('bot', reply);
        setIsLoading(false); return;
      }

      // View / Modify
      if (intent === 'view' || intent === 'modify') {
        setFlow(intent); setSlots({}); setShowReview(false);
        const contact = profile?.contact_number?.trim();

        if (intent === 'modify' && fields?.action && contact) {
          try {
            const allExpenses = await getExpensesByContact(contact);
            let target = null;
            if (fields.match_position) {
              const pos = fields.match_position;
              target = pos === -1 ? allExpenses[allExpenses.length - 1] : allExpenses[pos - 1];
            } else if (fields.match_category) {
              target = allExpenses.find(e => e.category.toLowerCase() === fields.match_category.toLowerCase());
            } else if (fields.match_description) {
              target = allExpenses.find(e => e.description.toLowerCase().includes(fields.match_description.toLowerCase()));
            }
            if (!target) {
              addMsg('bot', "I couldn't find that expense. Can you be more specific?");
            } else if (fields.action === 'update_date' && fields.new_date) {
              setPendingAction({ action: 'update_date', target, new_date: fields.new_date });
              addMsg('bot', `Confirm: change date from ${target.expense_date} → ${fields.new_date}?`);
            } else if (fields.action === 'delete') {
              setPendingAction({ action: 'delete', target });
              addMsg('bot', `Confirm: delete the ${target.category} expense (₹${Number(target.amount).toLocaleString('en-IN')} on ${target.expense_date})?`);
            }
          } catch (e) { addMsg('bot', `Something went wrong: ${e.message}`); }
          setIsLoading(false); return;
        }

        if (contact) {
          if (reply) addMsg('bot', reply);
          setIsLoading(false);
          await fetchExpenses(contact, intent);
        } else {
          if (reply) addMsg('bot', reply);
          setAwaitContact(true);
          addMsg('bot', 'Enter your mobile number to continue.');
          setIsLoading(false);
        }
        return;
      }

      // Create
      if (intent === 'create' || flow === 'create') {
        if (intent === 'create' && flow !== 'create') {
          setFlow('create'); setSlots(profileSlots); setShowReview(false);
        }
        const updatedSlots = mergeFields({ ...profileSlots, ...slots }, fields);
        setSlots(updatedSlots);
        if (EXPENSE_FIELDS.every(f => validateField(f, updatedSlots[f]))) {
          showReviewCard(updatedSlots);
          setIsLoading(false); return;
        }
        if (reply) addMsg('bot', reply);
        setIsLoading(false); return;
      }

      // Default
      if (reply) addMsg('bot', reply);

    } catch (e) {
      addMsg('bot', `Something went wrong: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [editingField, awaitContact, showReview, flow, slots, profile, profileSlots, messages, pendingAction]);

  const handleSend = () => { const t = input.trim(); if (!t) return; setInput(''); send(t); };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

  const handleConfirmSubmit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const res = await createExpense({ ...profileSlots, ...slots });
      setShowReview(false);
      addMsg('bot', `Expense saved! 🎉 (ID: ${res.id})\n\nWant to log another or do something else?`);
      resetFlow();
    } catch (err) {
      setSubmitError(err.message);
    } finally { setSubmitting(false); }
  };

  const handleEditField = (field) => {
    setEditingField(field);
    setShowReview(false);
    addMsg('bot', `What should I change ${FIELD_LABELS[field]} to?`);
  };

  if (showAnalytics) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
        <AnalyticsDashboard
          initialContact={profile?.contact_number}
          onBack={() => { setShowAnalytics(false); setFlow(null); addMsg('bot', 'Back to chat! What else can I help with?'); }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* Back button */}
      {flow && (
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
      )}

      {/* Message scroll area */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">

          {/* Empty state */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <span className="text-6xl">💬</span>
              <p className="text-lg font-medium text-gray-600">Smart Mode</p>
              <p className="text-sm text-center max-w-xs">
                Just type naturally — "I spent 300 on food", "show my expenses", or anything else.
              </p>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble key={msg.timestamp + '-' + i} message={msg} />
          ))}

          {isLoading && <TypingIndicator />}

          {/* Contact prompt inline buttons */}
          {contactPrompt && !isLoading && (
            <div className="flex items-center gap-2 my-2 flex-wrap">
              <button
                onClick={() => { setContactPrompt(false); fetchExpenses(lastContact, flow); }}
                className="px-4 py-2 bg-blue-600 text-white text-xs rounded-xl hover:bg-blue-700 transition">
                Yes, use {lastContact}
              </button>
              <button
                onClick={() => { setContactPrompt(false); setAwaitContact(true); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 text-xs rounded-xl hover:bg-gray-300 transition">
                Use a different number
              </button>
            </div>
          )}

          {/* AI limit warning — only near limit */}
          {aiCallDisplay >= AI_LIMIT - 5 && (
            <p className="text-xs text-amber-500 text-right mt-1">
              {AI_LIMIT - aiCallDisplay} AI responses remaining
            </p>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── STICKY BOTTOM ZONE — only one panel renders at a time ── */}

      {/* Priority 1: ReviewCard */}
      {showReview && flow === 'create' && !isLoading && (
        <div className="shrink-0 border-t border-gray-200 bg-blue-50 px-4 sm:px-6 py-3">
          <div className="max-w-2xl mx-auto">
            <ReviewCard
              slots={slots}
              profile={profile}
              onEdit={handleEditField}
              onConfirm={handleConfirmSubmit}
              onCancel={() => { setShowReview(false); setSubmitError(''); resetFlow(); }}
              submitting={submitting}
              submitError={submitError}
              onRetry={handleConfirmSubmit}
            />
            {/* Inline correction input */}
            <div className="flex gap-2 mt-3">
              <input
                type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Or type a change — "change date to yesterday"'
                className="flex-1 border border-blue-200 rounded-xl px-3 py-2 text-xs bg-white focus:outline-none focus:border-blue-400"
              />
              <button onClick={handleSend} disabled={!input.trim()}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs hover:bg-blue-700 disabled:opacity-40 transition">
                Send
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Priority 2: Quiz panel */}
      {quizFlow && !isLoading && !showReview && (() => {
        const step    = quizFlow.steps[quizFlow.currentStep];
        const total   = quizFlow.steps.length;
        const current = quizFlow.currentStep + 1;
        const today     = new Date();
        const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);

        const handleAnswer = (val) => {
          let resolved = val;
          if (val === 'Today')       resolved = fmtDate(today);
          else if (val === 'Yesterday') resolved = fmtDate(yesterday);

          const newAnswers = { ...quizFlow.answers, [step.field]: resolved };
          const nextStep   = quizFlow.currentStep + 1;

          if (nextStep >= total) {
            setQuizFlow(null);
            const combined = Object.entries(newAnswers).map(([f, v]) => `${f}: ${v}`).join(', ');
            send(`[quiz answers] ${combined}`);
          } else {
            setQuizFlow({ ...quizFlow, currentStep: nextStep, answers: newAnswers });
          }
        };

        return (
          <div className="shrink-0 bg-white border-t border-gray-200 shadow-lg">
            <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-2">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-medium text-gray-800">{step.question}</p>
                <span className="text-xs text-gray-400">{current} of {total}</span>
              </div>
              <div className="space-y-1">
                {(step.options || []).length > 0 ? (
                  <>
                    {(step.options || []).filter(o => o !== 'Custom date').map((opt, i) => (
                      <button key={i} onClick={() => handleAnswer(opt)}
                        className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm text-left
                                   text-gray-800 hover:bg-gray-50 border border-transparent hover:border-gray-200 transition group">
                        <span className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-blue-100 text-xs font-semibold
                                         flex items-center justify-center text-gray-500 group-hover:text-blue-600 shrink-0">
                          {i + 1}
                        </span>
                        <span className="flex-1 font-medium">{opt}</span>
                        <span className="text-gray-300 group-hover:text-blue-400 text-lg">→</span>
                      </button>
                    ))}
                    <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-dashed border-gray-200 hover:border-gray-300 transition">
                      <span className="w-7 h-7 rounded-lg bg-gray-50 text-xs flex items-center justify-center text-gray-400 shrink-0">✏️</span>
                      <input type="text"
                        placeholder={step.options?.includes('Custom date') ? 'Custom date (DD-MM-YYYY)' : 'Something else...'}
                        className="flex-1 text-sm outline-none text-gray-700 bg-transparent placeholder-gray-400"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && e.target.value.trim()) {
                            handleAnswer(e.target.value.trim());
                            e.target.value = '';
                          }
                        }} />
                      <span className="text-xs text-gray-300">Enter ↵</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border border-gray-200 focus-within:border-blue-400 transition">
                    <span className="w-7 h-7 rounded-lg bg-gray-50 text-xs flex items-center justify-center text-gray-400 shrink-0">✏️</span>
                    <input type="text" placeholder="Type your answer..."
                      className="flex-1 text-sm outline-none text-gray-700 bg-transparent"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.target.value.trim()) {
                          handleAnswer(e.target.value.trim());
                          e.target.value = '';
                        }
                      }} />
                    <span className="text-xs text-gray-300">Enter ↵</span>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center pt-2 pb-1 border-t border-gray-100 mt-2">
                <span className="text-xs text-gray-400">Enter to select</span>
                <button onClick={() => setQuizFlow(null)}
                  className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-100 transition">
                  Skip
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Priority 3: Options panel */}
      {localField?.options?.length > 0 && !isLoading && !quizFlow && !showReview && (
        <div className="shrink-0 bg-white border-t border-gray-200 shadow-lg">
          <div className="max-w-2xl mx-auto px-4 sm:px-6 pt-4 pb-2">
            <div className="space-y-1">
              {localField.options.map((opt, i) => {
                const today     = new Date();
                const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
                return (
                  <button key={i} onClick={() => {
                    setLocalField(null);
                    if (opt === 'Today')        send(fmtDate(today));
                    else if (opt === 'Yesterday')   send(fmtDate(yesterday));
                    else if (opt === 'Custom date') setLocalField(null);
                    else send(opt);
                  }}
                    className="w-full flex items-center gap-4 px-4 py-3 rounded-xl text-sm text-left
                               text-gray-800 hover:bg-gray-50 border border-transparent hover:border-gray-200 transition group">
                    <span className="w-7 h-7 rounded-lg bg-gray-100 group-hover:bg-blue-100 text-xs font-semibold
                                     flex items-center justify-center text-gray-500 group-hover:text-blue-600 shrink-0">
                      {i + 1}
                    </span>
                    <span className="flex-1 font-medium">{opt}</span>
                    <span className="text-gray-300 group-hover:text-blue-400 text-lg">→</span>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-between items-center pt-2 pb-1 border-t border-gray-100 mt-2">
              <span className="text-xs text-gray-400">Choose an option or type below</span>
              <button onClick={() => setLocalField(null)}
                className="text-xs text-gray-400 hover:text-gray-600 px-3 py-1 rounded-lg hover:bg-gray-100 transition">
                Skip
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Priority 4: Default text input */}
      {!showReview && !quizFlow && !localField?.options?.length && (
        <div className="shrink-0 bg-white border-t border-gray-200 px-4 sm:px-6 py-4">
          <div className="max-w-2xl mx-auto">
            {suggestions.length > 0 && (
              <div className="flex gap-2 flex-wrap mb-2">
                {suggestions.map((s, i) => (
                  <button key={i} onClick={() => setInput(s)}
                    className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs rounded-full hover:bg-blue-100 transition">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input type="text" value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type anything — I'll understand…"
                className="flex-1 border-2 border-gray-300 rounded-xl px-4 py-3 text-sm
                           focus:outline-none focus:border-blue-400 bg-white shadow-sm"
              />
              <button onClick={handleSend} disabled={!input.trim()}
                className="bg-blue-600 text-white px-6 py-3 rounded-xl text-sm font-medium
                           hover:bg-blue-700 disabled:opacity-40 transition shrink-0">
                {isLoading ? '...' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}