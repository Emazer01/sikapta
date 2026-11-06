import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  FileDown,
  Download,
  Calendar,
  Search,
  CheckCircle2,
  Printer
} from 'lucide-react';
import { api } from '../../services/api';
import { AssessmentSession } from '../../types';
import { PrintableReportModal } from '../../components/PrintableReportModal';

export const ReportsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [printSession, setPrintSession] = useState<AssessmentSession | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ['reportSessions'],
    queryFn: () => api.getAssessments({ status: 'completed' }),
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
      {/* Header bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Laporan Resmi Uji Kesamaptaan Jasmani</h2>
          <p className="text-xs text-slate-400">Penerbitan dokumen hasil penilaian terstandarisasi format PDF dan arsip CSV</p>
        </div>

        <div className="flex items-center space-x-3 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari peserta / kode..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <a
            href={api.getCsvUrl()}
            className="flex items-center space-x-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold px-4 py-2 rounded-lg text-sm border border-slate-300 transition-colors shrink-0"
          >
            <Download className="w-4 h-4" />
            <span>Unduh CSV</span>
          </a>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredSessions.map((session) => (
          <div key={session.id} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
            <div className="p-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="font-bold text-slate-900 text-sm">{session.session_code}</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                  {session.exercise_type}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-slate-600">
                <div>
                  <span className="text-slate-400 font-medium">Peserta:</span>{' '}
                  <b className="text-slate-800">{session.participant?.full_name || '-'}</b>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Nomor:</span>{' '}
                  <b>{session.participant?.participant_number || '-'}</b>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Tanggal Uji:</span>{' '}
                  <span>{new Date(session.start_time).toLocaleDateString('id-ID')}</span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium">Hasil Gerakan:</span>{' '}
                  <b className="text-emerald-600">{session.verified_reps} Sah</b> / <span>{session.detected_reps} Total</span>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Model: {session.model_used.toUpperCase()}</span>
              <div className="flex items-center space-x-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setPrintSession(session);
                    setIsPrintModalOpen(true);
                  }}
                  className="flex items-center space-x-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-2.5 py-1.5 rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
                  title="Cetak Laporan Resmi Langsung"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Cetak</span>
                </button>
                <a
                  href={api.getPdfUrl(session.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-2.5 py-1.5 rounded-lg text-xs shadow-xs transition-colors"
                  title="Unduh Berkas PDF"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>PDF</span>
                </a>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Printable Report Modal */}
      <PrintableReportModal
        session={printSession}
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
      />
    </div>
  );
};

