import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  Activity,
  CheckCircle2,
  XCircle,
  Video,
  Play,
  ArrowRight,
  ShieldCheck,
  TrendingUp
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Legend
} from 'recharts';
import { api } from '../../services/api';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading, error } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: api.getDashboardStats,
    refetchInterval: 5000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="bg-red-50 text-red-700 p-4 rounded-lg border border-red-200">
        Gagal memuat data statistik dashboard: {(error as Error)?.message || 'Terjadi kesalahan'}
      </div>
    );
  }

  const exerciseChartData = [
    { name: 'Push-up', count: stats.exercise_distribution['pushup'] || 0, fill: '#0F172A' },
    { name: 'Pull-up', count: stats.exercise_distribution['pullup'] || 0, fill: '#D97706' },
    { name: 'Sit-up', count: stats.exercise_distribution['situp'] || 0, fill: '#10B981' },
  ];

  return (
    <div className="space-y-6">
      {/* Institutional Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>Sistem Inteligensi Kesamaptaan Jasmani Terpadu</span>
          </div>
          <h2 className="text-2xl font-black text-white">SIKAPTA AI Monitoring Hub</h2>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Platform Computer Vision dan Pose Estimation real-time untuk akurasi penilaian uji kesamaptaan fisik berbasis AI.
          </p>
        </div>
        <button
          onClick={() => navigate('/assessment')}
          className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-5 py-2.5 rounded-lg shadow-md transition-all shrink-0 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Mulai Uji Langsung</span>
        </button>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Total Peserta */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Peserta Terdaftar</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.total_participants}</h3>
            <span className="text-[11px] text-slate-400">Personel aktif</span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Card 2: Sesi Aktif */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Sesi Berjalan / Aktif</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.active_sessions_count}</h3>
            <span className="text-[11px] text-emerald-600 font-medium">Monitoring real-time</span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Activity className="w-6 h-6" />
          </div>
        </div>

        {/* Card 3: Repetisi Sah */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Repetisi Terverifikasi (Sah)</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{stats.total_reps_verified}</h3>
            <span className="text-[11px] text-slate-400">Memenuhi standar FSM</span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Card 4: Total Sesi Selesai */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Total Sesi Pengujian</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.total_sessions}</h3>
            <span className="text-[11px] text-slate-400">Tersimpan di DB</span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <TrendingUp className="w-6 h-6" />
          </div>
        </div>

        {/* Card 5: Kamera */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-slate-400">Kamera Online</p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">{stats.online_cameras_count} / {stats.total_cameras_count}</h3>
            <span className="text-[11px] text-slate-400">Webcam / RTSP</span>
          </div>
          <div className="w-12 h-12 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
            <Video className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trend Repetisi Harian (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-800">Tren Repetisi Uji (7 Hari Terakhir)</h3>
              <p className="text-xs text-slate-400">Perbandingan repetisi terverifikasi (sah) dan repetisi ditolak</p>
            </div>
            <div className="flex items-center space-x-3 text-xs">
              <span className="flex items-center text-emerald-600 font-medium">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 mr-1" /> Sah
              </span>
              <span className="flex items-center text-red-500 font-medium">
                <span className="w-3 h-3 rounded-xs bg-red-400 mr-1" /> Ditolak
              </span>
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.rep_trend_daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="verifiedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10B981" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#10B981" stopOpacity={0.0} />
                  </linearGradient>
                  <linearGradient id="rejectedGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Area type="monotone" dataKey="verified" name="Sah" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#verifiedGrad)" />
                <Area type="monotone" dataKey="rejected" name="Ditolak" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#rejectedGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Distribusi Jenis Tes (1 col) */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs">
          <h3 className="text-base font-bold text-slate-800">Distribusi Gerakan Tes</h3>
          <p className="text-xs text-slate-400 mb-4">Total pelaksanaan menurut jenis gerakan</p>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={exerciseChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                <Tooltip />
                <Bar dataKey="count" name="Jumlah Sesi" fill="#0F172A" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Recent Sessions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Sesi Pengujian Terbaru</h3>
            <p className="text-xs text-slate-400">Hasil verifikasi gerakan terkini yang dicatat sistem</p>
          </div>
          <button
            onClick={() => navigate('/history')}
            className="text-xs font-semibold text-slate-700 hover:text-amber-600 flex items-center space-x-1 cursor-pointer"
          >
            <span>Lihat Semua Riwayat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3">Kode Sesi</th>
                <th className="px-5 py-3">Peserta</th>
                <th className="px-5 py-3">Gerakan</th>
                <th className="px-5 py-3">Model AI</th>
                <th className="px-5 py-3 text-center">Rep Sah / Total</th>
                <th className="px-5 py-3 text-center">Durasi</th>
                <th className="px-5 py-3 text-center">Status</th>
                <th className="px-5 py-3 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {stats.recent_sessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Belum ada sesi pengujian yang tercatat. Silakan mulai sesi pertama Anda.
                  </td>
                </tr>
              ) : (
                stats.recent_sessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-medium text-slate-900">{session.session_code}</td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{session.participant?.full_name || '-'}</div>
                      <div className="text-[11px] text-slate-400">{session.participant?.participant_number || ''}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 uppercase">
                        {session.exercise_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600 uppercase font-medium">{session.model_used}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="font-bold text-emerald-600">{session.verified_reps}</span>
                      <span className="text-slate-400"> / {session.detected_reps}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs text-slate-600">{session.duration_seconds}s</td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                          session.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : session.status === 'in_progress'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200 animate-pulse'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {session.status === 'completed' ? 'Selesai' : session.status === 'in_progress' ? 'Berjalan' : 'Jeda'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        onClick={() => navigate(`/history?search=${session.session_code}`)}
                        className="text-xs text-amber-600 hover:text-amber-700 font-semibold cursor-pointer"
                      >
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

