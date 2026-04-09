import { ConversationProvider, useConversation } from './context/ConversationContext.jsx';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import TaskMenu from './components/TaskMenu.jsx';
import ChatWindow from './components/ChatWindow.jsx';
import AIChatWindow from './components/AIChatWindow.jsx';
import AnalyticsDashboard from './components/AnalyticsDashboard.jsx';
import LoginPage from './components/LoginPage.jsx';
import ProfileSetup from './components/ProfileSetup.jsx';
import { useTour } from './hooks/useTour.js';
import { useEffect, useState } from 'react';
import { getProfile } from './api/client.js';
import { supabase } from './lib/supabase.js';

function AppShell() {
  const { currentTask, aiMode, toggleAiMode } = useConversation();
  const { user, loading, signOut } = useAuth();
  const { startTour, startIfFirstVisit, RULE_STEPS, AI_STEPS } = useTour();
  const [profile, setProfile]           = useState(undefined); // undefined=loading, null=missing
  const [profileLoading, setProfileLoading] = useState(true);

  useEffect(() => {
    if (user && !loading && profile) {
      startIfFirstVisit(user.id, aiMode ? AI_STEPS : RULE_STEPS);
    }
  }, [user, loading, profile]);

  // Load profile once user is known
  useEffect(() => {
    if (!user) { setProfileLoading(false); return; }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      try {
        const p = await getProfile(session.access_token);
        setProfile(p); // null if not found
      } catch { setProfile(null); }
      finally { setProfileLoading(false); }
    });
  }, [user]);

  if (loading || profileLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <span className="text-gray-400 text-sm">Loading…</span>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // First-time user — collect profile
  if (profile === null) return <ProfileSetup onComplete={(p) => setProfile(p)} />;

  const avatarUrl = user.user_metadata?.avatar_url;
  const firstName = user.user_metadata?.full_name?.split(' ')[0] || user.email;

  return (
    <div className="h-screen flex flex-col bg-gray-50 overflow-hidden">

      {/* ── Nav ── */}
      <header className="shrink-0 bg-white border-b border-gray-200 px-4 sm:px-6 py-3
                         flex items-center justify-between shadow-sm z-10">
        {/* Logo */}
        <div id="nav-logo" className="flex items-center gap-2 min-w-0">
          <span className="text-xl">💰</span>
          <span className="font-semibold text-gray-800 text-base sm:text-lg truncate">
            Personal Finance Tracker
          </span>
        </div>

        {/* Centre toggle */}
        <div id="mode-toggle" className="flex items-center gap-1 bg-gray-100 rounded-full p-1 shrink-0">
          <button
            onClick={() => aiMode && toggleAiMode()}
            className={`px-3 py-1 rounded-full text-xs font-medium transition
              ${!aiMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Quick Mode
          </button>
          <button
            onClick={() => !aiMode && toggleAiMode()}
            className={`px-3 py-1 rounded-full text-xs font-medium transition
              ${aiMode ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
          >
            Smart Mode
          </button>
        </div>

        {/* User */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {avatarUrl && (
            <img src={avatarUrl} alt={firstName}
              className="w-7 h-7 rounded-full object-cover shrink-0" />
          )}
          <span className="text-sm text-gray-600 hidden sm:block truncate max-w-[120px]">
            {firstName}
          </span>
          {/* Tour help button */}
          <button
            onClick={() => startTour(aiMode ? AI_STEPS : RULE_STEPS, user.id)}
            title="Take a tour"
            className="w-6 h-6 rounded-full bg-gray-100 hover:bg-blue-100 text-gray-500
                       hover:text-blue-600 text-xs font-bold flex items-center justify-center
                       transition shrink-0"
          >
            ?
          </button>
          <button onClick={signOut}
            className="text-xs text-gray-400 hover:text-red-500 transition shrink-0">
            Sign out
          </button>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 overflow-hidden flex flex-col">
        {aiMode && <AIChatWindow profile={profile} />}
        {!aiMode && !currentTask                                                                      && <TaskMenu />}
        {!aiMode && currentTask === 'analytics' && <AnalyticsDashboard initialContact={profile?.contact_number} />}
        {!aiMode && (currentTask === 'create' || currentTask === 'view' || currentTask === 'modify') && <ChatWindow profile={profile} />}
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ConversationProvider>
        <AppShell />
      </ConversationProvider>
    </AuthProvider>
  );
}
