# Personal Finance Tracker — Flow Diagram
**Yogeshwara B | PS3**

---

## 1. Authentication & Profile Setup

```mermaid
flowchart TD
    A([User Visits App]) --> B{Authenticated?}
    B -->|No| C[Google OAuth Login]
    B -->|Yes| D{Profile Exists?}
    C --> C1[Supabase Auth]
    C1 --> D
    D -->|No| E[Profile Setup Form\nname · card type · phone · email]
    E --> F[POST /api/profile]
    F --> G[Saved to user_profiles table]
    G --> H([Dashboard])
    D -->|Yes| H
```

---

## 2. Dashboard — Mode Selection

```mermaid
flowchart TD
    H([Dashboard]) --> I{Choose Mode}
    I -->|Smart Mode| J[AI Chat — Qwen2.5-72B]
    I -->|Quick Mode| K[Rule-based Slot Filling]
    J --> L{Intent Detection}
    K --> L
    L -->|create| M[Expense Creation Flow]
    L -->|view| N[View Expenses Flow]
    L -->|modify| O[Modify / Delete Flow]
    L -->|analytics| P[Analytics Flow]
    L -->|null| Q[Conversational Reply]
```

---

## 3. Expense Creation Flow

```mermaid
flowchart TD
    M([Create Expense]) --> M1[Pre-fill from Profile\nname · card · phone · email]
    M1 --> M2[Collect Missing Fields\ncategory · amount · description · date]
    M2 --> M3{All 4 Fields Filled?}
    M3 -->|No| M4[Ask for Next Missing Field]
    M4 --> M2
    M3 -->|Yes| M5[Show Review Card\nAll 8 fields with Edit buttons]
    M5 --> M6{User Action}
    M6 -->|Edit Field| M7[Update Field]
    M7 --> M5
    M6 -->|Confirm & Submit| M8[POST /api/expenses]
    M8 --> M9[Validate — validate.js middleware]
    M9 --> M10{Valid?}
    M10 -->|No| M11[Return Validation Errors]
    M11 --> M5
    M10 -->|Yes| M12[INSERT into expenses table]
    M12 --> M14([Expense Saved ✓])
```

---

## 4. View Expenses Flow

```mermaid
flowchart TD
    N([View Expenses]) --> N1{Profile has contact?}
    N1 -->|Yes| N2[Auto-fetch\nGET /api/expenses?contact=]
    N1 -->|No| N3[Ask for Mobile Number]
    N3 --> N2
    N2 --> N4[Supabase Query\nfiltered by contact_number]
    N4 --> N5{Results?}
    N5 -->|Empty| N6[No expenses found message]
    N5 -->|Found| N7[Render Expense List\ninline in chat history]
    N7 --> N8([User views expenses])
```

---

## 5. Modify / Delete Flow

```mermaid
flowchart TD
    O([Modify / Delete]) --> O1[Fetch Expenses\nGET /api/expenses?contact=]
    O1 --> O2[Show Expense List\nwith Change Date · Delete buttons]
    O2 --> O3{User Action}
    O3 -->|Change Date| O4[AI extracts target + new date\nmatch by category / position]
    O3 -->|Delete| O5[AI extracts target\nmatch by category / position]
    O4 --> O6[Confirmation Prompt\nChange date from X → Y?]
    O5 --> O7[Confirmation Prompt\nDelete this expense?]
    O6 --> O8{Confirmed?}
    O7 --> O8
    O8 -->|No| O9[Cancelled]
    O8 -->|Yes| O10{Action Type}
    O10 -->|update_date| O11[PUT /api/expenses/:id]
    O10 -->|delete| O12[DELETE /api/expenses/:id]
    O11 --> O13([Done ✓])
    O12 --> O13
```

---

## 6. Analytics Flow

```mermaid
flowchart TD
    P([Analytics]) --> P1{Profile has contact?}
    P1 -->|Yes| P2[Auto-fetch\nGET /api/analytics?contact=&period=]
    P1 -->|No| P3[Ask for Mobile Number]
    P3 --> P2
    P2 --> P4[Supabase aggregation query]
    P4 --> P5[Return:\nby_category totals\nmonthly_total\nlast_5 transactions]
    P5 --> P6[Render Bar Chart — Recharts]
    P6 --> P7[Period Selector\nThis Month · Last Month · 3M · 6M · All]
    P7 -->|Change Period| P2
```

---

## 7. AI Conversation Flow (Smart Mode)

```mermaid
flowchart TD
    J([Smart Mode Message]) --> J1[Send to POST /api/ai-chat\nmessage + history + slots + profile]
    J1 --> J2[Qwen2.5-72B processes\nwith system prompt]
    J2 --> J3[Returns JSON\nreply · fields · intent]
    J3 --> J4{Intent?}
    J4 -->|create| J5[Merge extracted fields into slots]
    J4 -->|view| J6[Fetch expenses]
    J4 -->|modify| J7{Has action fields?}
    J4 -->|analytics| J8[Open analytics dashboard]
    J4 -->|null| J9[Show reply only]
    J5 --> J10{All expense fields filled?}
    J10 -->|No| J11[Show AI reply\nask for next field]
    J10 -->|Yes| J12[Show Review Card]
    J7 -->|Yes| J13[Confirmation prompt\nthen execute API call]
    J7 -->|No| J6
```