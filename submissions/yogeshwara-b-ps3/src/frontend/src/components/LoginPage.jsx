/**
 * LoginPage — shown when no user session exists.
 * Simple, clean Google OAuth entry point.
 */
import { useAuth } from '../context/AuthContext.jsx';

export default function LoginPage() {
  const { signInWithGoogle } = useAuth();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-sm flex flex-col items-center gap-6">

        {/* Logo */}
        <div className="flex flex-col items-center gap-2">
          <span className="text-5xl">💰</span>
          <h1 className="text-2xl font-bold text-gray-800">Finance Tracker</h1>
          <p className="text-sm text-gray-400 text-center">
            Your personal AI-powered expense assistant
          </p>
        </div>

        {/* Divider */}
        <div className="w-full border-t border-gray-100" />

        {/* Sign in button */}
        <button
          onClick={signInWithGoogle}
          className="w-full flex items-center justify-center gap-3 border border-gray-300
                     rounded-xl px-4 py-3 text-sm font-medium text-gray-700
                     hover:bg-gray-50 hover:border-gray-400 transition-all shadow-sm"
        >
          {/* Google SVG icon */}
          <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
            <path d="M47.5 24.5c0-1.6-.1-3.2-.4-4.7H24v9h13.1c-.6 3-2.3 5.5-4.9 7.2v6h7.9c4.6-4.3 7.4-10.6 7.4-17.5z" fill="#4285F4"/>
            <path d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.9-6c-2.1 1.4-4.8 2.3-8 2.3-6.1 0-11.3-4.1-13.2-9.7H2.6v6.2C6.6 42.8 14.7 48 24 48z" fill="#34A853"/>
            <path d="M10.8 28.8A14.8 14.8 0 0 1 10 24c0-1.7.3-3.3.8-4.8v-6.2H2.6A23.9 23.9 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l8.2-6z" fill="#FBBC05"/>
            <path d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.9 2.5 30.4 0 24 0 14.7 0 6.6 5.2 2.6 13.2l8.2 6.2C12.7 13.6 17.9 9.5 24 9.5z" fill="#EA4335"/>
          </svg>
          Continue with Google
        </button>

        <p className="text-xs text-gray-400 text-center">
          Your data is stored securely and never shared.
        </p>
      </div>
    </div>
  );
}
