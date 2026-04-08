/**
 * useTour — driver.js product tour hook.
 *
 * Tracks first-visit state in Supabase user metadata so it follows
 * the user across devices and browsers.
 * Falls back to localStorage if Supabase is unavailable.
 */
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { supabase } from '../lib/supabase.js';

const LS_KEY = 'ps3_tour_done'; // localStorage fallback

const RULE_STEPS = [
  {
    element: '#nav-logo',
    popover: {
      title: '💰 Personal Finance Tracker',
      description: 'Your AI-powered expense assistant. Log, view, and manage expenses through a natural chat interface.',
      side: 'bottom', align: 'start',
    },
  },
  {
    element: '#mode-toggle',
    popover: {
      title: '⚙️ Two Modes',
      description: '<b>Quick Mode</b> — step-by-step guided input, fast and structured.<br><b>Smart Mode</b> — just type naturally, AI understands your intent.',
      side: 'bottom', align: 'center',
    },
  },
  {
    element: '#task-create',
    popover: {
      title: '➕ Create Expense',
      description: 'Log a new expense. The bot guides you field by field — or provide multiple fields in one message.',
      side: 'top', align: 'start',
    },
  },
  {
    element: '#task-view',
    popover: {
      title: '📋 View Expenses',
      description: 'Enter your mobile number to fetch all your recorded expenses.',
      side: 'top', align: 'start',
    },
  },
  {
    element: '#task-modify',
    popover: {
      title: '✏️ Modify / Delete',
      description: 'Update the date of an expense or delete it entirely — with a confirmation step.',
      side: 'top', align: 'start',
    },
  },
  {
    element: '#task-analytics',
    popover: {
      title: '📊 View Analytics',
      description: 'Spending by category, monthly totals, and last 5 transactions — with period filters.',
      side: 'top', align: 'start',
    },
  },
  {
    popover: {
      title: "You're all set! 🎉",
      description: 'Click any task card to begin. You can replay this tour anytime using the <b>?</b> button.',
    },
  },
];

// AI mode tour — no element targeting, just centered explanatory steps
const AI_STEPS = [
  {
    popover: {
      title: '🤖 Smart Mode',
      description: 'In Smart Mode, you talk naturally. No menus — just type what you want to do.',
    },
  },
  {
    popover: {
      title: '💬 Free-text intent',
      description: 'Try typing:<br><b>"I paid 500 for food"</b><br><b>"Show my expenses"</b><br><b>"Delete an expense"</b><br>The AI understands your intent automatically.',
    },
  },
  {
    popover: {
      title: '⚡ Quick action cards',
      description: 'Or tap one of the 4 cards at the bottom — Create, View, Modify, or Analytics — to jump straight into that flow.',
    },
  },
  {
    popover: {
      title: '✏️ Smart slot-filling',
      description: 'Once in a flow, you can provide multiple fields at once:<br><b>"Yogeshwara B, debit card, food, 350, 05-04-2026"</b><br>The AI extracts all of them simultaneously.',
    },
  },
  {
    popover: {
      title: '🔄 Amend anytime',
      description: 'Made a mistake? Just say:<br><b>"Actually change the amount to 600"</b><br>Only that field updates — nothing else resets.',
    },
  },
  {
    popover: {
      title: "Ready to go! 🎉",
      description: 'Start chatting or tap a card below. Use the <b>?</b> button to replay this tour anytime.',
    },
  },
];

/** Check if this user has seen the tour — Supabase first, localStorage fallback */
async function hasDoneTour(userId) {
  if (userId) {
    try {
      const { data } = await supabase.auth.getUser();
      return !!data?.user?.user_metadata?.tour_done;
    } catch { /* fall through */ }
  }
  return !!localStorage.getItem(LS_KEY);
}

/** Mark tour as done for this user */
async function markTourDone(userId) {
  // Always set localStorage as instant fallback
  localStorage.setItem(LS_KEY, '1');

  if (userId) {
    try {
      // Store in Supabase user metadata — persists across devices
      await supabase.auth.updateUser({
        data: { tour_done: true, tour_done_at: new Date().toISOString() },
      });
    } catch (e) {
      console.warn('[Tour] Could not persist tour state to Supabase:', e.message);
    }
  }
}

export function useTour() {
  const startTour = (steps = RULE_STEPS, userId = null) => {
    const driverObj = driver({
      showProgress: true,
      animate: true,
      overlayOpacity: 0.55,
      stagePadding: 8,
      stageRadius: 12,
      nextBtnText: 'Next →',
      prevBtnText: '← Back',
      doneBtnText: 'Get Started',
      steps,
      onDestroyed: () => markTourDone(userId),
    });
    driverObj.drive();
  };

  /**
   * Start tour only if this user hasn't seen it before.
   * @param {string|null} userId — Supabase user ID
   */
  const startIfFirstVisit = async (userId = null, steps = RULE_STEPS) => {
    const done = await hasDoneTour(userId);
    if (!done) {
      setTimeout(() => startTour(steps, userId), 600);
    }
  };

  /** Force-reset so tour runs again on next visit */
  const resetTour = async (userId = null) => {
    localStorage.removeItem(LS_KEY);
    if (userId) {
      try {
        await supabase.auth.updateUser({ data: { tour_done: false } });
      } catch { /* ignore */ }
    }
  };

  return { startTour, startIfFirstVisit, resetTour, RULE_STEPS, AI_STEPS };
}
