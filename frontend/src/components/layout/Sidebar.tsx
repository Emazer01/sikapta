import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  CalendarDays,
  Activity,
  Users,
  Video,
  History,
  Cpu,
  FileText,
  Settings,
  X
} from 'lucide-react';
import { useAuth, ROLE_METADATA } from '../../contexts/AuthContext';

const navigationItems = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Kegiatan Samapta', path: '/events', icon: CalendarDays },
  { name: 'Uji Langsung', path: '/assessment', icon: Activity },
  { name: 'Data Peserta', path: '/participants', icon: Users },
  { name: 'Manajemen Kamera', path: '/cameras', icon: Video },
  { name: 'Riwayat Asesmen', path: '/history', icon: History },
  { name: 'Benchmark Model', path: '/benchmark', icon: Cpu },
  { name: 'Laporan', path: '/reports', icon: FileText },
  { name: 'Pengaturan & Akun', path: '/settings', icon: Settings },
];

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ isOpen = false, onClose }) => {
  const { user, canAccessPath } = useAuth();
  const visibleItems = navigationItems.filter((item) => canAccessPath(item.path));
  const roleMeta = user ? ROLE_METADATA[user.role] : null;

  return (
    <aside
      className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 text-slate-100 flex flex-col border-r border-slate-800 shrink-0 transition-transform duration-300 ease-in-out md:static md:translate-x-0 md:w-64 ${
        isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
      }`}
    >
      {/* Brand Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div>
            <img
            src="/SIKAPTA AI Fitness Analysis Emblem.png"
            alt="Sikapta Emblem"
            className="img-fluid w-100 rounded"
          />
          </div>
          <div>
            <div className="flex items-center space-x-1.5">
              <span className="text-lg font-black tracking-wider text-white">SIKAPTA</span>
              <span className="text-lg font-black tracking-wider text-amber-500">AI</span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium tracking-tight">Presisi Gerak, Akurasi Penilaian</p>
          </div>
        </div>

        {/* Mobile Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="md:hidden p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          aria-label="Tutup Menu"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Menu Utama
        </div>
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={() => onClose?.()}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-amber-600/15 text-amber-400 border-l-4 border-amber-500 font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.name}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Role & System Badge Footer */}
      <div className="p-4 border-t border-slate-800 bg-slate-950/40 space-y-2.5">
        {user && roleMeta && (
          <div className="pb-2.5 border-b border-slate-800/80">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-200 truncate">{user.full_name}</span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${roleMeta.badgeClass}`}>
                {roleMeta.label}
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {roleMeta.description}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span>Engine Status</span>
          <span className="flex items-center text-emerald-400 font-semibold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1.5 animate-pulse" />
            Siap Uji
          </span>
        </div>
        <p className="text-[10px] text-slate-400">SIKAPTA AI Core v1.0.0 (CPU Mode)</p>
      </div>
    </aside>
  );
};

