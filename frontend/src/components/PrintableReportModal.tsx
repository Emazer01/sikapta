import React from 'react';
import { Printer, FileDown, X, CheckCircle2, ShieldCheck, Award } from 'lucide-react';
import { AssessmentSession } from '../types';
import { api } from '../services/api';

interface PrintableReportModalProps {
  session: AssessmentSession | null;
  isOpen: boolean;
  onClose: () => void;
}

export const PrintableReportModal: React.FC<PrintableReportModalProps> = ({
  session,
  isOpen,
  onClose,
}) => {
  if (!isOpen || !session) return null;

  const handlePrint = () => {
    window.print();
  };

  const part = session.participant;
  const verified = session.verified_reps || 0;
  const rejected = session.rejected_reps || 0;
  const totalDetected = Math.max(session.detected_reps || 0, verified + rejected);
  const accuracy = totalDetected > 0 ? ((verified / totalDetected) * 100).toFixed(1) : '0.0';

  const durationSec = session.duration_seconds || 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durationFormatted = `${durationSec} Detik (${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')})`;

  const genderLabel =
    (session.gender || part?.gender) === 'P'
      ? 'Wanita (Perempuan)'
      : 'Pria (Laki-laki)';

  const formattedDate = session.start_time
    ? new Date(session.start_time).toLocaleString('id-ID', {
        dateStyle: 'long',
        timeStyle: 'medium',
      })
    : new Date().toLocaleString('id-ID');

  let predikat = 'BELUM MEMENUHI STANDAR';
  let predikatColor = 'text-red-700 bg-red-50 border-red-200';
  if (verified >= 35) {
    predikat = 'SANGAT BAIK / MEMENUHI STANDAR TINGGI';
    predikatColor = 'text-emerald-700 bg-emerald-50 border-emerald-200';
  } else if (verified >= 20) {
    predikat = 'BAIK / MEMENUHI STANDAR';
    predikatColor = 'text-emerald-600 bg-emerald-50 border-emerald-200';
  } else if (verified > 0) {
    predikat = 'CUKUP / PERLU PEMBINAAN TEKNIK';
    predikatColor = 'text-amber-700 bg-amber-50 border-amber-200';
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white print:static">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-report-area, #printable-report-area * {
            visibility: visible !important;
          }
          #printable-report-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 15mm !important;
            background: white !important;
            border: none !important;
            box-shadow: none !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden print:max-h-none print:shadow-none print:border-none print:rounded-none">
        {/* Modal Top Control Bar (Hidden when printed) */}
        <div className="no-print bg-slate-900 text-white px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2">
            <Printer className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-slate-100">Pratinjau & Cetak Laporan Resmi SIKAPTA AI</h3>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handlePrint}
              type="button"
              className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-4 py-2 rounded-lg text-xs transition-colors cursor-pointer shadow-md"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Dokumen Sekarang</span>
            </button>
            <a
              href={api.getPdfUrl(session.id)}
              target="_blank"
              rel="noreferrer"
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold px-4 py-2 rounded-lg text-xs transition-colors"
            >
              <FileDown className="w-4 h-4" />
              <span>Unduh File PDF</span>
            </a>
            <button
              onClick={onClose}
              type="button"
              className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area */}
        <div id="printable-report-area" className="p-8 overflow-y-auto font-sans text-slate-900 space-y-6">
          {/* Header Kop Surat Kedinasan */}
          <div className="text-center space-y-1 pb-3">
            <h1 className="text-2xl font-black tracking-wider text-slate-950 uppercase">SIKAPTA AI</h1>
            <p className="text-xs font-semibold text-amber-700 tracking-wide uppercase">
              Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif
            </p>
            <p className="text-[11px] italic text-slate-500 font-serif">
              "Presisi Gerak, Akurasi Penilaian."
            </p>
            <div className="pt-2">
              <div className="border-b-2 border-slate-900 w-full" />
              <div className="border-b border-amber-500 w-full mt-0.5" />
            </div>
          </div>

          {/* Judul Laporan */}
          <div className="text-center space-y-1">
            <h2 className="text-base font-extrabold uppercase tracking-wide text-slate-900">
              BERITA ACARA &amp; LAPORAN RESMI UJI KESAMAPTAAN JASMANI
            </h2>
            <p className="text-xs text-slate-500">
              Kode Sesi: <span className="font-mono font-bold text-slate-800">{session.session_code}</span> | Tanggal: {formattedDate}
            </p>
          </div>

          {/* Tabel Metadata & Identitas Peserta */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-l-4 border-amber-500 pl-2">
              I. IDENTITAS PESERTA &amp; INFORMASI PENGUJIAN
            </h3>
            <table className="w-full text-xs border border-slate-300 border-collapse">
              <tbody>
                <tr className="border-b border-slate-300">
                  <td className="bg-slate-100 font-bold p-2.5 w-1/4 border-r border-slate-300 text-slate-700">Nomor Peserta / NRP</td>
                  <td className="p-2.5 w-1/4 border-r border-slate-300 font-mono font-bold text-slate-900">{part?.participant_number || '-'}</td>
                  <td className="bg-slate-100 font-bold p-2.5 w-1/4 border-r border-slate-300 text-slate-700">Jenis Tes Gerakan</td>
                  <td className="p-2.5 w-1/4 font-extrabold text-slate-900 uppercase">{session.exercise_type}</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Nama Lengkap Pelaku</td>
                  <td className="p-2.5 border-r border-slate-300 font-bold text-slate-900">{part?.full_name || '-'}</td>
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Model AI Vision</td>
                  <td className="p-2.5 text-slate-900 uppercase font-semibold">{session.model_used} (CPU)</td>
                </tr>
                <tr className="border-b border-slate-300">
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Satuan / Instansi</td>
                  <td className="p-2.5 border-r border-slate-300 text-slate-900">{part?.organization || '-'}</td>
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Kategori Gender</td>
                  <td className="p-2.5 text-slate-900 font-semibold">{genderLabel}</td>
                </tr>
                <tr>
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Kategori / Pangkat</td>
                  <td className="p-2.5 border-r border-slate-300 text-slate-900">{part?.category || 'Umum'}</td>
                  <td className="bg-slate-100 font-bold p-2.5 border-r border-slate-300 text-slate-700">Durasi &amp; Toleransi</td>
                  <td className="p-2.5 text-slate-900 font-semibold">{durationFormatted} (±{session.tolerance_deg ?? 5}°)</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Rekapitulasi Hasil Evaluasi */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-l-4 border-amber-500 pl-2">
              II. REKAPITULASI HASIL PENILAIAN KOMPUTER VISION
            </h3>
            <div className="grid grid-cols-4 gap-3 mb-3">
              <div className="border border-slate-300 rounded-lg p-3 text-center bg-slate-50">
                <p className="text-[10px] uppercase font-bold text-slate-500">Total Gerak</p>
                <p className="text-2xl font-black text-slate-900">{totalDetected}</p>
                <p className="text-[9px] text-slate-400">Siklus terdeteksi</p>
              </div>
              <div className="border border-emerald-300 rounded-lg p-3 text-center bg-emerald-50/60">
                <p className="text-[10px] uppercase font-bold text-emerald-800">Repetisi Sah</p>
                <p className="text-2xl font-black text-emerald-600">{verified}</p>
                <p className="text-[9px] text-emerald-700 font-medium">Memenuhi standar</p>
              </div>
              <div className="border border-red-300 rounded-lg p-3 text-center bg-red-50/60">
                <p className="text-[10px] uppercase font-bold text-red-800">Repetisi Ditolak</p>
                <p className="text-2xl font-black text-red-600">{rejected}</p>
                <p className="text-[9px] text-red-700 font-medium">Tidak sempurna</p>
              </div>
              <div className="border border-blue-300 rounded-lg p-3 text-center bg-blue-50/60">
                <p className="text-[10px] uppercase font-bold text-blue-800">Tingkat Akurasi</p>
                <p className="text-2xl font-black text-blue-600">{accuracy}%</p>
                <p className="text-[9px] text-blue-700 font-medium">Kesesuaian form</p>
              </div>
            </div>

            <div className={`p-3 rounded-lg border text-xs font-bold flex items-center justify-between ${predikatColor}`}>
              <div className="flex items-center space-x-2">
                <Award className="w-4 h-4" />
                <span>PREDIKAT KELAYAKAN HASIL UJI:</span>
              </div>
              <span className="uppercase tracking-wide font-extrabold">{predikat}</span>
            </div>
          </div>

          {/* Catatan Penguji */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 border-l-4 border-amber-500 pl-2">
              III. CATATAN PENGUJI / TIM EVALUASI
            </h3>
            <div className="border border-slate-300 rounded-lg p-3 bg-slate-50 text-xs text-slate-800 italic">
              {session.examiner_notes || 'Seluruh repetisi dievaluasi secara otomatis menggunakan standar sudut dan biomekanika tubuh berbasis Computer Vision SIKAPTA AI.'}
            </div>
          </div>

          {/* Rincian Evaluasi Repetisi */}
          {session.rep_events && session.rep_events.length > 0 && (
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2 border-l-4 border-amber-500 pl-2">
                IV. RINCIAN LOG EVALUASI TIAP REPETISI
              </h3>
              <table className="w-full text-xs border border-slate-300 border-collapse">
                <thead className="bg-slate-100 font-bold text-slate-700">
                  <tr className="border-b border-slate-300">
                    <th className="p-2 border-r border-slate-300 w-14 text-center">Rep #</th>
                    <th className="p-2 border-r border-slate-300 w-24 text-center">Status</th>
                    <th className="p-2 border-r border-slate-300 w-36 text-center">Sudut Min / Puncak</th>
                    <th className="p-2 text-left">Keterangan Evaluasi Biomekanika</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {session.rep_events.map((rep) => (
                    <tr key={rep.id || rep.rep_number}>
                      <td className="p-2 border-r border-slate-300 text-center font-bold text-slate-700">#{rep.rep_number}</td>
                      <td className="p-2 border-r border-slate-300 text-center">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          rep.status === 'verified' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {rep.status === 'verified' ? 'SAH' : 'DITOLAK'}
                        </span>
                      </td>
                      <td className="p-2 border-r border-slate-300 text-center font-mono text-slate-700">
                        {rep.min_angle?.toFixed(1)}° / {rep.peak_angle?.toFixed(1)}°
                      </td>
                      <td className="p-2 text-slate-700">
                        {rep.rejection_reason || rep.feedback || 'Memenuhi kriteria siklus fleksi & ekstensi sempurna'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pengesahan Tanda Tangan */}
          <div className="pt-6">
            <div className="text-right text-[11px] text-slate-500 mb-3">
              Ditetapkan di Tempat Pengujian pada: <span className="font-semibold text-slate-700">{formattedDate}</span>
            </div>
            <div className="grid grid-cols-2 gap-8 text-center text-xs">
              <div className="space-y-16">
                <p className="font-semibold text-slate-700">Peserta Uji Yang Bersangkutan,</p>
                <div>
                  <p className="font-bold text-slate-900 uppercase underline">{part?.full_name || '................................................'}</p>
                  <p className="text-[10px] text-slate-500">NRP/NIP: {part?.participant_number || '............................'}</p>
                </div>
              </div>

              <div className="space-y-16">
                <p className="font-semibold text-slate-700">Penguji / Petugas Penilai SIKAPTA AI,</p>
                <div>
                  <p className="font-bold text-slate-900 uppercase underline">TIM PENILAI KESAMAPTAAN</p>
                  <p className="text-[10px] text-slate-500">Petugas Penilai Resmi Terverifikasi</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

