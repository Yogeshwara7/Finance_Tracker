-- PS3 Personal Finance Tracker — Supabase Schema

CREATE TABLE expenses (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       TEXT          NOT NULL,
  card_type       TEXT          NOT NULL CHECK (card_type IN ('Debit Card', 'Credit Card')),
  category        TEXT          NOT NULL CHECK (category IN ('Transport', 'Shopping', 'Food')),
  amount          NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description     TEXT          NOT NULL,
  expense_date    DATE          NOT NULL,
  contact_number  TEXT          NOT NULL,
  email           TEXT          NOT NULL,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_contact ON expenses(contact_number);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at
BEFORE UPDATE ON expenses
FOR EACH ROW EXECUTE FUNCTION update_updated_at();
