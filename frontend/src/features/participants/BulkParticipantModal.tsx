import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  X,
  Upload,
  FileSpreadsheet,
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Download,
  ListPlus,
  ClipboardPaste
} from 'lucide-react';
import { api } from '../../services/api';
import { Participant } from '../../types';

interface BulkParticipantModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface BulkRow {
  participant_number: string;
  full_name: string;
  gender: 'L' | 'P';
  organization: string;
  category: string;
  phone?: string;
}

export const BulkParticipantModal: React.FC<BulkParticipantModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [activeTab, setActiveTab] = useState<'paste' | 'table' | 'file'>('paste');
  const [pasteText, setPasteText] = useState('');
  const [tableRows, setTableRows] = useState<BulkRow[]>([
    { participant_number: '', full_name: '', gender: 'L', organization: '', category: 'Tamtama' },
    { participant_number: '', full_name: '', gender: 'L', organization: '', category: 'Bintara' },
    { participant_number: '', full_name: '', gender: 'L', organization: '', category: 'Perwira' },
  ]);
  const [parsedRows, setParsedRows] = useState<BulkRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (!isOpen) return null;

  const handleFillSample = () => {
    const sample = [
      "NRP-20261101\tLettu Inf Rian Anggoro\tL\tYonif Raider 400\tPerwira",
      "NRP-20261102\tSerka Dewi Lestari\tP\tKorp Wanita TNI\tBintara",
      "NRP-20261103\tKopda Joko Susilo\tL\tBatalyon 1 Infanteri\tTamtama",
      "NRP-20261104\tPraka Dimas Prasetyo\tL\tBatalyon Artileri Medan\tTamtama",
      "NRP-20261105\tSertu Nadia Putri\tP\tPolda Metro Jaya\tBintara"
    ].join('\n');
    setPasteText(sample);
    parsePasteText(sample);
  };

  const parsePasteText = (text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const parsed: BulkRow[] = [];

    for (const line of lines) {
      // Split by tab or comma or semicolon
      let parts: string[] = [];
      if (line.includes('\t')) {
        parts = line.split('\t');
      } else if (line.includes(';')) {
        parts = line.split(';');
      } else if (line.includes(',')) {
        parts = line.split(',');
      } else {
        parts = line.split(/\s{2,}/); // 2 or more spaces
      }

      parts = parts.map((p) => p.trim());
      if (parts.length >= 2) {
        const nrp = parts[0];
        const name = parts[1];
        let gender: 'L' | 'P' = 'L';
        let org = '';
        let category = 'Umum';

        if (parts.length > 2) {
          const g = parts[2].toUpperCase();
          if (g.startsWith('P') || g.startsWith('W') || g.includes('FEMALE')) {
            gender = 'P';
          }
        }
        if (parts.length > 3) org = parts[3];
        if (parts.length > 4) category = parts[4];

        parsed.push({
          participant_number: nrp,
          full_name: name,
          gender,
          organization: org,
          category: category || 'Umum',
        });
      }
    }
    setParsedRows(parsed);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (rawRows.length === 0) {
        alert('File Excel kosong.');
        return;
      }

      let headerRowIndex = 0;
      const colMap = { nrp: 0, name: 1, gender: 2, org: 3, category: 4, phone: 5 };
      const firstRow = rawRows[0].map((cell: any) => String(cell || '').toLowerCase().trim());
      const hasNrpHeader = firstRow.some((c: string) => c.includes('nrp') || c.includes('nomor') || c.includes('nip'));

      if (hasNrpHeader) {
        firstRow.forEach((c: string, idx: number) => {
          if (c.includes('nrp') || c.includes('nip') || c.includes('nomor')) colMap.nrp = idx;
          else if (c.includes('nama') || c.includes('name')) colMap.name = idx;
          else if (c.includes('gender') || c.includes('kelamin') || c === 'jk' || c === 'sex') colMap.gender = idx;
          else if (c.includes('kesatuan') || c.includes('satuan') || c.includes('org') || c.includes('unit')) colMap.org = idx;
          else if (c.includes('kategori') || c.includes('pangkat') || c.includes('grade')) colMap.category = idx;
          else if (c.includes('telp') || c.includes('phone') || c.includes('hp')) colMap.phone = idx;
        });
        headerRowIndex = 1;
      }

      const parsed: BulkRow[] = [];
      const textLines: string[] = [];

      for (let i = headerRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const nrp = row[colMap.nrp] !== undefined ? String(row[colMap.nrp]).trim() : '';
        if (!nrp || nrp.toLowerCase() === 'nrp' || nrp.toLowerCase() === 'nomor') continue;

        const name = row[colMap.name] !== undefined ? String(row[colMap.name]).trim() : '';
        const gRaw = row[colMap.gender] !== undefined ? String(row[colMap.gender]).trim().toUpperCase() : 'L';
        const gender: 'L' | 'P' = gRaw === 'P' || gRaw.startsWith('W') || gRaw.includes('FEMALE') ? 'P' : 'L';
        const org = row[colMap.org] !== undefined ? String(row[colMap.org]).trim() : '-';
        const category = row[colMap.category] !== undefined ? String(row[colMap.category]).trim() : 'Umum';
        const phone = row[colMap.phone] !== undefined ? String(row[colMap.phone]).trim() : undefined;

        parsed.push({
          participant_number: nrp,
          full_name: name || `Peserta ${nrp}`,
          gender,
          organization: org,
          category,
          phone,
        });

        textLines.push(`${nrp}\t${name}\t${gender}\t${org}\t${category}`);
      }

      setParsedRows(parsed);
      setPasteText(textLines.join('\n'));
      setActiveTab('paste');
      setResultMessage({
        type: 'success',
        text: `Berhasil membaca file ${file.name}: ${parsed.length} data peserta siap ditambahkan.`,
      });
    } catch (err: any) {
      alert('Gagal membaca file Excel: ' + err.message);
    }
  };

  const handleDownloadTemplate = () => {
    const data = [
      ['NRP / NIP', 'Nama Lengkap', 'Gender (L/P)', 'Kesatuan', 'Kategori', 'No Telepon'],
      ['NRP-20261101', 'Lettu Inf Rian Anggoro', 'L', 'Yonif Raider 400', 'Perwira', '081234567801'],
      ['NRP-20261102', 'Serka Dewi Lestari', 'P', 'Korp Wanita TNI', 'Bintara', '081234567802'],
      ['NRP-20261103', 'Kopda Joko Susilo', 'L', 'Batalyon 1 Infanteri', 'Tamtama', '081234567803'],
      ['NRP-20261104', 'Praka Dimas Prasetyo', 'L', 'Batalyon Artileri Medan', 'Tamtama', '081234567804'],
      ['NRP-20261105', 'Sertu Nadia Putri', 'P', 'Polda Metro Jaya', 'Bintara', '081234567805'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 18 },
      { wch: 28 },
      { wch: 14 },
      { wch: 24 },
      { wch: 16 },
      { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Peserta');
    XLSX.writeFile(wb, 'template_peserta_sikapta.xlsx');
  };

  const handleAddTableRow = () => {
    setTableRows([
      ...tableRows,
      { participant_number: '', full_name: '', gender: 'L', organization: '', category: 'Tamtama' },
    ]);
  };

  const handleRemoveTableRow = (idx: number) => {
    setTableRows(tableRows.filter((_, i) => i !== idx));
  };

  const handleTableChange = (idx: number, field: keyof BulkRow, val: any) => {
    const next = [...tableRows];
    next[idx] = { ...next[idx], [field]: val };
    setTableRows(next);
  };

  const handleSubmit = async () => {
    let rowsToSubmit: BulkRow[] = [];
    if (activeTab === 'paste') {
      rowsToSubmit = parsedRows.filter((r) => r.participant_number && r.full_name);
    } else if (activeTab === 'table') {
      rowsToSubmit = tableRows.filter((r) => r.participant_number.trim() && r.full_name.trim());
    }

    if (rowsToSubmit.length === 0) {
      alert('Tidak ada baris data peserta yang valid untuk disimpan.');
      return;
    }

    setIsSubmitting(true);
    setResultMessage(null);

    try {
      const res = await api.bulkCreateParticipants(rowsToSubmit);
      setResultMessage({
        type: 'success',
        text: `Sukses mendaftarkan ${res.inserted_count} peserta baru dan memperbarui ${res.updated_count} peserta dari total ${res.total_received} data!`,
      });
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } catch (err: any) {
      setResultMessage({
        type: 'error',
        text: `Gagal memproses bulk insert: ${err.message}`,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalValid =
    activeTab === 'paste'
      ? parsedRows.filter((r) => r.participant_number && r.full_name).length
      : tableRows.filter((r) => r.participant_number.trim() && r.full_name.trim()).length;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-4xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Pendaftaran Peserta Massal (Bulk Insert)</h3>
              <p className="text-xs text-slate-500">
                Impor banyak peserta sekaligus menggunakan salin-tempel spreadsheet atau tabel langsung
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab('paste')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'paste'
                  ? 'bg-slate-900 text-amber-400 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4" />
              <span>Salin-Tempel (Excel / CSV Text)</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'table'
                  ? 'bg-slate-900 text-amber-400 shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListPlus className="w-4 h-4" />
              <span>Tabel Form Dinamis</span>
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex items-center space-x-1.5 text-xs text-slate-700 hover:text-emerald-800 font-semibold px-2.5 py-1.5 rounded-lg border border-emerald-300 bg-emerald-50/70 hover:bg-emerald-100/70 transition-colors cursor-pointer shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span>Unduh Template Excel (.xlsx)</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1.5 text-xs text-slate-700 hover:text-slate-900 font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-amber-600" />
              <span>Unggah File Excel</span>
            </button>
          </div>
        </div>

        {/* Status Message */}
        {resultMessage && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2 ${
              resultMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-300'
                : 'bg-red-50 text-red-800 border border-red-300'
            }`}
          >
            {resultMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{resultMessage.text}</span>
          </div>
        )}

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {activeTab === 'paste' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Tempel data baris langsung dari Excel (Ctrl+V). Kolom: <b>NRP</b>, <b>Nama</b>, <b>Gender (L/P)</b>, <b>Satuan</b>, <b>Kategori</b>.
                </span>
                <button
                  type="button"
                  onClick={handleFillSample}
                  className="text-amber-700 hover:text-amber-800 font-bold underline cursor-pointer"
                >
                  Isi Contoh Format
                </button>
              </div>

              <textarea
                rows={6}
                value={pasteText}
                onChange={(e) => {
                  setPasteText(e.target.value);
                  parsePasteText(e.target.value);
                }}
                placeholder="Contoh:&#10;NRP-20261101&#9;Lettu Inf Rian Anggoro&#9;L&#9;Yonif Raider 400&#9;Perwira&#10;NRP-20261102&#9;Serka Dewi Lestari&#9;P&#9;Korp Wanita TNI&#9;Bintara"
                className="w-full font-mono text-xs p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-emerald-500 focus:outline-none"
              />

              {/* Parsed Preview Table */}
              {parsedRows.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                    <span>Pratinjau Hasil Parsing ({parsedRows.length} Baris Terdeteksi):</span>
                    <span className="text-emerald-600">{totalValid} Siap Disimpan</span>
                  </div>
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                        <tr>
                          <th className="p-2 border-b">#</th>
                          <th className="p-2 border-b">Nomor Peserta / NRP</th>
                          <th className="p-2 border-b">Nama Lengkap</th>
                          <th className="p-2 border-b text-center">Gender</th>
                          <th className="p-2 border-b">Kesatuan / Satuan</th>
                          <th className="p-2 border-b">Kategori</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((r, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                            <td className="p-2 font-mono font-bold text-slate-900">{r.participant_number}</td>
                            <td className="p-2 font-semibold text-slate-800">{r.full_name}</td>
                            <td className="p-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                r.gender === 'P' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {r.gender === 'P' ? 'Wanita (P)' : 'Pria (L)'}
                              </span>
                            </td>
                            <td className="p-2 text-slate-600">{r.organization || '-'}</td>
                            <td className="p-2 text-slate-600">{r.category}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'table' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500">
                  Isi data pada baris tabel di bawah ini secara langsung:
                </span>
                <button
                  type="button"
                  onClick={handleAddTableRow}
                  className="flex items-center space-x-1 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-3 py-1.5 rounded-lg text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah Baris</span>
                </button>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-700 font-bold sticky top-0">
                    <tr>
                      <th className="p-2.5 border-b w-8">#</th>
                      <th className="p-2.5 border-b">No. Peserta / NRP *</th>
                      <th className="p-2.5 border-b">Nama Lengkap *</th>
                      <th className="p-2.5 border-b w-24">Gender</th>
                      <th className="p-2.5 border-b">Satuan / Instansi</th>
                      <th className="p-2.5 border-b w-28">Kategori</th>
                      <th className="p-2.5 border-b w-10 text-center">Hapus</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {tableRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        <td className="p-2 text-slate-400 font-mono">{i + 1}</td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Contoh: NRP-001"
                            value={r.participant_number}
                            onChange={(e) => handleTableChange(i, 'participant_number', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Nama Lengkap"
                            value={r.full_name}
                            onChange={(e) => handleTableChange(i, 'full_name', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={r.gender}
                            onChange={(e) => handleTableChange(i, 'gender', e.target.value as 'L' | 'P')}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="L">Pria (L)</option>
                            <option value="P">Wanita (P)</option>
                          </select>
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            placeholder="Yonif 400"
                            value={r.organization}
                            onChange={(e) => handleTableChange(i, 'organization', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <select
                            value={r.category}
                            onChange={(e) => handleTableChange(i, 'category', e.target.value)}
                            className="w-full bg-white border border-slate-300 rounded px-2 py-1 text-xs focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                          >
                            <option value="Tamtama">Tamtama</option>
                            <option value="Bintara">Bintara</option>
                            <option value="Perwira">Perwira</option>
                            <option value="Taruna">Taruna</option>
                            <option value="Umum">Umum</option>
                          </select>
                        </td>
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveTableRow(i)}
                            className="text-red-400 hover:text-red-600 p-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-slate-200 pt-4 shrink-0">
          <div className="text-xs text-slate-500">
            Total peserta valid siap disimpan:{' '}
            <b className="text-emerald-600 text-sm">{totalValid} Orang</b>
          </div>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isSubmitting || totalValid === 0}
              onClick={handleSubmit}
              className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2 rounded-lg text-xs shadow-md transition-colors cursor-pointer disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : `Simpan ${totalValid} Peserta`}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

