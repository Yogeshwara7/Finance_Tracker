import { useState, useEffect } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts';
import { getAnalytics } from '../api/client.js';
import { useConversation } from '../context/ConversationContext.jsx';

const COLORS = { Transport: '#3b82f6', Shopping: '#f59e0b', Food: '#10b981' };

const PERIODS = [
  { value: 'this_month',    label: 'This Month' },
  { value: 'last_month',    label: 'Last Month' },
  { value: 'last_3_months', label: 'Last 3 Months' },
  { value: 'last_6_months', label: 'Last 6 Months' },
  { value: 'all',           label: 'All Time' },
];

export default function AnalyticsDashboard({ onBack, initialContact }) {
  const { resetConversation } = useConversation();
  const handleBack = onBack || resetConversation;
  const [contact, setContact] = useState(initialContact || '');
  const [period,  setPeriod]  = useState('this_month');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [fetched, setFetched] = useState(false);

  // Auto-fetch if contact is pre-filled
  useEffect(() => {
    if (initialContact) handleFetch();
  }, []);

  const handleFetch = async (overridePeriod) => {
    const c = initialContact || contact.trim();
    if (!c) return;
    const activePeriod = overridePeriod || period;
    setLoading(true); setError(''); setData(null);
    try {
      const res = await getAnalytics(c, activePeriod);
      setData(res);
      setFetched(true);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handlePeriodChange = (p) => {
    setPeriod(p);
    if (data) handleFetch(p);
  };

  const chartData = data
    ? Object.entries(data.by_category).map(([name, value]) => ({ name, value }))
    : [];
  const hasData = data && (data.last_5.length > 0 || Object.values(data.by_category).some(v => v > 0));
  const periodLabel = PERIODS.find(p => p.value === period)?.label || '';

  return (
    <div className="flex flex-col flex-1 max-w-2xl w-full mx-auto px-4 py-6">
      <button onClick={handleBack} className="self-start text-sm text-blue-600 hover:underline mb-4">
        ← Back to Menu
      </button>
      <h2 className="text-xl font-semibold text-gray-700 mb-4">Spending Analytics</h2>

      {/* Contact input */}
      <div className="flex gap-2 mb-4">
        <input
          type="text" value={contact}
          onChange={(e) => setContact(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          placeholder="Enter mobile number (e.g. +911234567890)"
          className="flex-1 border border-gray-300 rounded-xl px-4 py-2 text-sm
                     focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={() => handleFetch()}
          disabled={loading || !contact.trim()}
          className="bg-blue-600 text-white px-5 py-2 rounded-xl text-sm font-medium
                     hover:bg-blue-700 disabled:opacity-40 transition"
        >
          {loading ? 'Loading…' : 'Fetch'}
        </button>
      </div>

      {/* Period filter pills — only shown after first fetch */}
      {fetched && (
        <div className="flex gap-2 flex-wrap mb-6">
          {PERIODS.map((p) => (
            <button
              key={p.value}
              onClick={() => handlePeriodChange(p.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition
                ${period === p.value
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white border border-gray-200 text-gray-600 hover:border-blue-400'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {data && !hasData && (
        <div className="text-center py-12">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-gray-700 font-medium mb-1">No expenses found for {periodLabel.toLowerCase()}.</p>
          <p className="text-sm text-gray-400 mb-4">Try a different period or check your mobile number.</p>
          <button onClick={handleBack}
            className="text-sm text-blue-600 hover:underline">
            Want to create an expense? ← Go back
          </button>
        </div>
      )}

      {hasData && (
        <div className="space-y-6">
          {/* Bar chart */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
            <p className="text-sm font-semibold text-gray-600 mb-3">
              Spending by Category — {periodLabel}
            </p>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => `₹${Number(v).toLocaleString('en-IN')}`} />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {chartData.map((entry) => (
                    <Cell key={entry.name} fill={COLORS[entry.name] || '#6366f1'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Period total */}
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <p className="text-sm text-gray-500">Total — {periodLabel}</p>
            <p className="text-2xl font-bold text-blue-600">
              ₹{Number(data.monthly_total).toLocaleString('en-IN')}
            </p>
          </div>

          {/* Last 5 transactions */}
          {data.last_5.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-gray-600 mb-3">
                Last {data.last_5.length} Transaction{data.last_5.length > 1 ? 's' : ''} — {periodLabel}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-100">
                      <th className="pb-2 font-medium">Date</th>
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium">Amount</th>
                      <th className="pb-2 font-medium">Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.last_5.map((exp) => (
                      <tr key={exp.id} className="border-b border-gray-50 last:border-0">
                        <td className="py-2 text-gray-500">{exp.expense_date}</td>
                        <td className="py-2">
                          <span
                            className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ background: `${COLORS[exp.category]}20`, color: COLORS[exp.category] }}
                          >
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-2 font-medium text-gray-800">
                          ₹{Number(exp.amount).toLocaleString('en-IN')}
                        </td>
                        <td className="py-2 text-gray-500 truncate max-w-[140px]">{exp.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
