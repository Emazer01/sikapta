import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Video,
  Plus,
  RefreshCw,
  Trash2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  X,
  Play
} from 'lucide-react';
import { api } from '../../services/api';
import { Camera } from '../../types';

export const CamerasPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  // Form State
  const [cameraType, setCameraType] = useState<'webcam' | 'rtsp'>('webcam');
  const [name, setName] = useState('');
  const [deviceIndex, setDeviceIndex] = useState(0);
  const [rtspUrl, setRtspUrl] = useState('');
  const [rtspUsername, setRtspUsername] = useState('');
  const [rtspPassword, setRtspPassword] = useState('');
  const [resolutionW, setResolutionW] = useState(640);
  const [resolutionH, setResolutionH] = useState(480);
  const [targetFps, setTargetFps] = useState(30);

  const { data: cameras = [], isLoading } = useQuery({
    queryKey: ['cameras'],
    queryFn: api.getCameras,
  });

  const createMutation = useMutation({
    mutationFn: api.createCamera,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
      setShowAddModal(false);
      resetForm();
    },
    onError: (err: any) => {
      alert(`Gagal menambahkan kamera: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteCamera,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cameras'] });
    },
    onError: (err: any) => {
      alert(`Gagal menghapus kamera: ${err.message}`);
    },
  });

  const resetForm = () => {
    setName('');
    setCameraType('webcam');
    setDeviceIndex(0);
    setRtspUrl('');
    setRtspUsername('');
    setRtspPassword('');
    setTestResult(null);
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await api.testCameraConnection({
        camera_type: cameraType,
        device_index: Number(deviceIndex),
        rtsp_url: rtspUrl,
      });
      setTestResult(res);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name) {
      alert('Nama kamera wajib diisi');
      return;
    }
    createMutation.mutate({
      name,
      camera_type: cameraType,
      device_index: cameraType === 'webcam' ? Number(deviceIndex) : undefined,
      rtsp_url: cameraType === 'rtsp' ? rtspUrl : undefined,
      rtsp_username: cameraType === 'rtsp' ? rtspUsername : undefined,
      rtsp_password: cameraType === 'rtsp' ? rtspPassword : undefined,
      resolution_w: resolutionW,
      resolution_h: resolutionH,
      target_fps: targetFps,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800">Manajemen Perangkat Kamera</h2>
          <p className="text-xs text-slate-400">Konfigurasi input USB Webcam dan IP Camera via protokol RTSP</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowAddModal(true);
          }}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-4 py-2 rounded-lg text-sm shadow-md transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Tambah Konfigurasi Kamera</span>
        </button>
      </div>

      {/* Camera Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cameras.map((cam) => (
          <div key={cam.id} className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col justify-between">
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                    {cam.camera_type === 'webcam' ? 'USB Webcam' : 'IP Camera RTSP'}
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-2">{cam.name}</h3>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      cam.status === 'online' ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-500 capitalize">{cam.status}</span>
                </div>
              </div>

              <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                {cam.camera_type === 'webcam' ? (
                  <div>
                    <span className="text-slate-400 font-medium">Device Index:</span> <b>{cam.device_index}</b>
                  </div>
                ) : (
                  <div>
                    <span className="text-slate-400 font-medium">RTSP URL:</span> <b className="font-mono text-[11px] truncate block">{cam.rtsp_url}</b>
                  </div>
                )}
                <div>
                  <span className="text-slate-400 font-medium">Resolusi & FPS:</span> <b>{cam.resolution_w}x{cam.resolution_h} @ {cam.target_fps} FPS</b>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-400">ID: #{cam.id}</span>
              <button
                onClick={() => {
                  if (confirm(`Hapus konfigurasi kamera "${cam.name}"?`)) {
                    deleteMutation.mutate(cam.id);
                  }
                }}
                className="text-red-500 hover:text-red-700 font-semibold flex items-center space-x-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal: Tambah Kamera */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Tambah Konfigurasi Kamera</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Kamera *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Kamera Samping Kiri / Webcam 0"
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Tipe Koneksi Kamera</label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-lg">
                  <button
                    type="button"
                    onClick={() => setCameraType('webcam')}
                    className={`py-2 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      cameraType === 'webcam' ? 'bg-slate-900 text-amber-400 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    USB Webcam / Built-in
                  </button>
                  <button
                    type="button"
                    onClick={() => setCameraType('rtsp')}
                    className={`py-2 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                      cameraType === 'rtsp' ? 'bg-slate-900 text-amber-400 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    IP Camera (RTSP)
                  </button>
                </div>
              </div>

              {cameraType === 'webcam' ? (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Device Index (0, 1, 2...)</label>
                  <input
                    type="number"
                    min="0"
                    max="10"
                    value={deviceIndex}
                    onChange={(e) => setDeviceIndex(Number(e.target.value))}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Default 0 biasanya merupakan webcam bawaan laptop/PC.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">URL RTSP Stream *</label>
                    <input
                      type="text"
                      required
                      value={rtspUrl}
                      onChange={(e) => setRtspUrl(e.target.value)}
                      placeholder="rtsp://192.168.1.100:554/stream1"
                      className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Username RTSP</label>
                      <input
                        type="text"
                        value={rtspUsername}
                        onChange={(e) => setRtspUsername(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Password RTSP (Tersamar)</label>
                      <input
                        type="password"
                        value={rtspPassword}
                        onChange={(e) => setRtspPassword(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Uji Koneksi Button & Live Response */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700">Verifikasi Sinyal Kamera:</span>
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting}
                    className="flex items-center space-x-1.5 px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-md shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isTesting ? 'animate-spin' : ''}`} />
                    <span>{isTesting ? 'Menguji...' : 'Uji Koneksi'}</span>
                  </button>
                </div>
                {testResult && (
                  <div
                    className={`text-xs p-2.5 rounded-lg flex items-center space-x-2 ${
                      testResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
                    }`}
                  >
                    {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-red-600" />}
                    <span>{testResult.message}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-lg text-sm shadow-md cursor-pointer disabled:opacity-50"
                >
                  {createMutation.isPending ? 'Menyimpan...' : 'Simpan Kamera'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

