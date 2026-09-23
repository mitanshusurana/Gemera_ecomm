'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';

// Relative, like every other call in the app. This page alone used an
// absolute NEXT_PUBLIC_API_URL, which Next.js inlines into the bundle at
// build time from .env.local -- so the shipped bundle POSTed the login to
// http://localhost:8000, the BROWSER's own machine. It worked on the server
// and from nowhere else. nginx fronts both apps; the frontend never needs to
// know where the backend lives.
const API_URL = '/api/v1';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const resp = await axios.post(`${API_URL}/auth/login`, {
        email,
        password,
      });

      const { access_token, user } = resp.data;
      if (access_token) {
        localStorage.setItem('caratloop_token', access_token);
        localStorage.setItem('caratloop_user', JSON.stringify(user));
        router.push('/dashboard');
      }
    } catch (err: any) {
      console.error('Login error:', err);
      if (err.response?.status === 429) {
        // nginx throttles this endpoint to a handful of attempts a minute.
        setError('Too many sign-in attempts. Wait a minute and try again.');
      } else {
        setError(err.response?.data?.detail || 'Invalid email or password. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Brand & Graphics */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-surface overflow-hidden items-center justify-center">
        <div className="absolute inset-0 bg-gold-gradient opacity-10"></div>
        <div className="absolute w-[500px] h-[500px] bg-primary/20 rounded-full blur-[100px] -top-20 -left-20 animate-pulse"></div>
        <div className="absolute w-[400px] h-[400px] bg-primary/10 rounded-full blur-[80px] bottom-10 right-10"></div>
        
        <div className="relative z-10 text-center space-y-6 p-12">
          <div className="flex items-center justify-center gap-3">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="url(#gold-gradient)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <defs>
                <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#D4A843" />
                  <stop offset="100%" stopColor="#B28830" />
                </linearGradient>
              </defs>
              <path d="M6 3h12l4 6-10 12L2 9l4-6z" />
              <path d="M2 9h20" />
              <path d="M12 21V9" />
              <path d="M6 3l6 6" />
              <path d="M18 3l-6 6" />
            </svg>
            <h1 className="text-5xl font-playfair font-bold text-white tracking-wider">
              Caratloop
            </h1>
          </div>
          <p className="text-xl text-textSecondary font-light italic">
            Precision Crafted. Compliance Ready.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-background relative">
        <div className="w-full max-w-md glass-card p-10 space-y-8 relative overflow-hidden group">
          <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent group-hover:animate-[shimmer_1.5s_infinite]"></div>
          
          <div className="text-center space-y-2 relative z-10">
            <h2 className="text-3xl font-playfair font-semibold text-white">Welcome Back</h2>
            <p className="text-textSecondary text-sm">Sign in to your ERP dashboard</p>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/30 text-danger text-sm rounded-lg p-3 text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleLogin} className="space-y-6 relative z-10">
            <div className="space-y-2 relative">
              <label className="text-xs text-textSecondary font-medium uppercase tracking-wider">Email</label>
              <input 
                type="email" 
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@caratloop.com"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-white placeholder:text-border focus:outline-none focus:border-primary transition-colors"
              />
            </div>
            
            <div className="space-y-2 relative">
              <div className="flex items-center justify-between">
                <label className="text-xs text-textSecondary font-medium uppercase tracking-wider">Password</label>
              </div>
              <input 
                type="password" 
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-background border border-border rounded-lg px-4 py-3 text-white placeholder:text-border focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <button 
              type="submit"
              disabled={loading}
              className="w-full bg-gold-gradient text-background font-semibold rounded-lg px-4 py-3 hover:opacity-90 transition-opacity shadow-[0_0_20px_rgba(212,168,67,0.3)] hover:shadow-[0_0_30px_rgba(212,168,67,0.5)] disabled:opacity-50"
            >
              {loading ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          
          <div className="text-center text-xs text-textSecondary relative z-10 pt-4">
            Secured by Caratloop Auth &middot; MCA Rule 11(g) Compliant
          </div>
        </div>
      </div>
    </div>
  );
}

