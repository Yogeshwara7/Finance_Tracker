import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';

import expensesRouter from './routes/expenses.js';
import analyticsRouter from './routes/analytics.js';
import faqRouter from './routes/faq.js';
import aiParseRouter from './routes/aiParse.js';
import aiChatRouter  from './routes/aiChat.js';
import errorHandler from './middleware/errorHandler.js';

const app = express();
const PORT = process.env.PORT || 4000;

// Initialise Supabase client and attach to app so routes can access it
export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Middleware ────────────────────────────────────────────────────────────────
const allowedOrigins = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Must register OPTIONS before other middleware
app.options('/{*path}', cors(corsOptions));
app.use(cors(corsOptions));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/expenses', expensesRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/faq', faqRouter);
app.use('/api/ai-parse', aiParseRouter);
app.use('/api/ai-chat',  aiChatRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ── Global error handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`PS3 backend running on port ${PORT}`);
});
