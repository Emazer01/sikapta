import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Settings,
  Cpu,
  Save,
  CheckCircle2,
  Database,
  Sliders,
  Info
} from 'lucide-react';
import { api } from '../../services/api';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const { data: ruleProfiles = [] } = useQuery({
    queryKey: ['ruleProfiles'],
    queryFn: () => api.getRuleProfiles(),
  });

  const [defaultModel, setDefaultModel] = useState('mediapipe');
  const [targetFps, setTargetFps] = useState(30);
  const [savedSuccess, setSavedSuccess] = useState(false);

  useEffect(() => {
    if (settingsData) {
      setDefaultModel(settingsData.default_vision_model || 'mediapipe');
      setTargetFps(settingsData.camera_target_fps || 30);
    }
  }, [settingsData]);

  const updateMutation = useMutation({
    mutationFn: api.updateSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings'] });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    },
    onError: (err: any) => {
      alert(`Gagal menyimpan pengaturan: ${err.message}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      default_vision_model: defaultModel,
      camera_target_fps: Number(targetFps),
    });
  };

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Pengaturan Sistem & Model AI</h2>
          <p className="text-xs text-slate-400">Konfigurasi operasional SIKAPTA AI Core Engine</p>
        </div>

        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-5 py-2 rounded-lg text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          <span>{updateMutation.isPending ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="bg-emerald-50 text-emerald-800 p-3.5 rounded-xl border border-emerald-200 text-xs flex items-center space-x-2 animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Pengaturan sistem SIKAPTA AI berhasil diperbarui!</span>
        </div>
      )}

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Model AI Configuration */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
            <Cpu className="w-4 h-4 text-amber-600" />
            <span>Konfigurasi Inferensi Vision Engine</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Model Estimasi Pose Default
            </label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setDefaultModel('mediapipe')}
                className={`py-2 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  defaultModel === 'mediapipe' ? 'bg-slate-900 text-amber-400 shadow-xs' : 'text-slate-600'
                }`}
              >
                MediaPipe Pose (CPU)
              </button>
              <button
                type="button"
                onClick={() => setDefaultModel('yolo')}
                className={`py-2 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                  defaultModel === 'yolo' ? 'bg-slate-900 text-amber-400 shadow-xs' : 'text-slate-600'
                }`}
              >
                Ultralytics YOLO Pose (CPU)
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5">
              MediaPipe dioptimasi untuk presisi landmark 33 titik. YOLO Pose dioptimasi untuk ketahanan deteksi manusia dari jarak lebih jauh.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Target FPS Pemrosesan Kamera</label>
            <input
              type="number"
              min="10"
              max="60"
              value={targetFps}
              onChange={(e) => setTargetFps(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">Rekomendasi CPU laptop standar: 24 - 30 FPS.</span>
          </div>
        </div>

        {/* Database & Environment Info */}
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
            <Database className="w-4 h-4 text-emerald-600" />
            <span>Status Infrastruktur & Database</span>
          </div>

          <div className="space-y-2 text-xs text-slate-600">
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Database Dialect:</span>
              <b className="uppercase">{settingsData?.database_dialect || 'PostgreSQL'}</b>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Host Database:</span>
              <span className="font-mono">{settingsData?.database_url || 'localhost:5432/sikapta_ai'}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Direktori Model AI:</span>
              <span className="font-mono text-[10px] truncate max-w-xs">{settingsData?.models_directory}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100">
              <span className="text-slate-400">Direktori Ekspor Dokumen:</span>
              <span className="font-mono text-[10px] truncate max-w-xs">{settingsData?.exports_directory}</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-400">Versi Aplikasi:</span>
              <b className="text-slate-900">{settingsData?.version || '1.0.0'}</b>
            </div>
          </div>
        </div>
      </div>

      {/* Movement Rule Profiles Inspection */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm border-b border-slate-100 pb-3">
          <Sliders className="w-4 h-4 text-amber-600" />
          <span>Profil Aturan Validasi Gerakan (Rule Profiles)</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {ruleProfiles.map((rule) => (
            <div key={rule.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-bold text-slate-900 uppercase">{rule.exercise_type}</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                  v{rule.version}
                </span>
              </div>
              <h4 className="font-bold text-slate-800">{rule.name}</h4>
              <p className="text-[11px] text-slate-500">{rule.description}</p>
              <div className="pt-2 border-t border-slate-200 text-[10px] font-mono text-slate-600 space-y-0.5">
                {Object.entries(rule.config_json).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span>{k}:</span>
                    <span className="font-bold">{String(v)}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

