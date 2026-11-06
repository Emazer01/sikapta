import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  X,
  Check,
  ShieldAlert,
  Upload
} from 'lucide-react';
import { api } from '../../services/api';
import { Participant } from '../../types';
import { BulkParticipantModal } from './BulkParticipantModal';

export const ParticipantsPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedGender, setSelectedGender] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingParticipant, setEditingParticipant] = useState<Participant | null>(null);
  const [viewingParticipant, setViewingParticipant] = useState<Participant | null>(null);

  // Form state
  const [formData, setFormData] = useState<Partial<Participant>>({
    participant_number: '',
    full_name: '',
    gender: 'L',
    category: 'Umum',
    organization: '',
    phone: '',
    notes: '',
  });

  const { data: participants = [], isLoading } = useQuery({
    queryKey: ['participants', search, selectedCategory, selectedGender],
    queryFn: () => api.getParticipants({
      search: search || undefined,
      category: selectedCategory || undefined,
      gender: selectedGender || undefined,
    }),
  });

  const createMutation = useMutation({
    mutationFn: api.createParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
      setShowAddModal(false);
      resetForm();
    },
    onError: (err: any) => {
      alert(`Gagal menambah peserta: ${err.message}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Participant> }) =>
      api.updateParticipant(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      setEditingParticipant(null);
      resetForm();
    },
    onError: (err: any) => {
      alert(`Gagal memperbarui peserta: ${err.message}`);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: api.deleteParticipant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
    },
    onError: (err: any) => {
      alert(`Gagal menghapus peserta: ${err.message}`);
    },
  });

  const resetForm = () => {
    setFormData({
      participant_number: '',
      full_name: '',
      gender: 'L',
      category: 'Umum',
      organization: '',
      phone: '',
      notes: '',
    });
  };

  const handleOpenAdd = () => {
    resetForm();
    setShowAddModal(true);
  };

  const handleOpenEdit = (p: Participant) => {
    setEditingParticipant(p);
    setFormData({
      participant_number: p.participant_number,
      full_name: p.full_name,
      gender: p.gender,
      category: p.category,
      organization: p.organization,
      phone: p.phone,
      notes: p.notes,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.participant_number || !formData.full_name) {
      alert('Nomor Peserta dan Nama Lengkap wajib diisi');
      return;
    }

    if (editingParticipant) {
      updateMutation.mutate({ id: editingParticipant.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number, name: string) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data peserta "${name}"?`)) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header and Filter Controls */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-1 items-center space-x-3 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Cari nomor peserta, nama, atau kesatuan..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Semua Kategori</option>
            <option value="Taruna">Taruna</option>
            <option value="Bintara">Bintara</option>
            <option value="Tamtama">Tamtama</option>
            <option value="Umum">Umum</option>
          </select>

          {/* Gender Filter */}
          <select
            value={selectedGender}
            onChange={(e) => setSelectedGender(e.target.value)}
            className="bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
          >
            <option value="">Semua Gender</option>
            <option value="L">Laki-laki (L)</option>
            <option value="P">Perempuan (P)</option>
          </select>
        </div>

        <div className="flex items-center space-x-2.5 shrink-0">
          <button
            onClick={() => setShowBulkModal(true)}
            className="flex items-center space-x-2 bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-4 py-2 rounded-lg text-sm shadow-md transition-colors cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            <span>Tambah Massal (Bulk Insert)</span>
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-4 py-2 rounded-lg text-sm shadow-md transition-colors shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4" />
            <span>Tambah Peserta Baru</span>
          </button>
        </div>
      </div>

      {/* Participants Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-slate-700 text-xs uppercase font-semibold border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">No. Peserta / NIP</th>
                <th className="px-5 py-3.5">Nama Lengkap</th>
                <th className="px-5 py-3.5 text-center">Gender</th>
                <th className="px-5 py-3.5">Kesatuan / Satuan</th>
                <th className="px-5 py-3.5">Kategori</th>
                <th className="px-5 py-3.5">Kontak</th>
                <th className="px-5 py-3.5 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Memuat daftar peserta...
                  </td>
                </tr>
              ) : participants.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    Tidak ada data peserta yang cocok dengan kriteria pencarian.
                  </td>
                </tr>
              ) : (
                participants.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-5 py-3.5 font-bold text-slate-900">{p.participant_number}</td>
                    <td className="px-5 py-3.5 font-semibold text-slate-800">{p.full_name}</td>
                    <td className="px-5 py-3.5 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${
                          p.gender === 'L' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700'
                        }`}
                      >
                        {p.gender === 'L' ? 'L' : 'P'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">{p.organization || '-'}</td>
                    <td className="px-5 py-3.5">
                      <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {p.category}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-500">{p.phone || '-'}</td>
                    <td className="px-5 py-3.5 text-right space-x-2">
                      <button
                        onClick={() => setViewingParticipant(p)}
                        className="text-slate-500 hover:text-slate-800 p-1 cursor-pointer"
                        title="Lihat Detail"
                      >
                        <Eye className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="text-amber-600 hover:text-amber-700 p-1 cursor-pointer"
                        title="Edit Data"
                      >
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(p.id, p.full_name)}
                        className="text-red-500 hover:text-red-700 p-1 cursor-pointer"
                        title="Hapus Data"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Tambah / Edit Peserta */}
      {(showAddModal || editingParticipant) && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-lg font-bold text-slate-900">
                {editingParticipant ? 'Edit Data Peserta' : 'Tambah Peserta Baru'}
              </h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setEditingParticipant(null);
                }}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nomor Peserta / NIP / NRP *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.participant_number || ''}
                    onChange={(e) => setFormData({ ...formData, participant_number: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Contoh: SMP-2026-005"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Kelamin *
                  </label>
                  <select
                    value={formData.gender || 'L'}
                    onChange={(e) => setFormData({ ...formData, gender: e.target.value as 'L' | 'P' })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="L">Laki-laki</option>
                    <option value="P">Perempuan</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Lengkap *
                </label>
                <input
                  type="text"
                  required
                  value={formData.full_name || ''}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Nama lengkap peserta"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kesatuan / Instansi
                  </label>
                  <input
                    type="text"
                    value={formData.organization || ''}
                    onChange={(e) => setFormData({ ...formData, organization: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    placeholder="Contoh: Batalyon 1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kategori Peserta
                  </label>
                  <select
                    value={formData.category || 'Umum'}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="Taruna">Taruna</option>
                    <option value="Bintara">Bintara</option>
                    <option value="Tamtama">Tamtama</option>
                    <option value="Umum">Umum</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nomor Kontak / WhatsApp
                </label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="08xxxxxxxxxx"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan</label>
                <textarea
                  rows={2}
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  placeholder="Catatan kesehatan atau riwayat..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingParticipant(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-semibold transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold rounded-lg text-sm shadow-md transition-colors cursor-pointer disabled:opacity-50"
                >
                  {createMutation.isPending || updateMutation.isPending ? 'Menyimpan...' : 'Simpan Data'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: View Participant Detail */}
      {viewingParticipant && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-4">
              <h3 className="text-lg font-bold text-slate-900">Profil Peserta</h3>
              <button
                onClick={() => setViewingParticipant(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Nomor Peserta:</span>
                <span className="font-bold text-slate-900">{viewingParticipant.participant_number}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Nama Lengkap:</span>
                <span className="font-bold text-slate-800">{viewingParticipant.full_name}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Jenis Kelamin:</span>
                <span className="font-semibold text-slate-700">
                  {viewingParticipant.gender === 'L' ? 'Laki-laki' : 'Perempuan'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Satuan / Instansi:</span>
                <span className="font-semibold text-slate-700">{viewingParticipant.organization || '-'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Kategori:</span>
                <span className="font-semibold text-slate-700">{viewingParticipant.category}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="text-slate-400">Kontak:</span>
                <span className="font-semibold text-slate-700">{viewingParticipant.phone || '-'}</span>
              </div>
              <div className="py-1">
                <span className="text-slate-400 block mb-1">Catatan Tambahan:</span>
                <p className="bg-slate-50 p-2.5 rounded-lg text-xs text-slate-700 border border-slate-200">
                  {viewingParticipant.notes || 'Tidak ada catatan.'}
                </p>
              </div>
            </div>

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setViewingParticipant(null)}
                className="px-4 py-2 bg-slate-900 text-amber-400 font-bold rounded-lg text-xs shadow-md"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Participant Modal */}
      <BulkParticipantModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['participants'] });
          queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        }}
      />
    </div>
  );
};

