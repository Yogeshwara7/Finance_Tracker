/**
 * GET  /api/profile        — fetch profile for authenticated user
 * POST /api/profile        — upsert profile for authenticated user
 *
 * Expects header: Authorization: Bearer <supabase_access_token>
 */
import { Router } from 'express';
import { supabase } from '../server.js';

const router = Router();

/** Extract user_id from Supabase JWT */
async function getUserId(req, res) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) { res.status(401).json({ error: 'Missing auth token.' }); return null; }
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) { res.status(401).json({ error: 'Invalid token.' }); return null; }
  return user.id;
}

// GET /api/profile
router.get('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req, res);
    if (!userId) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // PGRST116 = not found
    res.json(data || null);
  } catch (err) { next(err); }
});

// POST /api/profile
router.post('/', async (req, res, next) => {
  try {
    const userId = await getUserId(req, res);
    if (!userId) return;

    const { full_name, default_card_type, contact_number, email } = req.body;

    const { data, error } = await supabase
      .from('user_profiles')
      .upsert({ user_id: userId, full_name, default_card_type, contact_number, email },
               { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

export default router;
