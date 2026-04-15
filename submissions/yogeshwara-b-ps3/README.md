# Yogeshwara B — Round 1 Submission

## Problem Statement
I chose: PS3 — Personal Finance Tracker with AI Agent

## Tools & Stack
- React 18 (Vite) — frontend UI
- Node.js + Express 5 — backend API
- Supabase (PostgreSQL) — database
- HuggingFace Inference API (Qwen2.5-72B) — conversational AI
- Recharts — analytics charts
- Nodemailer — expense confirmation emails
- Vercel — frontend deployment
- Render — backend deployment

## Live Demo
**Live link:** https://financetracker8.vercel.app

Setup steps (if running locally):
1. Clone the repo and checkout your branch
2. Navigate into `submissions/yogeshwara-b-ps3`
3. Install backend: `cd src/backend && npm install`
4. Install frontend: `cd src/frontend && npm install`
5. Copy `.env.example` to `src/backend/.env` and fill in values
6. Copy `.env.example` to `src/frontend/.env` and set `VITE_API_BASE_URL`
7. Run backend: `cd src/backend && npm run dev`
8. Run frontend: `cd src/frontend && npm run dev`

## Architecture Overview
Full design document: /docs/design-doc.pdf
Flow diagram: /docs/flow-diagram.pdf

## Features
- **Smart Mode (AI)** — conversational expense logging powered by Qwen2.5-72B via HuggingFace. Understands natural language, extracts fields, detects intent, handles corrections.
- **Quick Mode (Rule-based)** — structured slot-filling chat with validation at every step.
- **User Profile** — collected on first login, pre-fills name/card/phone/email for all future expenses.
- **View Expenses** — fetch all expenses by contact number, shown inline in chat history.
- **Modify / Delete** — change expense date or delete with confirmation before executing.
- **Analytics Dashboard** — spending breakdown by category (bar chart), monthly total, last 5 transactions.
- **Email Notifications** — confirmation email sent after each expense is saved.

## Validation Rules Implemented
- Name: first and last name required (min 2 words)
- Card Type: must be "Debit Card" or "Credit Card"
- Category: must be "Transport", "Shopping", or "Food"
- Amount: positive number, max 2 decimal places
- Description: non-empty, max 300 characters
- Date: DD-MM-YYYY format, not in the future
- Contact: country code + 10 digits (e.g. +911234567890)
- Email: valid format

## API Endpoints
| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/expenses` | Create expense |
| GET | `/api/expenses?contact=` | Get expenses by contact |
| PUT | `/api/expenses/:id` | Update expense date |
| DELETE | `/api/expenses/:id` | Delete expense |
| GET | `/api/analytics?contact=` | Spending analytics |
| POST | `/api/ai-chat` | AI conversation |
| GET/POST | `/api/profile` | User profile |

## Known Limitations
- Supabase free tier pauses after inactivity — resume project if demo appears offline.
- HuggingFace free tier has rate limits — AI responses may be slow under load.
- Only date changes and deletes are supported for expense modification (no amount/category edits).
