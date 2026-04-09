/**
 * AIChatWindow — Smart Mode: full conversational AI.
 *
 * Every message goes to the AI which:
 *  1. Generates a natural conversational reply
 *  2. Extracts expense fields simultaneously
 *  3. Detects intent (create/view/modify/analytics)
 *
 * The AI drives the conversation — no rigid slot-filling prompts.
 */
import { useState, useRef, useEffect } from 'react';
import { useConversation } from '../context/ConversationContext.jsx';
import MessageBubble from './MessageBubble.jsx';
import AnalyticsDashboard from './AnalyticsDashboard.jsx';
import {
  createExpense, getExpensesByContact,
  updateExpenseDate, deleteExpense, aiChat,
} from '../api/client.js';

const SLOT_ORDER = ['full_name','card_type','category','amount','description','expense_date','contact_number','email'];
const AI_LIMIT   = 30;

const FIELD_LABELS = {
  full_name: 'Full Name', card_type: 'Card Type', category: 'Category',
  amount: 'Amount', description: 'Description', expense_date: 'Expense Date',
  contact_number: 'Mobile Number', email: 'Email',
};

// ── Validation ────────────────────────────────────────────────────────────────
function validateField(f, v) {
  if (!v) return false;
  if (f === 'amount')         return !isNaN(Number(v)) && Number(v) > 0;
  if (f === 'card_type')      return ['Debit Card','Credit Card'].includes(v);
  if (f === 'category')       return ['Transport','Shopping','Food'].includes(v);
  if (f === 'expense_date')   return /^\d{2}-\d{2}-\d{4}$/.test(v);
  if (f === 'contact_number') return /^\+\d{1,4}\d{10}$/.test(v);
  if (f === 'email')          return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  if (f === 'full_name')      return String(v).trim().split(/\s+/).length >= 2;
  return String(v).trim().length > 0;
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

const CHIPS = [
  { label: 'Create Expense',          desc: 'Log a new expense',                    icon: '➕', msg: 'I want to create a new expense'         },
  { label: 'View Expenses',           desc: 'Look up by mobile number',              icon: '📋', msg: 'Show me my expenses'                    },
  { label: 'Modify / Delete Expense', desc: 'Update or remove a record',             icon: '✏️', msg: 'I want to modify or delete an expense'  },
  { label: 'View Analytics',          desc: 'Charts and spending summary',           icon: '📊', msg: 'Show my spending analytics'             },
];

// ── Main ──────────────────────────────────────────────────────────────────────
export default function AIChatWindow({ profile }) {
  const { resetConversation } = useConversation();

  // Profile fields that can be pre-filled (session-only overrides allowed)
  const profileSlots = profile ? {
    full_name:      profile.full_name,
    card_type:      profile.default_card_type,
    contact_number: profile.contact_number,
    email:          profile.email,
  } : {};

  const [messages,     setMessages]     = useState([]);
  const [input,        setInput]        = useState('');
  const [isLoading,    setIsLoading]    = useState(false);
  const [flow,         setFlow]         = useState(null);
  const [slots,        setSlots]        = useState({});
  const [expenses,     setExpenses]     = useState(null);
  const [awaitContact, setAwaitContact] = useState(false);
  const [showSummary,  setShowSummary]  = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [submitError,  setSubmitError]  = useState('');
  const [showAnalytics,setShowAnalytics]= useState(false);
  const [aiCallCount,  setAiCallCount]  = useState(0);
  const [lastContact,  setLastContact]  = useState(null);   // remembered across flows
  const [contactPrompt,setContactPrompt]= useState(false);  // show yes/other UI
  const [newContactVal,setNewContactVal]= useState('');

  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); },
    [messages, isLoading, showSummary, expenses]);

  const addMsg = (role, text) =>
    setMessages((prev) => [...prev, { role, text, timestamp: new Date() }]);

  const handleBack = () => {
    setMessages([]); setFlow(null); setSlots({}); setExpenses(null);
    setAwaitContact(false); setShowSummary(false); setSubmitError('');
    setShowAnalytics(false); setContactPrompt(false); setNewContactVal('');
    setLastContact(null); // clear remembered number on back
    resetConversation();
  };

  // ── Core AI call ────────────────────────────────────────────────────────────
  const callAI = async (userText) => {
    if (aiCallCount >= AI_LIMIT) {
      addMsg('bot', `⚠️ AI limit reached for this session. Please refresh to continue.`);
      return null;
    }
    setAiCallCount((c) => c + 1);

    const base = import.meta.env.VITE_API_BASE_URL;
    console.log('[AI] Calling /api/ai-chat via base:', base);
    console.log('[AI] Message:', userText);

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Response timed out. Please try again.')), 30000)
    );

    try {
      const res = await Promise.race([
        aiChat(userText, messages, slots, profile),
        timeout,
      ]);
      console.log('[AI] Response:', res);
      return res;
    } catch (e) {
      console.error('[AI] Error:', e.message);
      addMsg('bot', `⚠️ ${e.message}`);
      return null;
    }
  };

  // ── Merge AI-extracted fields into slots ────────────────────────────────────
  const mergeFields = (currentSlots, rawFields) => {
    const updated = { ...currentSlots };
    for (const [f, v] of Object.entries(rawFields || {})) {
      if (!v) continue;
      if (validateField(f, v)) updated[f] = f === 'amount' ? Number(v) : v;
    }
    return updated;
  };

  // ── Fetch expenses ──────────────────────────────────────────────────────────
  const fetchExpenses = async (contact) => {
    setIsLoading(true);
    setContactPrompt(false);
    try {
      const data = await getExpensesByContact(contact);
      setExpenses(data); setAwaitContact(false);
      setLastContact(contact); // remember for next time
      addMsg('bot', data.length === 0
        ? "I couldn't find any expenses for that number. Want to try a different one?"
        : `Found ${data.length} expense(s) for you. ${flow === 'modify' ? 'You can change the date or delete any of them below.' : 'Here they are:'}`
      );
    } catch (e) {
      addMsg('bot', `Hmm, I couldn't fetch those expenses: ${e.message}. Try again?`);
      setAwaitContact(true);
    } finally { setIsLoading(false); }
  };

  // Show smart contact prompt if we already have a number
  const triggerContactFlow = () => {
    if (lastContact) {
      setContactPrompt(true);
      setNewContactVal('');
      addMsg('bot', `I have your number on file: ${lastContact}\nWould you like to continue with the same number?`);
    } else {
      setAwaitContact(true);
      addMsg('bot', 'Enter your mobile number (with country code) to fetch your expenses.');
    }
  };

  // ── Main send ───────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;
    setInput('');
    addMsg('user', text);
    setIsLoading(true);

    try {
      // ── Awaiting contact number ─────────────────────────────────────────
      if (awaitContact) {
        const phoneMatch = text.match(/(\+\d{1,4}\s?\d{10})/);
        if (phoneMatch) {
          setIsLoading(false);
          await fetchExpenses(phoneMatch[1].replace(/\s/g, ''));
          return;
        }
        // No phone found — let AI respond naturally
        const res = await callAI(text);
        if (res?.reply) addMsg('bot', res.reply);
        setIsLoading(false);
        return;
      }

      // ── Call AI for everything ──────────────────────────────────────────
      const res = await callAI(text);
      if (!res) { setIsLoading(false); return; }

      const { reply, fields, intent } = res;

      // ── Handle intent ───────────────────────────────────────────────────
      if (intent === 'analytics' && flow !== 'analytics') {
        setFlow('analytics');
        setExpenses(null);      // hide expense card
        setShowAnalytics(true);
        if (reply) addMsg('bot', reply);
        setIsLoading(false);
        return;
      }

      if ((intent === 'view' || intent === 'modify') && flow !== intent) {
        setFlow(intent);
        setSlots({});
        if (expenses !== null) {
          addMsg('bot', intent === 'modify'
            ? 'Sure! Use the Change Date or Delete buttons on any expense below.'
            : 'Here are your expenses:');
          setIsLoading(false);
          return;
        }
        triggerContactFlow();
        setIsLoading(false);
        return;
      }

      if (intent === 'modify' && flow === 'view' && expenses !== null) {
        setFlow('modify');
        addMsg('bot', 'Sure! Use the Change Date or Delete buttons on any expense below.');
        setIsLoading(false);
        return;
      }

      if (intent === 'create' && !flow) {
        setFlow('create');
        setSlots(profileSlots); // pre-fill from profile
        setExpenses(null);
      }

      // ── Merge extracted fields ──────────────────────────────────────────
      const updatedSlots = mergeFields(flow === 'create' ? slots : {}, fields);
      if (flow === 'create' || intent === 'create') setSlots(updatedSlots);

      // ── Show AI reply ───────────────────────────────────────────────────
      if (reply) addMsg('bot', reply);

      // ── Check if all slots filled for create flow ───────────────────────
      if ((flow === 'create' || intent === 'create') &&
          SLOT_ORDER.every((s) => updatedSlots[s])) {
        setShowSummary(true);
      }

    } catch (e) {
      addMsg('bot', `Something went wrong: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  const handleChipClick = (chip) => {
    addMsg('user', chip.msg);
    setInput('');
    // Simulate sending the chip message
    const syntheticEvent = { target: { value: chip.msg } };
    setInput(chip.msg);
    setTimeout(() => {
      setInput('');
      // Directly trigger the send with the chip message
      handleSendText(chip.msg);
    }, 0);
  };

  const handleSendText = async (text) => {
    if (!text || isLoading) return;
    addMsg('user', text);
    setIsLoading(true);

    try {
      const res = await callAI(text);
      if (!res) { setIsLoading(false); return; }
      const { reply, intent } = res;

      if (intent === 'analytics') {
        setFlow('analytics'); setShowAnalytics(true);
        if (reply) addMsg('bot', reply);
      } else if (intent === 'view' || intent === 'modify') {
        setFlow(intent); setSlots({}); setExpenses(null); setAwaitContact(true);
        addMsg('bot', reply || 'Enter your mobile number to fetch your expenses.');
      } else if (intent === 'create') {
        setFlow('create'); setSlots(profileSlots);
        addMsg('bot', reply || "Let's log a new expense. What's your full name?");
      } else {
        if (reply) addMsg('bot', reply);
      }
    } catch (e) {
      addMsg('bot', `Something went wrong: ${e.message}`);
    } finally { setIsLoading(false); }
  };

  const handleConfirmSubmit = async () => {
    setSubmitting(true); setSubmitError('');
    try {
      const res = await createExpense(slots);
      setShowSummary(false);
      addMsg('bot', `Your expense has been saved! 🎉 (ID: ${res.id})\n\nWould you like to log another one or do something else?`);
      setFlow(null); setSlots({});
    } catch (err) { setSubmitError(`Something went wrong: ${err.message}`); }
    finally { setSubmitting(false); }
  };

  const handleEditField = (field) => {
    addMsg('bot', `Sure! What should I change ${FIELD_LABELS[field]} to?`);
    setShowSummary(false);
    // Next message will be treated as the new value for this field
    // We handle this by letting AI pick it up naturally
  };

  const allFilled = SLOT_ORDER.every((s) => slots[s]);

  if (showAnalytics) {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
        <AnalyticsDashboard onBack={() => {
          setShowAnalytics(false);
          setFlow(null);
          addMsg('bot', 'Back to chat! What else can I help you with?');
        }} />
      </div>
    );
  }

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {flow && (
        <div className="px-4 sm:px-6 pt-3 pb-1 shrink-0">
          <button onClick={handleBack} className="text-sm text-blue-600 hover:underline">← Back to Menu</button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
        <div className="max-w-2xl mx-auto">

          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-4 text-gray-400">
              <span className="text-6xl">💬</span>
              <p className="text-lg font-medium text-gray-600">Smart Mode</p>
              <p className="text-sm text-center max-w-xs">
                Just type naturally below — say "log an expense", "show my expenses", or anything else.
              </p>
              <p className="text-xs text-gray-300 mt-1">↓ Type in the box below</p>
            </div>
          )}

          {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
          {isLoading && <TypingIndicator />}

          {/* Smart contact prompt — shown when we have a previous number */}
          {contactPrompt && !isLoading && (
            <div className="flex items-center gap-2 my-2 flex-wrap">
              <button
                onClick={() => { setContactPrompt(false); fetchExpenses(lastContact); }}
                className="px-4 py-2 bg-blue-600 text-white text-xs rounded-xl hover:bg-blue-700 transition"
              >
                Yes, use {lastContact}
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => { setContactPrompt(false); setAwaitContact(true); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-xs rounded-xl hover:bg-gray-300 transition"
                >
                  Use a different number
                </button>
              </div>
            </div>
          )}
          {aiCallCount > 0 && (
            <p className="text-xs text-gray-300 text-right mt-1">AI calls: {aiCallCount}/{AI_LIMIT}</p>
          )}

          {/* Expense list — only show when in view/modify flow, not analytics */}
          {expenses !== null && (flow === 'view' || flow === 'modify') && !isLoading && !showAnalytics && (
            <ExpenseList expenses={expenses} mode={flow}
              onDelete={async (id) => { await deleteExpense(id); setExpenses((p) => p.filter((e) => e.id !== id)); }}
              onUpdateDate={async (id, date) => { const u = await updateExpenseDate(id, date); setExpenses((p) => p.map((e) => e.id === id ? u : e)); }}
              onRetry={() => { setExpenses(null); setAwaitContact(true); addMsg('bot', 'No problem — enter your mobile number again:'); }}
            />
          )}

          {/* Confirmation summary */}
          {showSummary && flow === 'create' && allFilled && (
            <SummaryCard slots={slots}
              onEdit={handleEditField} onConfirm={handleConfirmSubmit}
              submitting={submitting} submitError={submitError}
              onRetry={handleConfirmSubmit}
              onCancel={() => { setShowSummary(false); setSubmitError(''); handleBack(); }}
            />
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input bar — prominent, no chips */}
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
