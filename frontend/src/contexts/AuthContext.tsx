import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { UserAccount, UserRole } from '../types';

export interface RoleMetadata {
  code: UserRole;
  label: string;
  description: string;
  badgeClass: string;
  lightBadgeClass: string;
  allowedPaths: string[];
}

export const ROLE_METADATA: Record<UserRole, RoleMetadata> = {
  admin: {
    code: 'admin',
    label: 'Administrator',
    description:
      'Mengelola konfigurasi, akun/hak akses, kamera, profil aturan, konektivitas, dan pemeliharaan sistem.',
    badgeClass: 'bg-amber-500/15 text-amber-400 border-amber-500/40',
    lightBadgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    allowedPaths: [
      '/',
      '/events',
      '/assessment',
      '/participants',
      '/cameras',
      '/history',
      '/benchmark',
      '/reports',
      '/settings',
    ],
  },
  examiner: {
    code: 'examiner',
    label: 'Penguji / Examiner',
    description:
      'Memilih peserta dan jenis tes, memulai/mengendalikan asesmen, memeriksa hasil, memberi catatan, dan menyetujui atau menolak hasil sesuai kewenangan.',
    badgeClass: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
    lightBadgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    allowedPaths: ['/', '/events', '/assessment', '/participants', '/history', '/reports'],
  },
  operator: {
    code: 'operator',
    label: 'Operator',
    description:
      'Menyiapkan perangkat kamera, memantau stream, membantu proses pelaksanaan, dan memastikan perangkat siap.',
    badgeClass: 'bg-sky-500/15 text-sky-400 border-sky-500/40',
    lightBadgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
    allowedPaths: ['/', '/assessment', '/cameras', '/benchmark'],
  },
  event_manager: {
    code: 'event_manager',
    label: 'Pengelola Kegiatan',
    description:
      'Membuat kegiatan Samapta, mengelola peserta, gelombang, nomor dada/warna rompi, hasil lari, dan rekap kegiatan.',
    badgeClass: 'bg-purple-500/15 text-purple-400 border-purple-500/40',
    lightBadgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    allowedPaths: ['/', '/events', '/participants', '/history', '/reports'],
  },
  coach: {
    code: 'coach',
    label: 'Pelatih / Pimpinan',
    description: 'Meninjau hasil dan laporan sebagai bahan evaluasi sesuai kewenangan.',
    badgeClass: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/40',
    lightBadgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    allowedPaths: ['/', '/events', '/participants', '/history', '/reports'],
  },
};

interface AuthContextValue {
  user: UserAccount | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<UserAccount>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
  canAccessPath: (path: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_STORAGE_KEY = 'sikapta_token';
const USER_STORAGE_KEY = 'sikapta_user';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_STORAGE_KEY));
  const [user, setUser] = useState<UserAccount | null>(() => {
    try {
      const saved = localStorage.getItem(USER_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as UserAccount) : null;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(!!localStorage.getItem(TOKEN_STORAGE_KEY));

  const clearAuth = useCallback(() => {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const activeToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!activeToken) {
      clearAuth();
      setIsLoading(false);
      return;
    }
    try {
      const me = await api.getMe();
      setUser(me);
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(me));
    } catch {
      clearAuth();
    } finally {
      setIsLoading(false);
    }
  }, [clearAuth]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  useEffect(() => {
    const handleUnauthorized = () => {
      clearAuth();
    };
    window.addEventListener('sikapta:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('sikapta:unauthorized', handleUnauthorized);
    };
  }, [clearAuth]);

  const login = async (username: string, password: string): Promise<UserAccount> => {
    const res = await api.login({ username, password });
    localStorage.setItem(TOKEN_STORAGE_KEY, res.access_token);
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(res.user));
    setToken(res.access_token);
    setUser(res.user);
    return res.user;
  };

  const logout = async () => {
    try {
      if (localStorage.getItem(TOKEN_STORAGE_KEY)) {
        await api.logout();
      }
    } catch {
      // Ignore logout network error
    } finally {
      clearAuth();
    }
  };

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      if (!user) return false;
      if (user.role === 'admin') return true;
      return roles.includes(user.role);
    },
    [user]
  );

  const canAccessPath = useCallback(
    (path: string) => {
      if (!user) return false;
      const meta = ROLE_METADATA[user.role];
      if (!meta) return path === '/';
      return meta.allowedPaths.includes(path);
    },
    [user]
  );

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        login,
        logout,
        refreshUser,
        hasRole,
        canAccessPath,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return ctx;
};

