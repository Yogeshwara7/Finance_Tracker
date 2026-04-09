import { useState, useEffect } from 'react';
import { updateExpenseDate, deleteExpense } from '../api/client.js';

function DeleteConfirm({ expense, onConfirm, onCancel }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-3 my-1">
      <p className="text-xs font-semibold text-red-700 mb-1">Delete this expense?</p>
      <p className="text-xs text-gray-600 mb-2">
        {expense.category} — ₹{Number(expense.amount).toLocaleString('en-IN')} · {expense.expense_date}
        <br /><span className="text-gray-400">This cannot be undone.</span>
      </p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="flex-1 bg-red-600 text-white py-1 rounded-lg text-xs font-medium hover:bg-red-700">Yes, Delete</button>
        <button onClick={onCancel}  className="flex-1 bg-gray-200 text-gray-700 py-1 rounded-lg text-xs hover:bg-gray-300">Cancel</button>
      </div>
    </div>
  );
}

function ExpenseItem({ exp, mode, frozen, onDeleted, onUpdated, onDirty }) {
  const [editingDate,  setEditingDate]  = useState(false);
  const [newDate,      setNewDate]      = useState('');
  const [confirming,   setConfirming]   = useState(false);
  const [msg,          setMsg]          = useState('');

  const handleSaveDate = async () => {
    if (!newDate) return;
    const [yyyy, mm, dd] = newDate.split('-');
    try {
      const updated = await updateExpenseDate(exp.id, `${dd}-${mm}-${yyyy}`);
      onUpdated(updated);
      onDirty?.();
      setEditingDate(false);
      setMsg('Date updated.');
    } catch (e) { setMsg(e.message); }
  };

  const handleDelete = async () => {
    try {
      await deleteExpense(exp.id);
      onDeleted(exp.id);
      onDirty?.();
    } catch (e) { setMsg(e.message); }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm text-sm mb-2">
      {confirming ? (
        <DeleteConfirm expense={exp}
          onConfirm={handleDelete}
          onCancel={() => setConfirming(false)} />
      ) : (
        <>
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="font-semibold text-gray-800">{exp.category}</span>
                <span className="text-blue-600 font-semibold">₹{Number(exp.amount).toLocaleString('en-IN')}</span>
              </div>
              <p className="text-gray-700 text-xs mb-1">{exp.description}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                <span>📅 {exp.expense_date}</span>
                <span>💳 {exp.card_type}</span>
                <span>👤 {exp.full_name}</span>
                <span>📞 {exp.contact_number}</span>
              </div>
            </div>
            {mode === 'modify' && !frozen && (
              <div className="flex gap-2 ml-2 shrink-0">
                <button onClick={() => { setEditingDate(true); setNewDate(''); }} className="text-xs text-blue-600 hover:underline">Change Date</button>
                <button onClick={() => setConfirming(true)} className="text-xs text-red-500 hover:underline">Delete</button>
              </div>
            )}
          </div>
          {msg && <p className="text-xs text-green-600 mt-1">{msg}</p>}
          {editingDate && (
            <div className="mt-2 flex gap-2 items-center">
              <input type="date" max={new Date().toISOString().split('T')[0]} value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="border border-gray-300 rounded-lg px-2 py-1 text-xs flex-1 cursor-pointer" />
              <button onClick={handleSaveDate} className="text-xs bg-blue-600 text-white px-3 py-1 rounded-lg">Save</button>
              <button onClick={() => setEditingDate(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ExpenseListMessage({ message, onDirty }) {
  const [expenses, setExpenses] = useState([]);
  const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  useEffect(() => {
    setExpenses(message.expenses || []);
  }, [message.expenses]);

  return (
    <div className="flex justify-start mb-3">
      <div className="flex flex-col items-start w-full max-w-lg">
        <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-2 shadow-sm text-sm text-gray-800 mb-2">
          {message.text}
        </div>
        {expenses.map(exp => (
          <ExpenseItem key={exp.id} exp={exp} mode={message.listMode} frozen={message.frozen}
            onDeleted={(id) => setExpenses(prev => prev.filter(e => e.id !== id))}
            onUpdated={(updated) => setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e))}
            onDirty={onDirty}
          />
        ))}
        <span className="text-xs text-gray-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}

const FIELD_LABELS = {
  full_name: 'Full Name', card_type: 'Card Type', category: 'Category',
  amount: 'Amount (₹)', description: 'Description', expense_date: 'Date',
  contact_number: 'Mobile', email: 'Email',
};

function FrozenReview({ slots }) {
  const fields = ['category','amount','description','expense_date','full_name','card_type','contact_number','email'];
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm text-sm w-72 opacity-60">
      <p className="text-gray-500 font-medium mb-2 text-xs">Previous review (updated)</p>
      <table className="w-full">
        <tbody>
          {fields.filter(f => slots[f]).map(f => (
            <tr key={f} className="border-b border-gray-100 last:border-0">
              <td className="py-1 text-gray-400 text-xs w-2/5">{FIELD_LABELS[f]}</td>
              <td className="py-1 text-gray-600 text-xs">{String(slots[f])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MessageBubble({ message, onDirty }) {
  const isUser = message.role === 'user';
  const time   = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (message.isExpenseList) return <ExpenseListMessage message={message} onDirty={onDirty} />;
  if (message.isReview && message.frozen) {
    return (
      <div className="flex justify-start mb-3">
        <div className="flex flex-col items-start">
          <FrozenReview slots={message.slots} />
          <span className="text-xs text-gray-400 mt-1 px-1">{time}</span>
        </div>
      </div>
    );
  }
  if (message.isReview) return null;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div className={`max-w-[75%] flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words shadow-sm
          ${isUser
            ? 'bg-blue-600 text-white rounded-br-sm'
            : 'bg-white text-gray-800 border border-gray-200 rounded-bl-sm'}`}>
          {message.text}
        </div>
        <span className="text-xs text-gray-400 mt-1 px-1">{time}</span>
      </div>
    </div>
  );
}
