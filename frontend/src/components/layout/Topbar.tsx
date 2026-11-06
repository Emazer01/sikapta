import React from 'react';
import { useLocation } from 'react-router-dom';
import { Database, Cpu, User, Menu } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../services/api';

const routeNames: Record<string, string> = {
  '/': 'Dashboard Pemantauan',
  '/events': 'Kegiatan Samapta',
  '/assessment': 'Uji Kesamaptaan Langsung',
  '/participants': 'Manajemen Data Peserta',
  '/cameras': 'Konfigurasi & Manajemen Kamera',
  '/history': 'Riwayat Sesi Asesmen',
  '/benchmark': 'Benchmark & Komparasi Model AI',
  '/reports': 'Dokumentasi & Laporan Resmi',
  '/settings': 'Pengaturan Sistem & Aturan Gerakan',
};

interface TopbarProps {
  onToggleSidebar?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({ onToggleSidebar }) => {
  const location = useLocation();
  const currentTitle = routeNames[location.pathname] || 'SIKAPTA AI';

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: api.getHealth,
    refetchInterval: 15000,
  });

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const isDbConnected = health?.database?.status === 'connected';

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-3 sm:px-6 flex items-center justify-between shadow-xs shrink-0">
      {/* Left: Mobile Menu Toggle & Title */}
      <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="md:hidden p-2 -ml-1 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition shrink-0"
          aria-label="Buka Menu Navigasi"
        >
          <Menu className="w-5 h-5" />
        </button>

        <div className="min-w-0">
          <h1 className="text-base sm:text-lg font-bold text-slate-800 truncate">{currentTitle}</h1>
          <p className="text-xs text-slate-400 truncate hidden sm:block">
            Sistem Inteligensi Kesamaptaan Jasmani Terpadu
          </p>
        </div>
      </div>

      {/* Right: Status Badges & User Meta */}
      <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
        {/* Database Status Indicator */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs border ${
            isDbConnected
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
          title={isDbConnected ? 'PostgreSQL Terhubung' : 'Mode Lokal'}
        >
          <Database className={`w-3.5 h-3.5 ${isDbConnected ? 'text-emerald-600' : 'text-amber-600'}`} />
          <span className="font-medium hidden sm:inline">
            PostgreSQL: {isDbConnected ? 'Terhubung' : 'Lokal'}
          </span>
          <span className="font-medium sm:hidden">{isDbConnected ? 'DB OK' : 'Lokal'}</span>
        </div>

        {/* AI Model Active Badge */}
        <div className="hidden md:flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs bg-slate-100 text-slate-700 border border-slate-200">
          <Cpu className="w-3.5 h-3.5 text-amber-600" />
          <span>
            Model: <b className="uppercase">{settingsData?.default_vision_model || 'MediaPipe'} (CPU)</b>
          </span>
        </div>

        {/* User Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3 pl-2 sm:pl-3 border-l border-slate-200">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-amber-400 flex items-center justify-center font-bold text-xs border border-amber-500/40">
            <User className="w-4 h-4" />
          </div>
          <div className="text-left hidden lg:block">
            <div className="text-xs font-bold text-slate-800 leading-tight">Penguji / Admin</div>
            <div className="text-[10px] text-slate-400">SIKAPTA Examiner</div>
          </div>
        </div>
      </div>
    </header>
  );
};

