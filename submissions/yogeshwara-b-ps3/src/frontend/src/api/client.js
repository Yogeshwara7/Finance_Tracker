/**
 * API client — all backend calls go through here.
 * Base URL is read from the Vite env variable VITE_API_BASE_URL.
 */
import axios from 'axios';

const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

/** Extract a user-friendly error message from an Axios error. */
function friendlyError(err) {
  if (err.response) {
    const data = err.response.data;
    if (data?.errors?.length) return data.errors.map((e) => e.message).join(' ');
    return data?.error || `Server error (${err.response.status})`;
  }
  return 'Network error — please check your connection.';
}

async function call(fn) {
  try {
    const res = await fn();
    return res.data;
  } catch (err) {
    throw new Error(friendlyError(err));
  }
}

export const createExpense         = (data)          => call(() => http.post('/api/expenses', data));
export const getExpensesByContact  = (contact)       => call(() => http.get('/api/expenses', { params: { contact } }));
export const getExpenseById        = (id)            => call(() => http.get(`/api/expenses/${id}`));
export const updateExpenseDate     = (id, expense_date) => call(() => http.put(`/api/expenses/${id}`, { expense_date }));
export const deleteExpense         = (id)            => call(() => http.delete(`/api/expenses/${id}`));
export const getAnalytics = (contact, period = 'this_month') =>
  call(() => http.get('/api/analytics', { params: { contact, period } }));
export const queryFaq  = (query)   => call(() => http.post('/api/faq', { query }));
export const aiParse   = (message) => call(() => http.post('/api/ai-parse', { message }));
export const aiChat = (message, conversationHistory, currentSlots) => {
  console.log('[API] aiChat →', import.meta.env.VITE_API_BASE_URL + '/api/ai-chat');
  return call(() => http.post('/api/ai-chat', { message, conversationHistory, currentSlots }));
};
