# PS3 — Personal Finance Tracker with AI Agent
**Innorve Software Solutions — Power Platform Intern Selection | Round 1**

---

## Candidate Details

| Field | Value |
|---|---|
| Name | Your Full Name |
| Email | your.email@example.com |
| Problem Statement | PS3 — Personal Finance Tracker with AI Agent |
| Difficulty | Advanced |
| Domain | Consumer Banking / FinTech |
| Submission Date | DD-MM-YYYY |

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 (Vite) |
| State Management | React Context + useReducer |
| Backend | Node.js 20 + Express 5 |
| Database | Supabase (PostgreSQL) |
| HTTP Client | Axios |
| Charts | Recharts |
| Notifications | Nodemailer (SMTP via Gmail) |
| Deployment | Frontend: Vercel · Backend: Render |

---

## Live Demo

- **Frontend (Vercel):** https://your-app.vercel.app *(replace with your live link)*
- **Backend API Base URL:** https://your-api.render.com *(replace with your live link)*
- **Screen Recording:** `/docs/demo-recording.mp4` (5 min max)

*If the live links are unavailable, follow the Local Setup instructions below.*

---

## Repository Structure

```
submissions/your-name-ps3/
├── README.md
├── /src
│   ├── /frontend              # React application
│   │   ├── /components
│   │   │   ├── ChatWindow.jsx
│   │   │   ├── MessageBubble.jsx
│   │   │   ├── TaskMenu.jsx
│   │   │   └── AnalyticsDashboard.jsx
│   │   ├── /context
│   │   │   └── ConversationContext.jsx
│   │   ├── /api
│   │   │   └── client.js
│   │   └── App.jsx
│   └── /backend               # Node.js + Express API
│       ├── server.js
│       ├── /routes
│       │   ├── expenses.js
│       │   ├── analytics.js
│       │   └── faq.js
│       ├── /middleware
│       │   ├── validate.js
│       │   └── errorHandler.js
│       └── /utils
│           ├── dialogEngine.js
│           ├── nlpParser.js
│           └── mailer.js
├── /docs
│   ├── flow-diagram.pdf
│   └── PS3_Architecture_Design_Document.docx
├── /screenshots
│   ├── entity-amendment-1.png
│   ├── entity-amendment-2.png
│   ├── co-referencing-1.png
│   ├── co-referencing-2.png
│   └── analytics-view.png
├── /data
│   ├── supabase-schema.sql
│   └── seed-data.json
├── /tests
│   ├── batch-test.csv
│   └── batch-results.pdf
├── .env.example
└── .gitignore
```

---

## Environment Variables

### Backend (`/src/backend/.env`)

```env
# Supabase
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Server
PORT=4000
NODE_ENV=development
```

### Frontend (`/src/frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:4000
```

> **NEVER commit `.env` files.** The `.env.example` lists variable names only — values are excluded.

---

## Local Setup — Step by Step

### Prerequisites
- Node.js 20+
- npm 9+
- A Supabase account (free tier at supabase.com)

### 1 — Clone and install

```bash
git clone https://github.com/innorve-hiring/round1-submissions.git
cd round1-submissions/submissions/your-name-ps3

# Install backend dependencies
cd src/backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2 — Set up Supabase

1. Create a new Supabase project at supabase.com
2. Run the schema from `/data/supabase-schema.sql` in the Supabase SQL Editor
3. Optionally run `/data/seed-data.json` to populate sample records
4. Copy your **Project URL** and **service_role** key from Project Settings → API

### 3 — Configure environment variables

```bash
# In /src/backend
cp .env.example .env
# Fill in your Supabase URL, keys, and SMTP credentials

# In /src/frontend
cp .env.example .env
# Set VITE_API_BASE_URL=http://localhost:4000
```

### 4 — Run the backend

```bash
cd src/backend
npm run dev
# API running at http://localhost:4000
```

### 5 — Run the frontend

```bash
cd src/frontend
npm run dev
# App running at http://localhost:5173
```

---

## API Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/expenses` | Create a new expense record |
| GET | `/api/expenses?contact=+91XXXXXXXXXX` | Retrieve all expenses by mobile number |
| GET | `/api/expenses/:id` | Retrieve a single expense by ID |
| PUT | `/api/expenses/:id` | Update the date of an existing expense |
| DELETE | `/api/expenses/:id` | Delete an expense record |
| GET | `/api/analytics?contact=+91XXXXXXXXXX` | Spending by category, monthly total, last 5 |
| POST | `/api/faq` | Inline FAQ lookup (no dialog trigger) |

### Sample POST `/api/expenses` Request Body

```json
{
  "full_name": "Arjun Sharma",
  "card_type": "Debit Card",
  "category": "Transport",
  "amount": 350.00,
  "description": "Uber to airport",
  "expense_date": "05-04-2026",
  "contact_number": "+919876543210",
  "email": "arjun.sharma@example.com"
}
```

### Sample Response

```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "message": "Expense recorded successfully."
}
```

---

## Validation Rules

| Field | Rule |
|---|---|
| Full Name | First and last name both required (minimum 2 words) |
| Card Type | Must be exactly `Debit Card` or `Credit Card` |
| Category | Must be exactly `Transport`, `Shopping`, or `Food` |
| Amount | Numeric, greater than zero, max 2 decimal places |
| Description | Non-empty free text, max 300 characters |
| Date | DD-MM-YYYY format; must not be a future date |
| Contact Number | Country code followed by exactly 10 digits (e.g. `+91XXXXXXXXXX`) |
| Email | Valid RFC 5322 email format |

All validation is enforced in:
- **React frontend** — instant feedback as the user types / submits
- **Express middleware (`validate.js`)** — server-side authoritative check before any DB write

---

## Dialog Features

### Entity Amendment

If a user corrects a field mid-conversation (e.g. *"Actually, change the amount to 500"*), the dialog engine (`dialogEngine.js`) detects the amendment keyword, updates only that slot, and confirms the change before continuing — without restarting the flow.

Evidence: `/screenshots/entity-amendment-1.png`, `/screenshots/entity-amendment-2.png`

### Co-referencing

When a user provides multiple fields in one message (e.g. *"My name is Arjun Sharma, card is Debit Card, category is Transport"*), the NLP parser (`nlpParser.js`) extracts all detected entities and fills those slots simultaneously — only prompting for remaining unfilled fields.

Evidence: `/screenshots/co-referencing-1.png`, `/screenshots/co-referencing-2.png`

### FAQ Responses (Inline — no dialog trigger)

| User Input | Bot Response |
|---|---|
| "What categories are supported?" | Transport, Shopping, and Food. |
| "What card types can I use?" | Debit Card or Credit Card. |
| "What date format should I use?" | DD-MM-YYYY — for example, 05-04-2026. |
| "How do I delete an expense?" | Choose 'Modify / Delete Expense' from the menu and provide your mobile number. |
| "Is my data secure?" | Yes — your data is stored securely in Supabase and is never shared. |

---

## Analytics View

Accessible via the **Analytics** tab in the UI after entering a mobile number. Displays:

- **Spending by Category** — bar chart (Recharts) showing totals for Transport, Shopping, Food
- **Monthly Total** — sum of all expenses for the current calendar month
- **Last 5 Transactions** — most recent 5 records with date, category, amount, and description

---

## Bonus Features Implemented

- [ ] Natural language spend queries — e.g. "How much did I spend on food last week?"
- [ ] Budget alerts — configurable per-category threshold with notification when exceeded
- [ ] Voice input — Web Speech API microphone support in the chat widget

*(Check the boxes that apply to your submission)*

---

## Known Limitations

- Supabase free tier pauses after 1 week of inactivity — resume the project if the demo link appears offline.
- The dialog engine uses keyword-based NLP, not a full ML model — complex phrasing may not be parsed correctly.
- Email notifications require an active SMTP app password — Gmail's 2FA must be enabled.
- No authentication layer — any user with a valid mobile number can view records belonging to that number.
- Voice input (SpeechRecognition) is only supported in Chrome and Edge — not Firefox or Safari.

---

## Submission Checklist

- [ ] Folder named `firstname-lastname-ps3` inside `/submissions`
- [ ] README.md fully completed
- [ ] Flow diagram in `/docs/flow-diagram.pdf`
- [ ] Architecture design document in `/docs/`
- [ ] All source code in `/src`
- [ ] Entity amendment screenshots (min 2) in `/screenshots`
- [ ] Co-referencing screenshots (min 2) in `/screenshots`
- [ ] Supabase schema SQL in `/data/supabase-schema.sql`
- [ ] Batch test CSV + results in `/tests` (if applicable)
- [ ] No `.env` files committed anywhere
- [ ] `.env.example` lists all required variable names
- [ ] Regular commit history throughout the week
- [ ] Final push made before the deadline

---

*Innorve Software Solutions Pvt. Ltd. — Innovation In Our Nerves*
