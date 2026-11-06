import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cpu,
  Play,
  CheckCircle2,
  AlertTriangle,
  Zap,
  BarChart2,
  Clock,
  Layers
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend
} from 'recharts';
import { api } from '../../services/api';

export const BenchmarkPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [isRunning, setIsRunning] = useState(false);
  const [benchmarkResult, setBenchmarkResult] = useState<any>(null);

  const { data: history = [], isLoading } = useQuery({
    queryKey: ['benchmarkHistory'],
    queryFn: api.getBenchmarkHistory,
  });

  const runMutation = useMutation({
    mutationFn: api.runBenchmark,
    onSuccess: (data) => {
      setBenchmarkResult(data);
      queryClient.invalidateQueries({ queryKey: ['benchmarkHistory'] });
      setIsRunning(false);
    },
    onError: (err: any) => {
      alert(`Gagal menjalankan benchmark: ${err.message}`);
      setIsRunning(false);
    },
  });

  const handleRunBenchmark = () => {
    setIsRunning(true);
    setBenchmarkResult(null);
    runMutation.mutate(undefined);
  };

  // Group latest comparison data if available
  const mpData = benchmarkResult?.models?.mediapipe;
  const yoloData = benchmarkResult?.models?.yolo;

  const comparisonChartData = mpData && yoloData ? [
    { metric: 'FPS (Lebih Tinggi Lebih Baik)', MediaPipe: mpData.avg_fps, YOLO: yoloData.avg_fps },
    { metric: 'Latensi Rata-rata ms (Lebih Rendah Lebih Baik)', MediaPipe: mpData.avg_latency_ms, YOLO: yoloData.avg_latency_ms },
    { metric: 'Latensi p95 ms', MediaPipe: mpData.p95_latency_ms, YOLO: yoloData.p95_latency_ms },
  ] : [];

  return (
    <div className="space-y-6">
      {/* Benchmark Banner & Trigger */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 rounded-xl p-6 text-white shadow-md border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2 text-amber-400 text-xs font-semibold uppercase tracking-wider mb-1">
            <Cpu className="w-4 h-4" />
            <span>Benchmark Evaluasi Model AI (CPU Mode)</span>
          </div>
          <h2 className="text-2xl font-black text-white">Komparasi MediaPipe vs Ultralytics YOLO Pose</h2>
          <p className="text-slate-300 text-sm mt-1 max-w-2xl">
            Pengujian empiris sequential pada sekuens video gerakan yang sama untuk mengukur FPS, latensi p50/p95, akurasi repetisi, presisi, dan recall pada perangkat CPU tanpa GPU diskrit.
          </p>
        </div>
        <button
          onClick={handleRunBenchmark}
          disabled={isRunning}
          className="flex items-center space-x-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold px-6 py-3 rounded-lg shadow-md transition-all shrink-0 cursor-pointer disabled:opacity-50"
        >
          <Play className={`w-4 h-4 fill-current ${isRunning ? 'animate-spin' : ''}`} />
          <span>{isRunning ? 'Menjalankan Inferensi...' : 'Jalankan Benchmark Sekarang'}</span>
        </button>
      </div>

      {/* Live Benchmark Result Pane */}
      {benchmarkResult && mpData && yoloData && (
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-xs space-y-6 animate-in fade-in duration-300">
          <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Hasil Komparasi Benchmark Terkini</h3>
              <p className="text-xs text-slate-400">
                File Uji: <b>{benchmarkResult.test_video}</b> | Waktu: {new Date(benchmarkResult.timestamp).toLocaleString('id-ID')}
              </p>
            </div>
            <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-full border border-emerald-200">
              Pengujian Selesai
            </span>
          </div>

          {/* Metric Comparison Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* MediaPipe Card */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-blue-600" />
                  <span>MediaPipe Pose Landmarker</span>
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-blue-100 text-blue-800">CPU</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Kecepatan</span>
                  <span className="text-xl font-black text-slate-900">{mpData.avg_fps}</span>
                  <span className="text-[10px] text-slate-400 block">FPS</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Latensi Rata-rata</span>
                  <span className="text-xl font-black text-slate-900">{mpData.avg_latency_ms}</span>
                  <span className="text-[10px] text-slate-400 block">ms</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Latensi p95</span>
                  <span className="text-xl font-black text-slate-900">{mpData.p95_latency_ms}</span>
                  <span className="text-[10px] text-slate-400 block">ms</span>
                </div>
              </div>
              <div className="text-xs space-y-1 text-slate-600 pt-2 border-t border-slate-200">
                <div className="flex justify-between">
                  <span>Akurasi Repetisi (Sah / Ground Truth):</span>
                  <b>{mpData.verified_reps} / {mpData.ground_truth_reps}</b>
                </div>
                <div className="flex justify-between">
                  <span>F1-Score / Presisi / Recall:</span>
                  <b>{mpData.f1_score} / {mpData.precision} / {mpData.recall}</b>
                </div>
                <div className="flex justify-between">
                  <span>Frame Tanpa Pose Valid:</span>
                  <b>{mpData.invalid_pose_frames} frame</b>
                </div>
              </div>
            </div>

            {/* YOLO Pose Card */}
            <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-amber-600" />
                  <span>Ultralytics YOLO Pose</span>
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-sm bg-amber-100 text-amber-800">CPU</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center pt-2">
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Kecepatan</span>
                  <span className="text-xl font-black text-slate-900">{yoloData.avg_fps}</span>
                  <span className="text-[10px] text-slate-400 block">FPS</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Latensi Rata-rata</span>
                  <span className="text-xl font-black text-slate-900">{yoloData.avg_latency_ms}</span>
                  <span className="text-[10px] text-slate-400 block">ms</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Latensi p95</span>
                  <span className="text-xl font-black text-slate-900">{yoloData.p95_latency_ms}</span>
                  <span className="text-[10px] text-slate-400 block">ms</span>
                </div>
              </div>
              <div className="text-xs space-y-1 text-slate-600 pt-2 border-t border-slate-200">
                <div className="flex justify-between">
                  <span>Akurasi Repetisi (Sah / Ground Truth):</span>
                  <b>{yoloData.verified_reps} / {yoloData.ground_truth_reps}</b>
                </div>
                <div className="flex justify-between">
                  <span>F1-Score / Presisi / Recall:</span>
                  <b>{yoloData.f1_score} / {yoloData.precision} / {yoloData.recall}</b>
                </div>
                <div className="flex justify-between">
                  <span>Frame Tanpa Pose Valid:</span>
                  <b>{yoloData.invalid_pose_frames} frame</b>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Historical Benchmark Runs Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h3 className="text-base font-bold text-slate-800">Catatan Riwayat Benchmark Model</h3>
          <p className="text-xs text-slate-400">Hasil pengujian performa yang tersimpan di database PostgreSQL</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Tanggal Uji</th>
                <th className="px-5 py-3.5">Nama Model</th>
                <th className="px-5 py-3.5 text-center">Rata-rata FPS</th>
                <th className="px-5 py-3.5 text-center">Latensi Rata-rata</th>
                <th className="px-5 py-3.5 text-center">Latensi p95</th>
                <th className="px-5 py-3.5 text-center">F1 Score</th>
                <th className="px-5 py-3.5 text-center">Rep Sah</th>
                <th className="px-5 py-3.5 text-center">Frame Invalid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Memuat riwayat benchmark...
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                    Belum ada rekaman benchmark. Klik "Jalankan Benchmark Sekarang" untuk memulai pengujian empiris.
                  </td>
                </tr>
              ) : (
                history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3 text-xs text-slate-600">
                      {new Date(item.test_date).toLocaleString('id-ID')}
                    </td>
                    <td className="px-5 py-3 font-bold uppercase text-slate-800">{item.model_name}</td>
                    <td className="px-5 py-3 text-center font-semibold text-slate-900">{item.avg_fps}</td>
                    <td className="px-5 py-3 text-center text-slate-700">{item.avg_latency_ms} ms</td>
                    <td className="px-5 py-3 text-center text-slate-700">{item.p95_latency_ms} ms</td>
                    <td className="px-5 py-3 text-center font-bold text-emerald-600">{item.f1_score}</td>
                    <td className="px-5 py-3 text-center font-medium text-slate-800">{item.verified_reps}</td>
                    <td className="px-5 py-3 text-center text-slate-500">{item.invalid_pose_frames}</td>
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

