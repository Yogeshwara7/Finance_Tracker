/**
 * ProfileSetup — one-time form shown after first login.
 * Collects: full_name, default_card_type, contact_number, email
 */
import { useState } from 'react';
import { saveProfile } from '../api/client.js';
import { supabase } from '../lib/supabase.js';

export default function ProfileSetup({ onComplete }) {
  const [form, setForm] = useState({
    full_name: '', default_card_type: 'Debit Card', contact_number: '', email: '',
  });
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const validate = () => {
    const e = {};
    if (form.full_name.trim().split(/\s+/).length < 2) e.full_name = 'Enter first and last name.';
    if (!/^\+\d{1,4}\d{10}$/.test(form.contact_number)) e.contact_number = 'Include country code, e.g. +911234567890';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) e.email = 'Enter a valid email.';
    return e;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) { setErrors(errs); return; }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await saveProfile(session.access_token, form);
      onComplete(form);
    } catch (err) {
      setErrors({ submit: err.message });
    } finally { setSaving(false); }
  };

  const field = (key, label, placeholder, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"
      />
      {errors[key] && <p className="text-xs text-red-500 mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-md p-8 w-full max-w-md">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">Set up your profile</h2>
        <p className="text-sm text-gray-500 mb-6">We'll use this to pre-fill your expenses — you can always change it later.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {field('full_name', 'Full Name', 'Yogeshwara B')}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Default Card Type</label>
            <select
              value={form.default_card_type}
              onChange={(e) => setForm((p) => ({ ...p, default_card_type: e.target.value }))}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-blue-400"
            >
              <option>Debit Card</option>
              <option>Credit Card</option>
            </select>
          </div>

          {field('contact_number', 'Mobile Number', '+911234567890')}
          {field('email', 'Email', 'you@example.com', 'email')}

          {errors.submit && <p className="text-sm text-red-500">{errors.submit}</p>}

          <button type="submit" disabled={saving}
            className="w-full bg-blue-600 text-white py-3 rounded-xl text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition">
            {saving ? 'Saving…' : 'Save & Continue'}
          </button>
        </form>
      </div>
    </div>
  );
}
