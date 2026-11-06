import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { AuthProvider, useAuth, ROLE_METADATA } from './contexts/AuthContext';
import { MainLayout } from './components/layout/MainLayout';
import { LoginPage } from './features/auth/LoginPage';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { EventsManagementPage } from './features/events/EventsManagementPage';
import { LiveAssessmentPage } from './features/assessments/LiveAssessmentPage';
import { ParticipantsPage } from './features/participants/ParticipantsPage';
import { CamerasPage } from './features/cameras/CamerasPage';
import { AssessmentHistoryPage } from './features/assessments/AssessmentHistoryPage';
import { BenchmarkPage } from './features/benchmark/BenchmarkPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-dvh bg-slate-950 flex flex-col items-center justify-center space-y-3 text-slate-300">
        <div className="w-10 h-10 rounded-full border-3 border-amber-500 border-t-transparent animate-spin" />
        <span className="text-xs font-semibold tracking-wider uppercase text-slate-400">
          Memverifikasi Sesi SIKAPTA AI...
        </span>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

const RoleRoute: React.FC<{ path: string; element: React.ReactNode }> = ({ path, element }) => {
  const { user, canAccessPath } = useAuth();
  const navigate = useNavigate();

  if (!canAccessPath(path)) {
    const roleMeta = user ? ROLE_METADATA[user.role] : null;
    return (
      <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-6 text-center shadow-xs space-y-4">
        <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">
            Akses Dibatasi Sesuai Kewenangan Peran
          </h2>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Akun Anda saat ini masuk sebagai{' '}
            <strong className="text-slate-800">{roleMeta?.label || user?.role}</strong>. Halaman ini tidak termasuk dalam kewenangan operasional peran Anda.
          </p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/')}
          className="inline-flex items-center space-x-2 px-4 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Kembali ke Dashboard</span>
        </button>
      </div>
    );
  }

  return <>{element}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              element={
                <RequireAuth>
                  <MainLayout />
                </RequireAuth>
              }
            >
              <Route path="/" element={<RoleRoute path="/" element={<DashboardPage />} />} />
              <Route
                path="/events"
                element={<RoleRoute path="/events" element={<EventsManagementPage />} />}
              />
              <Route
                path="/assessment"
                element={<RoleRoute path="/assessment" element={<LiveAssessmentPage />} />}
              />
              <Route
                path="/participants"
                element={<RoleRoute path="/participants" element={<ParticipantsPage />} />}
              />
              <Route
                path="/cameras"
                element={<RoleRoute path="/cameras" element={<CamerasPage />} />}
              />
              <Route
                path="/history"
                element={<RoleRoute path="/history" element={<AssessmentHistoryPage />} />}
              />
              <Route
                path="/benchmark"
                element={<RoleRoute path="/benchmark" element={<BenchmarkPage />} />}
              />
              <Route
                path="/reports"
                element={<RoleRoute path="/reports" element={<ReportsPage />} />}
              />
              <Route
                path="/settings"
                element={<RoleRoute path="/settings" element={<SettingsPage />} />}
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
};

export default App;
