import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Cpu,
  Save,
  CheckCircle2,
  Database,
  Sliders,
  Users,
  UserPlus,
  Edit3,
  Trash2,
  Shield,
  X,
} from 'lucide-react';
import { api } from '../../services/api';
import { UserAccount, UserRole } from '../../types';
import { ROLE_METADATA, useAuth } from '../../contexts/AuthContext';

export const SettingsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();

  const { data: settingsData } = useQuery({
    queryKey: ['settings'],
    queryFn: api.getSettings,
  });

  const { data: ruleProfiles = [] } = useQuery({
    queryKey: ['ruleProfiles'],
    queryFn: () => api.getRuleProfiles(),
  });

  const { data: usersList = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['users'],
    queryFn: api.getUsers,
    enabled: currentUser?.role === 'admin',
  });

  const [defaultModel, setDefaultModel] = useState('mediapipe');
  const [targetFps, setTargetFps] = useState(30);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // User Modal State
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [formUsername, setFormUsername] = useState('');
  const [formFullName, setFormFullName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('examiner');
  const [formPassword, setFormPassword] = useState('');
  const [formIsActive, setFormIsActive] = useState(true);
  const [userFormError, setUserFormError] = useState<string | null>(null);

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

  const createUserMutation = useMutation({
    mutationFn: api.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsUserModalOpen(false);
    },
    onError: (err: any) => {
      setUserFormError(err.message || 'Gagal membuat akun pengguna');
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => api.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setIsUserModalOpen(false);
    },
    onError: (err: any) => {
      setUserFormError(err.message || 'Gagal memperbarui akun pengguna');
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: api.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: any) => {
      alert(`Gagal menghapus akun: ${err.message}`);
    },
  });

  const handleSave = () => {
    updateMutation.mutate({
      default_vision_model: defaultModel,
      camera_target_fps: Number(targetFps),
    });
  };

  const openCreateUserModal = () => {
    setEditingUser(null);
    setFormUsername('');
    setFormFullName('');
    setFormEmail('');
    setFormRole('examiner');
    setFormPassword('');
    setFormIsActive(true);
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (target: UserAccount) => {
    setEditingUser(target);
    setFormUsername(target.username);
    setFormFullName(target.full_name);
    setFormEmail(target.email);
    setFormRole(target.role);
    setFormPassword('');
    setFormIsActive(target.is_active);
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const handleUserFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError(null);

    if (editingUser) {
      updateUserMutation.mutate({
        id: editingUser.id,
        data: {
          full_name: formFullName.trim(),
          email: formEmail.trim(),
          role: formRole,
          is_active: formIsActive,
          ...(formPassword.trim() ? { password: formPassword.trim() } : {}),
        },
      });
    } else {
      if (!formUsername.trim() || !formFullName.trim() || !formEmail.trim() || !formPassword.trim()) {
        setUserFormError('Seluruh kolom wajib diisi untuk membuat akun baru.');
        return;
      }
      createUserMutation.mutate({
        username: formUsername.trim(),
        full_name: formFullName.trim(),
        email: formEmail.trim(),
        role: formRole,
        password: formPassword.trim(),
        is_active: formIsActive,
      });
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Header */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800">
            Pengaturan Sistem, Hak Akses & Model AI
          </h2>
          <p className="text-xs text-slate-400">
            Konfigurasi operasional SIKAPTA AI Core Engine, Manajemen Akun RBAC, dan Profil Aturan
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={updateMutation.isPending}
          className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-5 py-2.5 rounded-lg text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50"
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

      {/* User & Role Management Section (Admin Only) */}
      {currentUser?.role === 'admin' && (
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-100 pb-3.5">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Manajemen Akun & Hak Akses Pengguna (PostgreSQL)
                </h3>
                <p className="text-[11px] text-slate-400">
                  Kelola akun personel berdasarkan 5 peran otorisasi: Administrator, Penguji, Operator, Pengelola Kegiatan, dan Pelatih/Pimpinan
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={openCreateUserModal}
              className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs shadow-xs transition cursor-pointer shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              <span>Tambah Akun Baru</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-slate-700 text-[11px] uppercase font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-3.5">Nama Lengkap</th>
                  <th className="py-3 px-3.5">Username & Email</th>
                  <th className="py-3 px-3.5">Peran / Kewenangan</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5">Login Terakhir</th>
                  <th className="py-3 px-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {isLoadingUsers ? (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-400">
                      Memuat daftar akun pengguna...
                    </td>
                  </tr>
                ) : (
                  usersList.map((u) => {
                    const rMeta = ROLE_METADATA[u.role];
                    return (
                      <tr key={u.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-3.5 font-bold text-slate-800">{u.full_name}</td>
                        <td className="py-3 px-3.5">
                          <div className="font-mono font-semibold text-slate-700">{u.username}</div>
                          <div className="text-[11px] text-slate-400">{u.email}</div>
                        </td>
                        <td className="py-3 px-3.5 max-w-xs">
                          <span
                            className={`inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                              rMeta?.lightBadgeClass || 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            <Shield className="w-3 h-3 mr-1" />
                            <span>{rMeta?.label || u.role_label || u.role}</span>
                          </span>
                          <p className="text-[10px] text-slate-400 mt-1 line-clamp-1">
                            {rMeta?.description || u.role_description}
                          </p>
                        </td>
                        <td className="py-3 px-3.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              u.is_active
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-red-50 text-red-700 border border-red-200'
                            }`}
                          >
                            {u.is_active ? 'Aktif' : 'Nonaktif'}
                          </span>
                        </td>
                        <td className="py-3 px-3.5 text-[11px] text-slate-400">
                          {u.last_login
                            ? new Date(u.last_login).toLocaleString('id-ID')
                            : 'Belum pernah'}
                        </td>
                        <td className="py-3 px-3.5 text-right space-x-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => openEditUserModal(u)}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-amber-600 hover:bg-amber-50 border border-slate-200 transition cursor-pointer"
                            title="Ubah Akun / Hak Akses"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {u.id !== currentUser?.id && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Apakah Anda yakin ingin menghapus akun '${u.username}' (${u.full_name})?`
                                  )
                                ) {
                                  deleteUserMutation.mutate(u.id);
                                }
                              }}
                              className="p-1.5 rounded-lg text-slate-600 hover:text-red-600 hover:bg-red-50 border border-slate-200 transition cursor-pointer"
                              title="Hapus Akun"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
            <label
              htmlFor="target-fps"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Target FPS Pemrosesan Kamera
            </label>
            <input
              id="target-fps"
              name="target_fps"
              type="number"
              min="10"
              max="60"
              value={targetFps}
              onChange={(e) => setTargetFps(Number(e.target.value))}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Rekomendasi CPU laptop standar: 24 - 30 FPS.
            </span>
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

      {/* Modal Tambah / Edit Akun Pengguna */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">
                  {editingUser ? `Edit Akun: ${editingUser.username}` : 'Tambah Akun Pengguna Baru'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
                aria-label="Tutup modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form method="post" onSubmit={handleUserFormSubmit} className="p-5 space-y-4">
              {userFormError && (
                <div
                  role="alert"
                  className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium"
                >
                  {userFormError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="modal-username" className="block text-xs font-semibold text-slate-700 mb-1">
                    Username *
                  </label>
                  <input
                    id="modal-username"
                    name="username"
                    type="text"
                    disabled={!!editingUser}
                    autoComplete="off"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label htmlFor="modal-email" className="block text-xs font-semibold text-slate-700 mb-1">
                    Email *
                  </label>
                  <input
                    id="modal-email"
                    name="email"
                    type="email"
                    autoComplete="off"
                    required
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="modal-fullname" className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap & Pangkat *
                </label>
                <input
                  id="modal-fullname"
                  name="full_name"
                  type="text"
                  autoComplete="off"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50"
                />
              </div>

              <div>
                <label htmlFor="modal-role" className="block text-xs font-semibold text-slate-700 mb-1">
                  Peran / Hak Akses (Role) *
                </label>
                <select
                  id="modal-role"
                  name="role"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50 font-medium"
                >
                  {(Object.keys(ROLE_METADATA) as UserRole[]).map((rKey) => (
                    <option key={rKey} value={rKey}>
                      {ROLE_METADATA[rKey].label} ({rKey})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  {ROLE_METADATA[formRole]?.description}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                <div>
                  <label htmlFor="modal-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingUser ? 'Kata Sandi Baru (Kosongkan jika tetap)' : 'Kata Sandi *'}
                  </label>
                  <input
                    id="modal-password"
                    name="password"
                    type="password"
                    autoComplete="new-password"
                    required={!editingUser}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder={editingUser ? '••••••••' : 'Minimal 6 karakter'}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-slate-50"
                  />
                </div>

                <div className="pt-4">
                  <label className="inline-flex items-center space-x-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formIsActive}
                      onChange={(e) => setFormIsActive(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span className="text-xs font-semibold text-slate-700">Akun Aktif (Dapat Login)</span>
                  </label>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-300 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createUserMutation.isPending || updateUserMutation.isPending}
                  className="px-5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-amber-400 text-xs font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {editingUser ? 'Simpan Perubahan' : 'Buat Akun'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
