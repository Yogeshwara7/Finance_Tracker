# Innorve — Round 1 Submissions

**Innorve Software Solutions Pvt. Ltd. | Innovation In Our Nerves**

This is the shared submission repository for the **Innorve Power Platform Intern Selection — Round 1**. All candidates submit their work here in a dedicated folder. Read this entire document before you write a single line of code.

---

## ⚡ Quick Start

```bash
# Step 1 — Clone this repo
git clone https://github.com/innorve-hiring/round1-submissions.git

# Step 2 — Move into the repo
cd round1-submissions

# Step 3 — Create YOUR folder (replace with your actual name and PS number)
mkdir -p submissions/firstname-lastname-ps2

# Step 4 — Start building. Push regularly.
```

---

## 📁 Your Folder Name

Create exactly one folder inside `/submissions` using this format:

```
submissions/firstname-lastname-ps[N]
```

| Example Name | PS Chosen | Correct Folder Name |
|---|---|---|
| Priya Sharma | PS2 — Contact Center Agent Assist | `priya-sharma-ps2` |
| Rohit Verma | PS1 — Smart Branch Intake Assistant | `rohit-verma-ps1` |
| Aisha Nair | PS3 — Personal Finance Tracker | `aisha-nair-ps3` |

**Rules:**
- Lowercase only, no spaces — use hyphens between words
- Must end with `-ps1`, `-ps2`, or `-ps3` matching your chosen problem statement
- Do not change your folder name after your first commit
- Do not create more than one folder
- Do not modify any other candidate's folder

---

## 📂 Required Folder Structure

Inside your folder, organise your work as follows:

```
submissions/your-name-ps[N]/
│
├── README.md             ← REQUIRED — fill this in before you start building
│
├── /src                  ← REQUIRED — all source code goes here
│   └── (your code, app exports, flow definitions, scripts, configs)
│
├── /docs                 ← REQUIRED — design documentation goes here
│   ├── flow-diagram.pdf  ← your flow diagram (PDF or image)
│   └── design-doc.pdf    ← your architecture / design document
│
├── /screenshots          ← REQUIRED for PS3, recommended for all
│   └── (name files clearly — e.g. entity-amendment-1.png)
│
├── /tests                ← REQUIRED for PS3 if platform supports batch testing
│   ├── batch-test.csv
│   └── test-report.pdf
│
├── /data                 ← OPTIONAL — include if relevant
│   └── (mock API schema, seed data, sample JSON)
│
└── .env.example          ← REQUIRED if your solution uses environment variables
    └── (list variable names only — never include actual values)
```

---

## 📝 Your README.md — What to Include

The `README.md` inside your folder is the **first thing evaluators read**. Fill in every section. A blank or template README will cost you marks.

Copy this template into your folder's `README.md` and complete it:

```markdown
# [Your Full Name] — Round 1 Submission

## Problem Statement
I chose: PS[N] — [Title]

## Tools & Stack
- Tool 1 — reason
- Tool 2 — reason

## How to View the Demo
Live link: [paste here] OR
Screen recording: /docs/demo-recording.mp4

Setup steps (if running locally):
1. Clone this folder
2. ...

## Architecture Overview
Full design document: /docs/design-doc.pdf
Flow diagram: /docs/flow-diagram.pdf

## Validation Rules Implemented
- Name: first and last name required
- Phone: country code + 10 digits
- ...

## Known Limitations

## Submission Checklist
- [ ] All source code committed to /src
- [ ] Flow diagram in /docs
- [ ] Design document in /docs
- [ ] Required screenshots in /screenshots
- [ ] No .env files or API keys committed
- [ ] This README is fully filled in
- [ ] Final push made before deadline
```

---

## 🔐 Security — Never Commit Secrets

**Never** commit `.env` files, API keys, passwords, tokens, or credentials.

If your solution needs environment variables, create a `.env.example` file listing variable names only:

```
# .env.example — copy this to .env and fill in your own values
MOCKAPI_BASE_URL=
MOCKAPI_TOKEN=
DATAVERSE_URL=
```

Add a `.gitignore` inside your folder:

```
.env
.env.local
node_modules/
__pycache__/
*.pyc
.DS_Store
```

---

## 📤 How to Push Your Work

Commit regularly throughout the week — not just once at the end. Evaluators check commit history. A single last-minute commit is a red flag.

```bash
# Check what files have changed
git status

# Stage your changes (only touch your own folder)
git add submissions/your-name-ps[N]/

# Commit with a clear, meaningful message
git commit -m "Add: intake form validation logic"

# Push to GitHub
git push origin main
```

**Good commit messages:**
```
Add: welcome message and intent collection flow
Fix: phone number validation regex
Add: POST API call to Mockapi backend
Add: confirmation summary screen
Docs: add flow diagram and design document
```

**Bad commit messages:**
```
update
done
final
wip
aaa
```

---

## ✅ Final Submission Checklist

Go through this before the deadline:

- [ ] My folder is inside `/submissions` and named correctly (`firstname-lastname-ps[N]`)
- [ ] My `README.md` is fully filled in — not a template placeholder
- [ ] I have stated which problem statement I chose
- [ ] All source code is in `/src`
- [ ] My **flow diagram** is in `/docs` — designed by me, not a template
- [ ] My **design / architecture document** is in `/docs`
- [ ] Required screenshots are in `/screenshots`, named clearly
- [ ] Batch test CSV and results are in `/tests` (PS3 only, if platform supports it)
- [ ] A working demo link or run instructions are in my README
- [ ] No `.env` files, API keys, or credentials are committed anywhere
- [ ] My commit history shows regular work throughout the week
- [ ] I have made my **final push before the deadline**
- [ ] I have verified my files are visible on GitHub by opening the repo in a browser

---

## ⏰ Deadline

```
[INSERT DATE]  at  [INSERT TIME]  IST
```

The **last commit timestamp in your folder** is your official submission time. No extensions. No exceptions.

---

## ❓ Questions

Email: **hr@innorve.com**
Subject line: `[Round 1] Your Full Name — PS Number`

Response time: within 1 business day. Do not send direct messages to individual Innorve team members on LinkedIn.

---

## 📋 Repository Structure Overview

```
round1-submissions/
├── README.md                        ← Repo overview
├── .gitignore
└── submissions/
    ├── README.md                    ← Candidate instructions (this file)
    ├── priya-sharma-ps2/            ← Candidate 1
    │   ├── README.md
    │   ├── /src
    │   ├── /docs
    │   └── ...
    ├── rohit-verma-ps1/             ← Candidate 2
    │   └── ...
    └── your-name-ps[N]/             ← Your folder goes here
        └── ...
```

---

*Innorve Software Solutions Pvt. Ltd. | www.innorve.com | hr@innorve.com*
*Innovation In Our Nerves*
