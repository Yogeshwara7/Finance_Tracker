/**
 * mailer.js — Nodemailer transporter for expense confirmation emails.
 * Uses Gmail SMTP with an App Password (2FA must be enabled on the Gmail account).
 *
 * Set these in /src/backend/.env:
 *   SMTP_HOST=smtp.gmail.com
 *   SMTP_PORT=587
 *   SMTP_USER=your-email@gmail.com
 *   SMTP_PASS=your-app-password
 */
import nodemailer from 'nodemailer';

// Create a reusable transporter — lazily initialised so missing env vars
// don't crash the server on startup in development without SMTP configured.
function createTransporter() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST || 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: false, // STARTTLS
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send an expense confirmation email to the user.
 * Silently logs and swallows errors so a mail failure never breaks the API.
 *
 * @param {object} expense — the saved expense record
 */
export async function sendExpenseConfirmation(expense) {
  // Skip silently if SMTP is not configured
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[Mailer] SMTP not configured — skipping confirmation email.');
    return;
  }

  const transporter = createTransporter();

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
      <h2 style="color:#2563eb;margin-bottom:4px;">Expense Recorded ✅</h2>
      <p style="color:#6b7280;margin-top:0;">Hi ${expense.full_name}, your expense has been saved successfully.</p>
      <table style="width:100%;border-collapse:collapse;margin-top:16px;font-size:14px;">
        ${row('Expense ID',    expense.id)}
        ${row('Category',      expense.category)}
        ${row('Card Type',     expense.card_type)}
        ${row('Amount',        `₹${Number(expense.amount).toLocaleString('en-IN')}`)}
        ${row('Description',   expense.description)}
        ${row('Date',          expense.expense_date)}
        ${row('Mobile',        expense.contact_number)}
      </table>
      <p style="font-size:12px;color:#9ca3af;margin-top:24px;">
        This is an automated message from Personal Finance Tracker. Do not reply.
      </p>
    </div>`;

  try {
    await transporter.sendMail({
      from:    `"Finance Tracker" <${process.env.SMTP_USER}>`,
      to:      expense.email,
      subject: `Expense Recorded — ${expense.category} ₹${expense.amount}`,
      html,
    });
    console.log(`[Mailer] Confirmation sent to ${expense.email}`);
  } catch (err) {
    console.error('[Mailer] Failed to send email:', err.message);
  }
}

function row(label, value) {
  return `
    <tr>
      <td style="padding:8px 12px;background:#f9fafb;border-bottom:1px solid #e5e7eb;color:#6b7280;width:40%;">${label}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #e5e7eb;color:#111827;font-weight:500;">${value ?? '—'}</td>
    </tr>`;
}
