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

### Getting a HuggingFace API Key

The AI chat feature requires a HuggingFace token with Inference Provider access:

1. Go to [huggingface.co](https://huggingface.co) and create a free account
2. Navigate to **Settings → Access Tokens** → click **New token**
3. Give it a name, set type to **Read**, and enable **"Make calls to Inference Providers"** under the Inference section
4. Copy the token — it starts with `hf_`
5. Paste it as `HF_API_KEY` in your `.env`

### Enabling the Featherless AI Provider (for Qwen2.5-72B)

The model `Qwen/Qwen2.5-72B-Instruct` runs on the Featherless AI provider:

1. Go to [huggingface.co/Qwen/Qwen2.5-72B-Instruct](https://huggingface.co/Qwen/Qwen2.5-72B-Instruct)
2. Click **Deploy → Inference API**
3. In the provider dropdown, select **Featherless AI**
4. Set `HF_MODEL=Qwen/Qwen2.5-72B-Instruct:featherless-ai` in your `.env`

> If Featherless AI is unavailable, use `Qwen/Qwen2.5-7B-Instruct` (smaller, works on default provider).

## Architecture Overview
Full design document: /docs/design-doc.pdf
Flow diagram: /docs/flow-diagram.pdf

## Project Structure

```
yogeshwara-b-ps3/
├── README.md
├── .env.example
├── .gitignore
├── /src
│   ├── /backend
│   │   ├── server.js              # Express app entry point
│   │   ├── /routes
│   │   │   ├── expenses.js        # CRUD endpoints
│   │   │   ├── analytics.js       # Spending analytics
│   │   │   ├── aiChat.js          # AI conversation (Qwen2.5-72B)
│   │   │   ├── aiParse.js         # NLP field extraction
│   │   │   ├── faq.js             # FAQ keyword lookup
│   │   │   └── profile.js         # User profile (JWT auth)
│   │   ├── /middleware
│   │   │   ├── validate.js        # Request validation
│   │   │   └── errorHandler.js    # Global error handler
│   │   └── /utils
│   │       ├── dialogEngine.js    # Rule-based dialog engine
│   │       ├── nlpParser.js       # Regex NLP parser
│   │       └── mailer.js          # Email notifications
│   └── /frontend
│       ├── /src
│       │   ├── App.jsx            # Root component + auth/profile gate
│       │   ├── /components
│       │   │   ├── AIChatWindow.jsx     # Smart Mode (AI chat)
│       │   │   ├── ChatWindow.jsx       # Quick Mode (rule-based)
│       │   │   ├── TaskMenu.jsx         # Quick Mode task selector
│       │   │   ├── AnalyticsDashboard.jsx
│       │   │   ├── LoginPage.jsx
│       │   │   ├── ProfileSetup.jsx     # First-login profile form
│       │   │   └── MessageBubble.jsx
│       │   ├── /context
│       │   │   ├── AuthContext.jsx
│       │   │   └── ConversationContext.jsx
│       │   ├── /api
│       │   │   └── client.js      # Axios API client
│       │   └── /lib
│       │       └── supabase.js    # Supabase client
├── /docs
│   ├── flow-diagram.md            # Mermaid flow diagrams
│   └── design-doc-prompt.md       # Design doc generation prompt
├── /data
│   ├── supabase-schema.sql        # Database schema
│   └── seed-data.json             # Sample data
├── /screenshots                   # App screenshots
└── /tests                         # Batch test CSV + results
```

## Features
- **Smart Mode (AI)** — conversational expense logging powered by Qwen2.5-72B via HuggingFace. Understands natural language, extracts fields, detects intent, handles corrections.
- **Quick Mode (Rule-based)** — structured slot-filling chat with validation at every step.
- **User Profile** — collected on first login, pre-fills name/card/phone/email for all future expenses.
- **View Expenses** — fetch all expenses by contact number, shown inline in chat history.
- **Modify / Delete** — change expense date or delete with confirmation before executing.
- **Analytics Dashboard** — spending breakdown by category (bar chart), monthly total

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
