import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  History,
  FileDown,
  Download,
  Search,
  Eye,
  CheckCircle2,
  XCircle,
  Calendar,
  X,
  Filter,
  Printer
} from 'lucide-react';
import { api } from '../../services/api';
import { AssessmentSession } from '../../types';
import { PrintableReportModal } from '../../components/PrintableReportModal';

export const AssessmentHistoryPage: React.FC = () => {
  const [exerciseFilter, setExerciseFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSession, setSelectedSession] = useState<AssessmentSession | null>(null);
  const [printSession, setPrintSession] = useState<AssessmentSession | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['assessmentSessions', exerciseFilter, modelFilter],
    queryFn: () => api.getAssessments({
      exercise_type: exerciseFilter || undefined,
      model_used: modelFilter || undefined,
    }),
  });

  const filteredSessions = sessions.filter((s) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      s.session_code.toLowerCase().includes(term) ||
      (s.participant?.full_name || '').toLowerCase().includes(term) ||
      (s.participant?.participant_number || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Top Filter and Export Bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center space-x-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari kode sesi, nama, atau nomor peserta..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Exercise Filter */}
          <select
            value={exerciseFilter}
            onChange={(e) => setExerciseFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Semua Gerakan</option>
            <option value="pushup">Push-up</option>
            <option value="pullup">Pull-up</option>
            <option value="situp">Sit-up</option>
          </select>

          {/* Model Filter */}
          <select
            value={modelFilter}
            onChange={(e) => setModelFilter(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Semua Model AI</option>
            <option value="mediapipe">MediaPipe Pose</option>
            <option value="yolo">YOLO Pose</option>
          </select>
        </div>

        {/* CSV Export Button */}
        <a
          href={api.getCsvUrl()}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-4 py-2 rounded-lg text-sm shadow-md transition-colors shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Ekspor Data CSV</span>
        </a>
      </div>

      {/* Sessions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Kode Sesi</th>
                <th className="px-5 py-3.5">Peserta</th>
                <th className="px-5 py-3.5">Gerakan</th>
                <th className="px-5 py-3.5">Model AI</th>
                <th className="px-5 py-3.5 text-center">Rep Sah / Total</th>
                <th className="px-5 py-3.5 text-center">Durasi</th>
                <th className="px-5 py-3.5">Waktu Uji</th>
                <th className="px-5 py-3.5 text-right">Laporan & Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Memuat data riwayat sesi...
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Belum ada riwayat pengujian yang sesuai filter.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((session) => (
                  <tr key={session.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900">
                      <div>{session.session_code}</div>
                      <span className={`inline-block mt-0.5 text-[10px] font-bold px-1.5 py-0.2 rounded ${session.source_type === 'video_upload' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'}`}>
                        {session.source_type === 'video_upload' ? 'Upload Video' : 'Kamera Live'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-800">{session.participant?.full_name || '-'}</div>
                      <div className="text-[11px] text-slate-400">
                        {session.participant?.participant_number || ''} ({session.participant?.organization || 'Umum'})
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-800 uppercase">
                        {session.exercise_type}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs uppercase font-medium text-slate-600">{session.model_used}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span className="font-bold text-emerald-600 text-base">{session.verified_reps}</span>
                      <span className="text-slate-400"> / {session.detected_reps}</span>
                    </td>
                    <td className="px-5 py-3.5 text-center text-xs text-slate-600 font-medium">{session.duration_seconds}s</td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">
                      {new Date(session.start_time).toLocaleString('id-ID', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-5 py-3.5 text-right space-x-1.5 whitespace-nowrap">
                      <button
                        onClick={() => setSelectedSession(session)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
                        title="Lihat Evaluasi Repetisi"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Rincian</span>
                      </button>
                      <button
                        onClick={() => {
                          setPrintSession(session);
                          setIsPrintModalOpen(true);
                        }}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-md transition-colors cursor-pointer shadow-xs"
                        title="Cetak Laporan Resmi Langsung"
                      >
                        <Printer className="w-3.5 h-3.5" />
                        <span>Cetak</span>
                      </button>
                      <a
                        href={api.getPdfUrl(session.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-md border border-amber-200 transition-colors"
                        title="Unduh Laporan PDF"
                      >
                        <FileDown className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </a>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Detailed Repetitions Breakdown */}
      {selectedSession && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  Rincian Evaluasi Gerakan: {selectedSession.session_code}
                </h3>
                <p className="text-xs text-slate-500">
                  Peserta: <b>{selectedSession.participant?.full_name}</b> | Gerakan: <b className="uppercase">{selectedSession.exercise_type}</b>
                </p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Video Player if Annotated Video Exists */}
            {selectedSession.annotated_video_path && (
              <div className="bg-slate-950 rounded-xl overflow-hidden aspect-video relative flex items-center justify-center">
                <video
                  controls
                  className="w-full h-full object-contain"
                  src={api.getAnnotatedVideoUrl(selectedSession.id)}
                >
                  Video beranotasi tidak didukung oleh browser Anda.
                </video>
              </div>
            )}

            {/* Repetitions List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {selectedSession.rep_events && selectedSession.rep_events.length > 0 ? (
                selectedSession.rep_events.map((rep) => (
                  <div
                    key={rep.id}
                    className={`p-3.5 rounded-xl border flex items-center justify-between text-xs ${
                      rep.status === 'verified'
                        ? 'bg-emerald-50/60 border-emerald-200 text-emerald-900'
                        : 'bg-red-50/60 border-red-200 text-red-900'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                          rep.status === 'verified' ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                        }`}
                      >
                        #{rep.rep_number}
                      </div>
                      <div>
                        <div className="font-bold flex items-center space-x-1.5">
                          <span>{rep.status === 'verified' ? 'REPETISI SAH' : 'REPETISI DITOLAK'}</span>
                          {rep.rejection_reason && (
                            <span className="text-[11px] font-medium text-red-700">({rep.rejection_reason})</span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-600 mt-0.5">{rep.feedback || '-'}</p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="font-mono text-slate-700 font-semibold">
                        Min: {rep.min_angle?.toFixed(1)}° | Puncak: {rep.peak_angle?.toFixed(1)}°
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-slate-400">
                  Tidak ada data repetisi individual yang tersimpan untuk sesi ini.
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-200">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setPrintSession(selectedSession);
                    setIsPrintModalOpen(true);
                  }}
                  className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs shadow-md transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Laporan</span>
                </button>
                <a
                  href={api.getPdfUrl(selectedSession.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-4 py-2 rounded-lg text-xs shadow-md transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Unduh PDF</span>
                </a>
              </div>
              <button
                onClick={() => setSelectedSession(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Report Modal */}
      <PrintableReportModal
        session={printSession}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
};

