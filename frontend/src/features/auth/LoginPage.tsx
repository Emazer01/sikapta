import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  ShieldCheck,
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  LogIn,
  CheckCircle2,
  Cpu,
  Video,
  Award,
  CalendarDays,
  Settings,
} from 'lucide-react';
import { useAuth, ROLE_METADATA } from '../../contexts/AuthContext';
import { UserRole } from '../../types';

const ROLE_ICONS: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  admin: Settings,
  examiner: Award,
  operator: Video,
  event_manager: CalendarDays,
  coach: CheckCircle2,
};

export const LoginPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already logged in, redirect to intended page or dashboard
  if (user) {
    const from = (location.state as { from?: { pathname?: string } })?.from?.pathname || '/';
    return <Navigate to={from} replace />;
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (isSubmitting) return;

    const cleanUsername = username.trim();
    if (!cleanUsername || !password) {
      setErrorMsg('Harap masukkan username dan kata sandi Anda.');
      return;
    }

    setErrorMsg(null);
    setIsSubmitting(true);

    try {
      const loggedInUser = await login(cleanUsername, password);
      const roleMeta = ROLE_METADATA[loggedInUser.role];
      const requestedPath = (location.state as { from?: { pathname?: string } })?.from?.pathname;
      const targetPath =
        requestedPath && roleMeta?.allowedPaths.includes(requestedPath) ? requestedPath : '/';
      navigate(targetPath, { replace: true });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal masuk. Periksa kembali username dan kata sandi Anda.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-100 flex flex-col lg:flex-row">
      {/* Top / Left Column: Sign-In Form (placed first so mobile keyboards never obstruct the form) */}
      <div className="flex-1 flex flex-col justify-start lg:justify-center items-center px-4 py-8 sm:px-8 lg:px-14 bg-slate-900 border-b lg:border-b-0 lg:border-r border-slate-800">
        <div className="w-full max-w-md space-y-6">
          {/* Brand Identity */}
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center shadow-lg shadow-amber-900/40 shrink-0">
              <ShieldCheck className="w-7 h-7 text-slate-950" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="text-2xl font-black tracking-wider text-white">SIKAPTA</span>
                <span className="text-2xl font-black tracking-wider text-amber-500">AI</span>
              </div>
              <p className="text-xs text-slate-400 font-medium">
                Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif
              </p>
            </div>
          </div>

          {/* Heading */}
          <div className="pt-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white">Masuk ke Portal SIKAPTA AI</h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Gunakan akun resmi sesuai peran dan kewenangan penugasan Anda.
            </p>
          </div>

          {/* Error Alert */}
          {errorMsg && (
            <div
              role="alert"
              aria-live="assertive"
              className="bg-red-500/10 border border-red-500/40 rounded-xl p-3.5 flex items-start space-x-2.5 text-red-300 text-xs sm:text-sm"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Semantic Sign-In Form */}
          <form method="post" action="/api/auth/login" onSubmit={handleSubmit} className="space-y-5">
            {/* Username / Email Input */}
            <div>
              <label
                htmlFor="username"
                className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
              >
                Username atau Email Resmi
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-5 h-5" />
                </span>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  enterKeyHint="next"
                  required
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Masukkan username atau email"
                  className="w-full min-h-12 pl-11 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <label
                htmlFor="current-password"
                className="block text-xs sm:text-sm font-semibold text-slate-200 mb-1.5"
              >
                Kata Sandi
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </span>
                <input
                  id="current-password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  required
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  placeholder="Masukkan kata sandi"
                  className="w-full min-h-12 pl-11 pr-12 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-base text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute inset-y-0 right-0 px-3.5 flex items-center text-slate-400 hover:text-amber-400 transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-12 flex items-center justify-center space-x-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-base shadow-lg shadow-amber-900/30 transition cursor-pointer disabled:opacity-60"
            >
              <LogIn className="w-5 h-5" />
              <span>{isSubmitting ? 'Memverifikasi Akses...' : 'Masuk ke Sistem'}</span>
            </button>
          </form>

          {/* Security Footer Note */}
          <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
            <span className="flex items-center space-x-1.5">
              <Cpu className="w-4 h-4 text-amber-500" />
              <span>Otentikasi Terenkripsi PBKDF2-SHA256</span>
            </span>
            <span className="text-emerald-400 font-semibold">PostgreSQL RBAC</span>
          </div>
        </div>
      </div>

      {/* Bottom / Right Column: Role Authority & System Information */}
      <div className="flex-1 flex flex-col justify-center px-4 py-8 sm:px-8 lg:px-14 bg-slate-950">
        <div className="max-w-xl mx-auto w-full space-y-6">
          <div>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/30 mb-3">
              Struktur Otorisasi & Hak Akses
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              Pembagian Peran & Kewenangan Operasional
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Sistem SIKAPTA AI menerapkan kontrol akses berbasis peran (Role-Based Access Control) sesuai tugas pokok masing-masing personel:
            </p>
          </div>

          <div className="space-y-3">
            {(Object.keys(ROLE_METADATA) as UserRole[]).map((roleKey) => {
              const meta = ROLE_METADATA[roleKey];
              const Icon = ROLE_ICONS[roleKey];
              return (
                <div
                  key={roleKey}
                  className="p-3.5 sm:p-4 rounded-xl bg-slate-900/90 border border-slate-800 flex items-start space-x-3.5"
                >
                  <div className="w-9 h-9 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                      <span className="text-sm font-bold text-white">{meta.label}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${meta.badgeClass}`}
                      >
                        {meta.code.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">{meta.description}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

