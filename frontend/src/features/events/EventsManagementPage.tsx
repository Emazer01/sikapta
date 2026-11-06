import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Plus,
  Users,
  Layers,
  Activity,
  Award,
  UploadCloud,
  FileSpreadsheet,
  Download,
  FileUp,
  Printer,
  ChevronRight,
  ArrowLeft,
  Search,
  CheckCircle2,
  Trash2,
  Edit3,
  Timer,
  Navigation,
  FileText,
  AlertCircle,
  Video,
  Play,
  Pause,
  Square,
  Minus,
  Save,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../services/api';
import {
  SamaptaEvent,
  EventParticipant,
  BulkEventParticipantItem,
  EventRecapResponse,
  ParticipantRecapItem,
  Camera,
  WaveRunLiveState,
  WaveRunnerLiveItem
} from '../../types';

export const EventsManagementPage: React.FC = () => {
  const navigate = useNavigate();

  // State
  const [events, setEvents] = useState<SamaptaEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<SamaptaEvent | null>(null);
  const [participants, setParticipants] = useState<EventParticipant[]>([]);
  const [selectedWave, setSelectedWave] = useState<number | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [recapData, setRecapData] = useState<EventRecapResponse | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showWaveModal, setShowWaveModal] = useState(false);
  const [showRunScoreModal, setShowRunScoreModal] = useState(false);
  const [showRecapModal, setShowRecapModal] = useState(false);
  const [selectedParticipantForScore, setSelectedParticipantForScore] = useState<EventParticipant | null>(null);

  // Live Cam Wave Run states
  const [showWaveRunLiveModal, setShowWaveRunLiveModal] = useState(false);
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [liveRunWave, setLiveRunWave] = useState<number>(1);
  const [liveRunCameraId, setLiveRunCameraId] = useState<number | undefined>(undefined);
  const [liveRunDuration, setLiveRunDuration] = useState<number>(720);
  const [liveRunCooldown, setLiveRunCooldown] = useState<number>(15);
  const [liveRunState, setLiveRunState] = useState<WaveRunLiveState | null>(null);
  const [liveRunFrame, setLiveRunFrame] = useState<string | null>(null);
  const [liveRunSaving, setLiveRunSaving] = useState(false);
  const waveRunWsRef = React.useRef<WebSocket | null>(null);

  // Wave Participant Pre-test Configuration states (Nomor Dada & Warna Kaos)
  const [waveParticipantConfigs, setWaveParticipantConfigs] = useState<
    Record<number, { chest_number: string; vest_color: string }>
  >({});
  const [isWaveConfigSaved, setIsWaveConfigSaved] = useState<boolean>(true);
  const [liveRunConfigSaving, setLiveRunConfigSaving] = useState<boolean>(false);
  const [configSaveSuccessBanner, setConfigSaveSuccessBanner] = useState<string | null>(null);

  const VEST_COLORS = [
    { name: 'Merah', hex: '#EF4444' },
    { name: 'Kuning', hex: '#FACC15' },
    { name: 'Biru', hex: '#3B82F6' },
    { name: 'Hijau', hex: '#22C55E' },
    { name: 'Oranye', hex: '#F97316' },
    { name: 'Putih', hex: '#F8FAFC' },
    { name: 'Hitam', hex: '#1E293B' },
    { name: 'Ungu', hex: '#A855F7' },
  ];

  // Form states
  const [newEventForm, setNewEventForm] = useState({
    name: '',
    location: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    description: '',
    track_length_meters: 400,
    total_waves: 2,
    status: 'scheduled' as const,
  });

  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkResult, setBulkResult] = useState<any>(null);
  const [bulkTab, setBulkTab] = useState<'file' | 'paste'>('file');
  const [uploadedExcelName, setUploadedExcelName] = useState<string | null>(null);
  const [excelParsedItems, setExcelParsedItems] = useState<BulkEventParticipantItem[]>([]);
  const excelFileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [waveConfig, setWaveConfig] = useState({
    total_waves: 2,
    strategy: 'sequential',
    auto_chest_numbers: true,
  });

  const [runScoreInput, setRunScoreInput] = useState({
    laps: 7,
    extraMeters: 0,
    notes: '',
  });

  // Load events
  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await api.getEvents();
      setEvents(data);
    } catch (err: any) {
      console.error('Gagal memuat kegiatan:', err);
    } finally {
      setLoading(false);
    }
  };

  // Load participants for selected event
  const loadEventParticipants = async (eventId: number) => {
    try {
      const data = await api.getEventParticipants(eventId);
      setParticipants(data);
    } catch (err: any) {
      console.error('Gagal memuat peserta kegiatan:', err);
    }
  };

  useEffect(() => {
    loadEvents();
    api.getCameras().then((cams) => {
      setCameras(cams);
      if (cams.length > 0) {
        setLiveRunCameraId(cams[0].id);
      }
    }).catch(() => {});
    return () => {
      if (waveRunWsRef.current) {
        waveRunWsRef.current.close();
        waveRunWsRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (selectedEvent) {
      loadEventParticipants(selectedEvent.id);
    }
  }, [selectedEvent]);

  // Handle Event Creation
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createEvent({
        name: newEventForm.name,
        location: newEventForm.location,
        start_date: newEventForm.start_date,
        end_date: newEventForm.end_date || undefined,
        description: newEventForm.description,
        track_length_meters: Number(newEventForm.track_length_meters),
        total_waves: Number(newEventForm.total_waves),
        status: newEventForm.status,
      });
      setShowCreateModal(false);
      setNewEventForm({
        name: '',
        location: '',
        start_date: new Date().toISOString().split('T')[0],
        end_date: '',
        description: '',
        track_length_meters: 400,
        total_waves: 2,
        status: 'scheduled',
      });
      await loadEvents();
      setSelectedEvent(created);
    } catch (err: any) {
      alert('Gagal membuat kegiatan: ' + err.message);
    }
  };

  // Download Excel Template (.xlsx)
  const handleDownloadTemplate = () => {
    const data = [
      ['NRP', 'Nama Lengkap', 'Gender (L/P)', 'Kesatuan', 'Kategori/Pangkat', 'Nomor Dada', 'Gelombang', 'No Telepon'],
      ['NRP-20261101', 'Mayor Inf Hendra Kusuma', 'L', 'Batalyon Raider', 'Perwira', '01', 1, '081234567801'],
      ['NRP-20261102', 'Kapten Budi Santoso', 'L', 'Yonif 500', 'Perwira', '02', 1, '081234567802'],
      ['NRP-20261103', 'Serda Dewi Anggraini', 'P', 'Kowad', 'Bintara', '03', 2, '081234567803'],
      ['NRP-20261104', 'Kopda Joko Susilo', 'L', 'Batalyon 1 Infanteri', 'Tamtama', '04', 2, '081234567804'],
      ['NRP-20261105', 'Praka Dimas Prasetyo', 'L', 'Batalyon Armed', 'Tamtama', '05', 3, '081234567805'],
    ];
    const ws = XLSX.utils.aoa_to_sheet(data);
    ws['!cols'] = [
      { wch: 16 }, // NRP
      { wch: 28 }, // Nama
      { wch: 14 }, // Gender
      { wch: 24 }, // Kesatuan
      { wch: 18 }, // Kategori
      { wch: 12 }, // Nomor Dada
      { wch: 12 }, // Gelombang
      { wch: 16 }, // No Telepon
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template Peserta');
    XLSX.writeFile(wb, 'Template_Peserta_Samapta.xlsx');
  };

  // Parse Excel file (.xlsx, .xls, .csv)
  const handleExcelFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
      const colMap = { nrp: 0, name: 1, gender: 2, unit: 3, category: 4, chest: 5, wave: 6, phone: 7 };

      const firstRow = rawRows[0].map((cell: any) => String(cell || '').toLowerCase().trim());
      const hasNrpHeader = firstRow.some((c: string) => c.includes('nrp') || c.includes('nomor') || c.includes('nip'));

      if (hasNrpHeader) {
        firstRow.forEach((c: string, idx: number) => {
          if (c.includes('nrp') || c.includes('nip') || c.includes('nomor peserta')) colMap.nrp = idx;
          else if (c.includes('nama') || c.includes('name')) colMap.name = idx;
          else if (c.includes('gender') || c.includes('kelamin') || c === 'jk' || c === 'sex') colMap.gender = idx;
          else if (c.includes('kesatuan') || c.includes('satuan') || c.includes('unit') || c.includes('org')) colMap.unit = idx;
          else if (c.includes('kategori') || c.includes('pangkat') || c.includes('grade')) colMap.category = idx;
          else if (c.includes('dada') || c.includes('chest')) colMap.chest = idx;
          else if (c.includes('gel') || c.includes('wave')) colMap.wave = idx;
          else if (c.includes('telp') || c.includes('phone') || c.includes('hp')) colMap.phone = idx;
        });
        headerRowIndex = 1;
      }

      const items: BulkEventParticipantItem[] = [];
      const linesForTextarea: string[] = [];

      for (let i = headerRowIndex; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        const nrpRaw = row[colMap.nrp] !== undefined ? String(row[colMap.nrp]).trim() : '';
        if (!nrpRaw || nrpRaw.toLowerCase() === 'nrp' || nrpRaw.toLowerCase() === 'nomor') continue;

        const nameRaw = row[colMap.name] !== undefined ? String(row[colMap.name]).trim() : '';
        const genderRaw = row[colMap.gender] !== undefined ? String(row[colMap.gender]).trim().toUpperCase() : 'L';
        const unitRaw = row[colMap.unit] !== undefined ? String(row[colMap.unit]).trim() : '';
        const categoryRaw = row[colMap.category] !== undefined ? String(row[colMap.category]).trim() : '';
        const chestRaw = row[colMap.chest] !== undefined ? String(row[colMap.chest]).trim() : '';
        const waveRaw = row[colMap.wave] !== undefined ? parseInt(String(row[colMap.wave]).trim(), 10) : 1;
        const phoneRaw = row[colMap.phone] !== undefined ? String(row[colMap.phone]).trim() : '';

        const item: BulkEventParticipantItem = {
          nrp: nrpRaw,
          name: nameRaw || undefined,
          gender: genderRaw === 'P' || genderRaw.startsWith('W') || genderRaw.includes('FEMALE') ? 'P' : 'L',
          unit: unitRaw || undefined,
          category: categoryRaw || undefined,
          chest_number: chestRaw || undefined,
          wave_number: !isNaN(waveRaw) && waveRaw > 0 ? waveRaw : 1,
          phone: phoneRaw || undefined,
        };

        items.push(item);
        linesForTextarea.push(
          `${item.nrp}\t${item.name || ''}\t${item.gender}\t${item.unit || ''}\t${item.category || ''}\t${item.chest_number || ''}\t${item.wave_number}`
        );
      }

      if (items.length === 0) {
        alert('Tidak ditemukan baris data peserta yang valid di file Excel ini.');
        return;
      }

      setUploadedExcelName(file.name);
      setExcelParsedItems(items);
      setBulkInputText(linesForTextarea.join('\n'));
      setBulkResult(null);
    } catch (err: any) {
      alert('Gagal membaca file Excel: ' + err.message);
    }
  };

  const handleFillSampleText = () => {
    const sample = [
      "NRP-20261101\tMayor Inf Hendra Kusuma\tL\tBatalyon Raider\tPerwira\t01\t1",
      "NRP-20261102\tKapten Budi Santoso\tL\tYonif 500\tPerwira\t02\t1",
      "NRP-20261103\tSerda Dewi Anggraini\tP\tKowad\tBintara\t03\t2",
      "NRP-20261104\tKopda Joko Susilo\tL\tBatalyon 1 Infanteri\tTamtama\t04\t2",
      "NRP-20261105\tPraka Dimas Prasetyo\tL\tBatalyon Armed\tTamtama\t05\t3"
    ].join('\n');
    setBulkInputText(sample);
  };

  // Handle Bulk Participant Import
  const handleBulkImport = async () => {
    if (!selectedEvent) return;
    try {
      let items: BulkEventParticipantItem[] = [];

      if (bulkTab === 'file' && excelParsedItems.length > 0) {
        items = excelParsedItems;
      } else {
        const lines = bulkInputText.trim().split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          const cols = line.includes('\t') ? line.split('\t') : line.split(',');
          const nrp = cols[0]?.trim();
          if (!nrp || nrp.toLowerCase() === 'nrp' || nrp.toLowerCase() === 'nomor') continue;

          items.push({
            nrp,
            name: cols[1]?.trim() || undefined,
            gender: cols[2]?.trim()?.toUpperCase() === 'P' ? 'P' : 'L',
            unit: cols[3]?.trim() || undefined,
            category: cols[4]?.trim() || undefined,
            chest_number: cols[5]?.trim() || undefined,
            wave_number: cols[6]?.trim() ? parseInt(cols[6].trim()) : 1,
          });
        }
      }

      if (items.length === 0) {
        alert('Tidak ada data valid yang ditemukan untuk diimpor. Silakan unggah file Excel atau isi data terlebih dahulu.');
        return;
      }

      const res = await api.bulkInsertEventParticipants(selectedEvent.id, items);
      setBulkResult(res);
      await loadEventParticipants(selectedEvent.id);
      await loadEvents();
    } catch (err: any) {
      alert('Gagal impor peserta: ' + err.message);
    }
  };

  // Handle Distribute Waves
  const handleDistributeWaves = async () => {
    if (!selectedEvent) return;
    try {
      await api.distributeWaves(selectedEvent.id, waveConfig);
      setShowWaveModal(false);
      await loadEventParticipants(selectedEvent.id);
      const updated = await api.getEvent(selectedEvent.id);
      setSelectedEvent(updated);
      alert('Pembagian gelombang berhasil diterapkan!');
    } catch (err: any) {
      alert('Gagal membagi gelombang: ' + err.message);
    }
  };

  // Handle Submit Run Score
  const handleSaveRunScore = async () => {
    if (!selectedEvent || !selectedParticipantForScore) return;
    try {
      await api.submitRunScore(selectedEvent.id, selectedParticipantForScore.participant_id, {
        run_laps: Number(runScoreInput.laps),
        run_extra_meters: Number(runScoreInput.extraMeters),
        run_notes: runScoreInput.notes,
      });
      setShowRunScoreModal(false);
      await loadEventParticipants(selectedEvent.id);
    } catch (err: any) {
      alert('Gagal menyimpan nilai lari: ' + err.message);
    }
  };

  // Open Recap View
  const handleOpenRecap = async () => {
    if (!selectedEvent) return;
    try {
      const data = await api.getEventRecap(selectedEvent.id);
      setRecapData(data);
      setShowRecapModal(true);
    } catch (err: any) {
      alert('Gagal memuat rekapitulasi: ' + err.message);
    }
  };

  // --- Wave Run Live Cam Handlers ---
  const connectWaveRunWebSocket = (eventId: number, waveNum: number) => {
    if (waveRunWsRef.current) {
      waveRunWsRef.current.close();
      waveRunWsRef.current = null;
    }
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/events/${eventId}/waves/${waveNum}/run-live`;
    const ws = new WebSocket(wsUrl);
    waveRunWsRef.current = ws;

    ws.onmessage = (evt) => {
      try {
        const data: WaveRunLiveState = JSON.parse(evt.data);
        if (data.error) return;
        if (data.frame) {
          setLiveRunFrame(data.frame);
        }
        setLiveRunState(data);
      } catch (e) {
        console.error('Error parsing wave run WS data:', e);
      }
    };

    ws.onclose = () => {
      if (waveRunWsRef.current === ws) {
        waveRunWsRef.current = null;
      }
    };
  };

  const handleOpenWaveRunLiveModal = async (waveOverride?: number) => {
    if (!selectedEvent) return;
    const targetWave = waveOverride ?? (selectedWave === 'all' ? 1 : selectedWave);
    setLiveRunWave(targetWave);
    setShowWaveRunLiveModal(true);

    // Refresh daftar kamera agar dropdown selalu terisi
    try {
      const cams = await api.getCameras();
      setCameras(cams);
      if (cams.length > 0 && (!liveRunCameraId || !cams.some((c) => c.id === liveRunCameraId))) {
        setLiveRunCameraId(cams[0].id);
      }
    } catch (e) {
      console.error('Gagal memuat kamera:', e);
    }

    try {
      const st = await api.getWaveRunLiveState(selectedEvent.id, targetWave);
      setLiveRunState(st);

      // Inisialisasi konfigurasi nomor dada dan warna kaos untuk peserta gelombang ini
      const initConfigs: Record<number, { chest_number: string; vest_color: string }> = {};
      let allConfigured = st.participants.length > 0;
      st.participants.forEach((p, idx) => {
        const cNo = (p.chest_number || `${idx + 1}`.padStart(2, '0')).trim();
        const vCol = p.assigned_vest_color && p.assigned_vest_color !== 'Netral'
          ? p.assigned_vest_color
          : (p.vest_color && p.vest_color !== 'Netral' ? p.vest_color : '');
        if (!vCol || !p.chest_number) {
          allConfigured = false;
        }
        initConfigs[p.participant_id] = {
          chest_number: cNo,
          vest_color: vCol || 'Merah',
        };
      });
      setWaveParticipantConfigs(initConfigs);
      setIsWaveConfigSaved(allConfigured);

      if (st.status === 'in_progress' || st.status === 'paused') {
        connectWaveRunWebSocket(selectedEvent.id, targetWave);
      } else {
        setLiveRunFrame(null);
      }
    } catch (err: any) {
      console.error('Gagal memuat state live cam lari:', err);
    }
  };

  const handleWaveRunChangeWave = async (newWave: number) => {
    if (!selectedEvent) return;
    if (waveRunWsRef.current) {
      waveRunWsRef.current.close();
      waveRunWsRef.current = null;
    }
    setLiveRunWave(newWave);
    setLiveRunFrame(null);
    try {
      const st = await api.getWaveRunLiveState(selectedEvent.id, newWave);
      setLiveRunState(st);

      // Inisialisasi konfigurasi peserta gelombang baru
      const initConfigs: Record<number, { chest_number: string; vest_color: string }> = {};
      let allConfigured = st.participants.length > 0;
      st.participants.forEach((p, idx) => {
        const cNo = (p.chest_number || `${idx + 1}`.padStart(2, '0')).trim();
        const vCol = p.assigned_vest_color && p.assigned_vest_color !== 'Netral'
          ? p.assigned_vest_color
          : (p.vest_color && p.vest_color !== 'Netral' ? p.vest_color : '');
        if (!vCol || !p.chest_number) {
          allConfigured = false;
        }
        initConfigs[p.participant_id] = {
          chest_number: cNo,
          vest_color: vCol || 'Merah',
        };
      });
      setWaveParticipantConfigs(initConfigs);
      setIsWaveConfigSaved(allConfigured);

      if (st.status === 'in_progress' || st.status === 'paused') {
        connectWaveRunWebSocket(selectedEvent.id, newWave);
      }
    } catch (err: any) {
      console.error('Gagal mengganti gelombang live lari:', err);
    }
  };

  const handleSaveWaveParticipantConfigs = async () => {
    if (!selectedEvent || !liveRunState) return;
    try {
      setLiveRunConfigSaving(true);
      const items = liveRunState.participants.map((p, idx) => {
        const conf = waveParticipantConfigs[p.participant_id] || {
          chest_number: p.chest_number || `${idx + 1}`.padStart(2, '0'),
          vest_color: p.vest_color || 'Merah',
        };
        return {
          participant_id: p.participant_id,
          chest_number: conf.chest_number.trim(),
          vest_color: conf.vest_color.trim(),
        };
      });

      await api.configureWaveParticipants(selectedEvent.id, liveRunWave, { participants: items });
      setIsWaveConfigSaved(true);
      setConfigSaveSuccessBanner(
        `✓ Pengaturan nomor dada & warna kaos Gelombang ${liveRunWave} berhasil disimpan! Anda sekarang dapat memulai tes lari.`
      );
      setTimeout(() => setConfigSaveSuccessBanner(null), 6000);

      await loadEventParticipants(selectedEvent.id);
      const updatedSt = await api.getWaveRunLiveState(selectedEvent.id, liveRunWave);
      setLiveRunState(updatedSt);
    } catch (err: any) {
      alert('Gagal menyimpan konfigurasi nomor dada & warna kaos: ' + err.message);
    } finally {
      setLiveRunConfigSaving(false);
    }
  };

  const handleStartWaveRunLive = async () => {
    if (!selectedEvent) return;
    if (!isWaveConfigSaved) {
      alert('Simpan konfigurasi nomor dada dan warna kaos peserta terlebih dahulu sebelum memulai tes lari!');
      return;
    }
    try {
      const targetCamId = liveRunCameraId || (cameras.length > 0 ? cameras[0].id : undefined);
      const st = await api.startWaveRunLive(selectedEvent.id, liveRunWave, {
        camera_id: targetCamId,
        target_duration_seconds: liveRunDuration,
        lap_cooldown_seconds: liveRunCooldown,
        confirm_frames_required: 1,
      });
      setLiveRunState(st);
      connectWaveRunWebSocket(selectedEvent.id, liveRunWave);
    } catch (err: any) {
      alert('Gagal memulai Live Cam Lari Gelombang: ' + err.message);
    }
  };

  const handleControlWaveRun = async (
    action: 'pause' | 'resume' | 'stop' | 'adjust_lap' | 'set_extra_meters',
    participantId?: number,
    delta?: number,
    extraMeters?: number
  ) => {
    if (!selectedEvent || !liveRunState) return;
    const isSessionActive = liveRunState.status === 'in_progress' || liveRunState.status === 'paused';

    if (!isSessionActive && (action === 'adjust_lap' || action === 'set_extra_meters')) {
      // Local state update when camera is idle or stopped
      const trackLen = liveRunState.track_length_meters || selectedEvent.track_length_meters || 400;
      const updatedParts = liveRunState.participants.map((r) => {
        if (r.participant_id !== participantId) return r;
        const newLaps = action === 'adjust_lap' ? Math.max(0, r.run_laps + (delta || 0)) : r.run_laps;
        const newExtra = action === 'set_extra_meters' ? Math.max(0, extraMeters || 0) : r.run_extra_meters;
        const newDist = newLaps * trackLen + newExtra;
        return {
          ...r,
          run_laps: newLaps,
          run_extra_meters: newExtra,
          run_total_distance_meters: newDist,
        };
      });
      setLiveRunState({ ...liveRunState, participants: updatedParts });
      return;
    }

    try {
      const st = await api.controlWaveRunLive(selectedEvent.id, liveRunWave, {
        action,
        participant_id: participantId,
        delta,
        extra_meters: extraMeters,
      });
      setLiveRunState(st);
      if (action === 'stop' && waveRunWsRef.current) {
        waveRunWsRef.current.close();
        waveRunWsRef.current = null;
      }
    } catch (err: any) {
      alert('Gagal mengontrol sesi Live Cam Lari: ' + err.message);
    }
  };

  const handleSaveWaveRunToDb = async () => {
    if (!selectedEvent || !liveRunState) return;
    try {
      setLiveRunSaving(true);
      const payloadItems = liveRunState.participants.map((r) => ({
        participant_id: r.participant_id,
        run_laps: r.run_laps,
        run_extra_meters: r.run_extra_meters,
      }));
      const res = await api.saveWaveRunLive(selectedEvent.id, liveRunWave, {
        participants: payloadItems,
        stop_session: true,
      });
      if (waveRunWsRef.current) {
        waveRunWsRef.current.close();
        waveRunWsRef.current = null;
      }
      await loadEventParticipants(selectedEvent.id);
      setShowWaveRunLiveModal(false);
      alert(res.message);
    } catch (err: any) {
      alert('Gagal menyimpan hasil lari gelombang: ' + err.message);
    } finally {
      setLiveRunSaving(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const s = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  };

  // Calculate live preview distance and estimated score
  const previewDistance = selectedEvent
    ? (Number(runScoreInput.laps) * selectedEvent.track_length_meters) + Number(runScoreInput.extraMeters)
    : 0;

  // Filter participants
  const filteredParticipants = participants.filter((p) => {
    const matchWave = selectedWave === 'all' || p.wave_number === selectedWave;
    const matchSearch =
      !searchTerm ||
      p.participant?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.participant?.participant_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.chest_number?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchWave && matchSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center">
            <CalendarDays className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Manajemen Kegiatan Samapta</h1>
            <p className="text-sm text-slate-500">
              Sistem Informasi Manajemen (SIM) Perencanaan, Gelombang, Penilaian Lari & Integrasi AI
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {selectedEvent ? (
            <button
              onClick={() => setSelectedEvent(null)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium text-sm transition"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Kembali ke Daftar</span>
            </button>
          ) : (
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm transition shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Perencanaan Kegiatan Baru</span>
            </button>
          )}
        </div>
      </div>

      {/* VIEW 1: EVENT LIST */}
      {!selectedEvent && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {loading ? (
            <div className="col-span-full text-center py-12 text-slate-400">
              Memuat data kegiatan kesamaptaan...
            </div>
          ) : events.length === 0 ? (
            <div className="col-span-full bg-white rounded-2xl p-12 text-center border border-slate-200">
              <CalendarDays className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-800">Belum Ada Kegiatan Samapta</h3>
              <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-6">
                Mulai buat perencanaan kegiatan samapta seperti penentuan jadwal, lokasi, lintasan, dan peserta.
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center space-x-2 px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold text-sm shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Buat Kegiatan Sekarang</span>
              </button>
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-1 rounded-md bg-slate-100 text-slate-700">
                      {evt.event_code}
                    </span>
                    <span
                      className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                        evt.status === 'completed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : evt.status === 'in_progress'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {evt.status === 'scheduled' ? 'Terjadwal' : evt.status === 'in_progress' ? 'Berlangsung' : 'Selesai'}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 mb-1">{evt.name}</h3>
                  <p className="text-xs text-slate-500 mb-4 flex items-center space-x-1">
                    <Navigation className="w-3.5 h-3.5 text-slate-400" />
                    <span>{evt.location}</span>
                  </p>

                  <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-xl text-center mb-4 border border-slate-100">
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Peserta</div>
                      <div className="text-base font-bold text-slate-800">{evt.total_participants || 0}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Gelombang</div>
                      <div className="text-base font-bold text-slate-800">{evt.total_waves}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase font-semibold text-slate-400">Track Lari</div>
                      <div className="text-base font-bold text-slate-800">{evt.track_length_meters}m</div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-xs text-slate-500">
                    {new Date(evt.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                  <button
                    onClick={() => setSelectedEvent(evt)}
                    className="flex items-center space-x-1 text-xs font-bold text-amber-600 hover:text-amber-700"
                  >
                    <span>Kelola & Nilai</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* VIEW 2: SELECTED EVENT WORKSPACE */}
      {selectedEvent && (
        <div className="space-y-6">
          {/* Summary Card */}
          <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-6 shadow-md border border-slate-700">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex items-center space-x-2 text-xs text-amber-400 font-semibold mb-1">
                  <span>{selectedEvent.event_code}</span>
                  <span>•</span>
                  <span>Lintasan Lari {selectedEvent.track_length_meters} Meter</span>
                </div>
                <h2 className="text-2xl font-black tracking-tight">{selectedEvent.name}</h2>
                <p className="text-sm text-slate-300 mt-1 flex items-center space-x-2">
                  <span>📍 {selectedEvent.location}</span>
                  <span>|</span>
                  <span>
                    📅 {new Date(selectedEvent.start_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </span>
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  onClick={() => setShowBulkModal(true)}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium text-xs transition"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
                  <span>Impor Peserta (Excel)</span>
                </button>

                <button
                  onClick={() => setShowWaveModal(true)}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-slate-100 font-medium text-xs transition"
                >
                  <Layers className="w-4 h-4 text-blue-400" />
                  <span>Bagi Gelombang Otomatis</span>
                </button>

                <button
                  onClick={() => handleOpenWaveRunLiveModal()}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition shadow-sm"
                >
                  <Video className="w-4 h-4" />
                  <span>Live Cam Lari (1 Gelombang)</span>
                </button>

                <button
                  onClick={handleOpenRecap}
                  className="flex items-center space-x-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition"
                >
                  <Award className="w-4 h-4" />
                  <span>Rekapitulasi Nilai & Cetak</span>
                </button>
              </div>
            </div>

            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-6 border-t border-slate-700/60">
              <div>
                <div className="text-[11px] text-slate-400">Total Peserta Terdaftar</div>
                <div className="text-xl font-bold text-white mt-0.5">{participants.length} Orang</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Jumlah Gelombang</div>
                <div className="text-xl font-bold text-white mt-0.5">{selectedEvent.total_waves} Gelombang</div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Telah Dinilai Lari (A)</div>
                <div className="text-xl font-bold text-emerald-400 mt-0.5">
                  {participants.filter((p) => p.run_score && p.run_score > 0).length} Orang
                </div>
              </div>
              <div>
                <div className="text-[11px] text-slate-400">Status Pelaksanaan</div>
                <div className="text-xl font-bold text-amber-400 mt-0.5 capitalize">
                  {selectedEvent.status}
                </div>
              </div>
            </div>
          </div>

          {/* Controls: Wave Tabs & Search */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200">
            {/* Wave Tabs */}
            <div className="flex items-center space-x-2 overflow-x-auto pb-1 md:pb-0">
              <button
                onClick={() => setSelectedWave('all')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  selectedWave === 'all'
                    ? 'bg-amber-500 text-slate-950'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Semua Gelombang ({participants.length})
              </button>
              {Array.from({ length: selectedEvent.total_waves }, (_, i) => i + 1).map((w) => {
                const countInWave = participants.filter((p) => p.wave_number === w).length;
                return (
                  <button
                    key={w}
                    onClick={() => setSelectedWave(w)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                      selectedWave === w
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    Gelombang {w} ({countInWave})
                  </button>
                );
              })}
            </div>

            {/* Search Input & Quick Wave Live Cam Button */}
            <div className="flex items-center space-x-2 w-full md:w-auto">
              <button
                onClick={() => handleOpenWaveRunLiveModal(selectedWave === 'all' ? 1 : selectedWave)}
                className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap transition shadow-xs"
                title="Buka Kamera Live Deteksi Nomor Dada Putaran Lari untuk Gelombang Ini"
              >
                <Video className="w-3.5 h-3.5" />
                <span>
                  Live Cam Lari Gelombang {selectedWave === 'all' ? 1 : selectedWave}
                </span>
              </button>

              <div className="relative flex-1 md:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari NRP, nama, no dada..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>

          {/* Participants Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase text-[10px] tracking-wider">
                  <tr>
                    <th className="py-3 px-4 text-center">No Dada</th>
                    <th className="py-3 px-4">NRP / NIP</th>
                    <th className="py-3 px-4">Nama Lengkap</th>
                    <th className="py-3 px-4 text-center">L/P</th>
                    <th className="py-3 px-4">Kesatuan</th>
                    <th className="py-3 px-4 text-center">Gelombang</th>
                    <th className="py-3 px-4 text-center">Jarak Lari (A)</th>
                    <th className="py-3 px-4 text-center">Pull Up (B)</th>
                    <th className="py-3 px-4 text-center">Push Up (B)</th>
                    <th className="py-3 px-4 text-center">Sit Up (B)</th>
                    <th className="py-3 px-4 text-center">Shuttle Run (B)</th>
                    <th className="py-3 px-4 text-center">Aksi Penilaian</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredParticipants.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400">
                        Tidak ada peserta dalam gelombang atau pencarian ini.
                      </td>
                    </tr>
                  ) : (
                    filteredParticipants.map((p) => {
                      return (
                        <tr key={p.id} className="hover:bg-slate-50/70 transition">
                          <td className="py-3 px-4 text-center font-mono font-bold text-slate-800">
                            {p.chest_number || '-'}
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700">
                            {p.participant?.participant_number}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900">
                            {p.participant?.full_name}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                p.participant?.gender === 'L'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-pink-100 text-pink-700'
                              }`}
                            >
                              {p.participant?.gender}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            {p.participant?.organization || '-'}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 font-semibold text-slate-700">
                              Gel {p.wave_number}
                            </span>
                          </td>
                          {/* Jarak Lari (Samapta A) - Hanya Tampilkan Jarak */}
                          <td className="py-3 px-4 text-center">
                            {p.run_total_distance_meters > 0 ? (
                              <div className="inline-flex items-center space-x-1 font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                <span>{p.run_total_distance_meters} m</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Belum Lari</span>
                            )}
                          </td>
                          {/* Pull Up (Samapta B) */}
                          <td className="py-3 px-4 text-center">
                            {p.pullup_reps !== null && p.pullup_reps !== undefined ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="font-bold text-slate-900">{p.pullup_reps} Reps</span>
                                {p.pullup_score !== null && p.pullup_score !== undefined && (
                                  <span className="text-[10px] font-semibold text-blue-600">
                                    Skor: {p.pullup_score}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                          {/* Push Up (Samapta B) */}
                          <td className="py-3 px-4 text-center">
                            {p.pushup_reps !== null && p.pushup_reps !== undefined ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="font-bold text-slate-900">{p.pushup_reps} Reps</span>
                                {p.pushup_score !== null && p.pushup_score !== undefined && (
                                  <span className="text-[10px] font-semibold text-blue-600">
                                    Skor: {p.pushup_score}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                          {/* Sit Up (Samapta B) */}
                          <td className="py-3 px-4 text-center">
                            {p.situp_reps !== null && p.situp_reps !== undefined ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="font-bold text-slate-900">{p.situp_reps} Reps</span>
                                {p.situp_score !== null && p.situp_score !== undefined && (
                                  <span className="text-[10px] font-semibold text-blue-600">
                                    Skor: {p.situp_score}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                          {/* Shuttle Run (Samapta B) */}
                          <td className="py-3 px-4 text-center">
                            {p.shuttlerun_seconds !== null && p.shuttlerun_seconds !== undefined ? (
                              <div className="inline-flex flex-col items-center">
                                <span className="font-bold text-slate-900">{p.shuttlerun_seconds}s</span>
                                {p.shuttlerun_score !== null && p.shuttlerun_score !== undefined && (
                                  <span className="text-[10px] font-semibold text-blue-600">
                                    Skor: {p.shuttlerun_score}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">-</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center space-x-2">
                              <button
                                onClick={() => {
                                  setSelectedParticipantForScore(p);
                                  setRunScoreInput({
                                    laps: p.run_laps || 7,
                                    extraMeters: p.run_extra_meters || 0,
                                    notes: p.run_notes || '',
                                  });
                                  setShowRunScoreModal(true);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 font-semibold transition"
                                title="Input Hasil Tes Lari 12 Menit"
                              >
                                🏃 Nilai Lari
                              </button>

                              <button
                                onClick={() => {
                                  // Navigasi langsung ke live assessment dengan participant id
                                  navigate('/assessment', {
                                    state: {
                                      participantId: p.participant_id,
                                      eventId: selectedEvent.id,
                                    },
                                  });
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-700 font-semibold transition"
                                title="Uji Gerak Samapta B dengan AI Pose"
                              >
                                🤖 Tes AI
                              </button>

                              <button
                                onClick={async () => {
                                  if (confirm(`Hapus peserta ${p.participant?.full_name} dari kegiatan ini?`)) {
                                    await api.removeParticipantFromEvent(selectedEvent.id, p.participant_id);
                                    await loadEventParticipants(selectedEvent.id);
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-red-600 transition"
                                title="Hapus dari Kegiatan"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: CREATE EVENT */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Perencanaan Kegiatan Samapta Baru</h3>
            <p className="text-xs text-slate-500 mb-4">
              Isi data detail kegiatan untuk penjadwalan dan pengelolaan peserta.
            </p>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Kegiatan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Uji Kesamaptaan Jasmani Semester I 2026"
                  value={newEventForm.name}
                  onChange={(e) => setNewEventForm({ ...newEventForm, name: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Lokasi / Tempat Pelaksanaan *</label>
                <input
                  type="text"
                  required
                  placeholder="Contoh: Stadion Jasdam V / Lapangan Batalyon"
                  value={newEventForm.location}
                  onChange={(e) => setNewEventForm({ ...newEventForm, location: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Mulai *</label>
                  <input
                    type="date"
                    required
                    value={newEventForm.start_date}
                    onChange={(e) => setNewEventForm({ ...newEventForm, start_date: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tanggal Selesai</label>
                  <input
                    type="date"
                    value={newEventForm.end_date}
                    onChange={(e) => setNewEventForm({ ...newEventForm, end_date: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Panjang Lintasan Lari (m)</label>
                  <input
                    type="number"
                    min="100"
                    max="1000"
                    step="10"
                    value={newEventForm.track_length_meters}
                    onChange={(e) => setNewEventForm({ ...newEventForm, track_length_meters: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Standar lintasan lari adalah 400m</span>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Rencana Jumlah Gelombang</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    value={newEventForm.total_waves}
                    onChange={(e) => setNewEventForm({ ...newEventForm, total_waves: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400">Dapat dibagi ulang otomatis nanti</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Deskripsi / Catatan Tambahan</label>
                <textarea
                  rows={2}
                  placeholder="Keterangan instruksi atau ketentuan khusus kegiatan..."
                  value={newEventForm.description}
                  onChange={(e) => setNewEventForm({ ...newEventForm, description: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  Simpan Perencanaan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: BULK IMPORT EXCEL WITH NRP RESOLUTION */}
      {showBulkModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Impor Peserta Masal (Excel / Spreadsheet)</h3>
                  <p className="text-[11px] text-slate-500">
                    Unggah file Excel atau tempel baris data untuk didaftarkan ke kegiatan ini.
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-300 font-semibold text-xs transition shadow-xs"
                  title="Unduh format spreadsheet resmi .xlsx"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh Template Excel (.xlsx)</span>
                </button>
                <button
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkResult(null);
                  }}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto py-3 space-y-3.5">
              {/* NRP Identification Rule Banner */}
              <div className="bg-blue-50/70 border border-blue-200/80 rounded-xl p-3 text-xs text-blue-900 flex items-start space-x-2.5">
                <CheckCircle2 className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5 text-[11px] leading-relaxed">
                  <span className="font-bold text-blue-950">Aturan Cerdas Identifikasi NRP:</span>
                  <p>
                    Sistem otomatis memeriksa kolom <strong>NRP</strong>. Jika peserta sudah terdaftar di database, sistem menggunakan profil yang ada (tanpa duplikasi). Jika belum ada, sistem langsung membuat profil baru.
                  </p>
                </div>
              </div>

              {/* Mode Tabs */}
              <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl w-fit">
                <button
                  type="button"
                  onClick={() => setBulkTab('file')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    bulkTab === 'file'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileUp className="w-3.5 h-3.5" />
                  <span>Upload File Excel (.xlsx, .xls, .csv)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setBulkTab('paste')}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                    bulkTab === 'paste'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Tempel Teks / Manual</span>
                </button>
              </div>

              {/* TAB 1: UPLOAD FILE EXCEL */}
              {bulkTab === 'file' && (
                <div className="space-y-3">
                  <div
                    onClick={() => excelFileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 hover:border-amber-500 hover:bg-amber-50/20 rounded-2xl p-6 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 bg-slate-50/50"
                  >
                    <input
                      ref={excelFileInputRef}
                      type="file"
                      accept=".xlsx, .xls, .csv"
                      onChange={handleExcelFileUpload}
                      className="hidden"
                    />
                    <div className="w-12 h-12 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center shadow-xs">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800">
                        {uploadedExcelName ? `File Terpilih: ${uploadedExcelName}` : 'Klik untuk Memilih File Excel'}
                      </span>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Mendukung format Microsoft Excel (.xlsx, .xls) dan CSV (.csv)
                      </p>
                    </div>
                    {uploadedExcelName && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>{excelParsedItems.length} Peserta Berhasil Dibaca</span>
                      </span>
                    )}
                  </div>

                  {/* Preview Table if File Loaded */}
                  {excelParsedItems.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      <div className="bg-slate-50 px-3 py-1.5 border-b border-slate-200 flex items-center justify-between text-[11px] font-semibold text-slate-700">
                        <span>Pratinjau Data Peserta ({excelParsedItems.length} Baris):</span>
                        <span className="text-slate-400 font-normal">Siap diproses ke kegiatan</span>
                      </div>
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-slate-100/70 text-slate-600 uppercase text-[9px] sticky top-0">
                          <tr>
                            <th className="py-1.5 px-2.5">NRP</th>
                            <th className="py-1.5 px-2.5">Nama Lengkap</th>
                            <th className="py-1.5 px-2.5 text-center">L/P</th>
                            <th className="py-1.5 px-2.5">Kesatuan</th>
                            <th className="py-1.5 px-2.5">Pangkat</th>
                            <th className="py-1.5 px-2.5 text-center">Dada</th>
                            <th className="py-1.5 px-2.5 text-center">Gel</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-mono">
                          {excelParsedItems.slice(0, 50).map((row, idx) => (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="py-1.5 px-2.5 font-bold text-slate-800">{row.nrp}</td>
                              <td className="py-1.5 px-2.5 font-sans">{row.name || '-'}</td>
                              <td className="py-1.5 px-2.5 text-center font-bold">{row.gender}</td>
                              <td className="py-1.5 px-2.5 font-sans text-slate-600">{row.unit || '-'}</td>
                              <td className="py-1.5 px-2.5 font-sans text-slate-600">{row.category || '-'}</td>
                              <td className="py-1.5 px-2.5 text-center">{row.chest_number || '-'}</td>
                              <td className="py-1.5 px-2.5 text-center">{row.wave_number || 1}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: TEMPEL TEKS / MANUAL */}
              {bulkTab === 'paste' && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-slate-700 text-xs">
                      Tempel (Paste) Baris Kolom dari Excel / Spreadsheet:
                    </label>
                    <button
                      type="button"
                      onClick={handleFillSampleText}
                      className="text-[11px] text-amber-600 hover:text-amber-700 font-semibold"
                    >
                      + Isi Contoh Data
                    </button>
                  </div>
                  <textarea
                    rows={7}
                    placeholder="Contoh:
NRP-20261101	Mayor Inf Hendra Kusuma	L	Batalyon Raider	Perwira	01	1
NRP-20261102	Kapten Budi Santoso	L	Yonif 500	Perwira	02	1
NRP-20261103	Serda Dewi Anggraini	P	Kowad	Bintara	03	2"
                    value={bulkInputText}
                    onChange={(e) => setBulkInputText(e.target.value)}
                    className="w-full p-3 font-mono text-xs rounded-xl border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-400 block font-mono">
                    Urutan kolom: NRP [Tab] Nama [Tab] Gender (L/P) [Tab] Kesatuan [Tab] Pangkat [Tab] No.Dada [Tab] Gelombang
                  </span>
                </div>
              )}

              {/* Result Summary Notification */}
              {bulkResult && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-900">
                  <div className="font-bold flex items-center space-x-1.5 mb-2 text-emerald-950">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Hasil Impor Peserta Berhasil:</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-[10px] text-slate-500">Total Diproses</div>
                      <div className="font-bold text-slate-800">{bulkResult.total_processed}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-[10px] text-slate-500">NRP Sudah Ada (Digunakan)</div>
                      <div className="font-bold text-blue-700">{bulkResult.existing_participants_reused}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-[10px] text-slate-500">Peserta Baru Dibuat</div>
                      <div className="font-bold text-emerald-700">{bulkResult.new_participants_created}</div>
                    </div>
                    <div className="bg-white p-2 rounded-lg border border-emerald-100">
                      <div className="text-[10px] text-slate-500">Terdaftar di Kegiatan</div>
                      <div className="font-bold text-slate-900">{bulkResult.linked_to_event}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-100">
              <span className="text-[11px] text-slate-500">
                {bulkTab === 'file' && excelParsedItems.length > 0
                  ? `${excelParsedItems.length} peserta terpilih dari file`
                  : bulkInputText.trim()
                  ? `${bulkInputText.trim().split('\n').length} baris teks terisi`
                  : 'Pilih file excel atau tempel teks'}
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowBulkModal(false);
                    setBulkResult(null);
                    setExcelParsedItems([]);
                    setUploadedExcelName(null);
                  }}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold text-xs"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleBulkImport}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs shadow-sm flex items-center space-x-1.5"
                >
                  <UploadCloud className="w-4 h-4" />
                  <span>Proses & Masukkan Peserta</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* MODAL 3: AUTO WAVE DISTRIBUTION */}
      {showWaveModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Bagi Gelombang Pelaksanaan Otomatis</h3>
            <p className="text-xs text-slate-500 mb-4">
              Sistem akan membagi {participants.length} peserta secara merata ke dalam gelombang dan memberi nomor dada.
            </p>

            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tentukan Jumlah Gelombang</label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={waveConfig.total_waves}
                  onChange={(e) => setWaveConfig({ ...waveConfig, total_waves: Number(e.target.value) })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
                <span className="text-[11px] text-slate-400 mt-1 block">
                  Estimasi: ~{Math.ceil(participants.length / (waveConfig.total_waves || 1))} peserta per gelombang
                </span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Metode Pembagian</label>
                <select
                  value={waveConfig.strategy}
                  onChange={(e) => setWaveConfig({ ...waveConfig, strategy: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                >
                  <option value="sequential">Berurutan (Kapasitas Penuh Per Gelombang)</option>
                  <option value="round_robin">Bergantian (Round Robin)</option>
                </select>
              </div>

              <div className="flex items-center space-x-2 pt-1">
                <input
                  type="checkbox"
                  id="auto_chest"
                  checked={waveConfig.auto_chest_numbers}
                  onChange={(e) => setWaveConfig({ ...waveConfig, auto_chest_numbers: e.target.checked })}
                  className="rounded text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="auto_chest" className="text-slate-700 font-medium">
                  Otomatis buatkan Nomor Dada urut per gelombang (01, 02, ...)
                </label>
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWaveModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleDistributeWaves}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  Terapkan Pembagian Gelombang
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: INPUT NILAI LARI 12 MENIT */}
      {showRunScoreModal && selectedParticipantForScore && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Penilaian Lari 12 Menit (Samapta A)</h3>
            <p className="text-xs text-slate-500 mb-4">
              Peserta: <strong>{selectedParticipantForScore.participant?.full_name}</strong> (
              {selectedParticipantForScore.participant?.gender === 'L' ? 'Pria' : 'Wanita'}) • No Dada:{' '}
              {selectedParticipantForScore.chest_number || '-'}
            </p>

            <div className="space-y-4 text-xs">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-slate-500">Panjang Lintasan Track</div>
                  <div className="text-sm font-bold text-slate-800">{selectedEvent?.track_length_meters} Meter</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-slate-500">Kalkulasi Jarak Tempuh</div>
                  <div className="text-sm font-bold text-blue-600">{previewDistance} Meter</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jumlah Putaran Penuh *</label>
                  <input
                    type="number"
                    min="0"
                    max="50"
                    value={runScoreInput.laps}
                    onChange={(e) => setRunScoreInput({ ...runScoreInput, laps: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold text-base text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">Putaran keliling lapangan</span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Lebihan Jarak (Meter)</label>
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    step="5"
                    value={runScoreInput.extraMeters}
                    onChange={(e) => setRunScoreInput({ ...runScoreInput, extraMeters: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold text-base text-slate-800"
                  />
                  <span className="text-[10px] text-slate-400">Meter sisa sebelum waktu habis</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Catatan Penguji / Kondisi Fisik</label>
                <input
                  type="text"
                  placeholder="Contoh: Kondisi prima, cuaca cerah"
                  value={runScoreInput.notes}
                  onChange={(e) => setRunScoreInput({ ...runScoreInput, notes: e.target.value })}
                  className="w-full p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRunScoreModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 font-semibold"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveRunScore}
                  className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold"
                >
                  Simpan & Hitung Skor
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: REKAPITULASI RESMI & CETAK */}
      {showRecapModal && recapData && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl border border-slate-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 text-amber-600 flex items-center justify-center">
                  <Award className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Rekapitulasi Lengkap Hasil Tes Kesamaptaan Jasmani
                  </h3>
                  <p className="text-xs text-slate-500">
                    {recapData.event.name} • {recapData.event.location} • Total: {recapData.total_participants} Peserta
                  </p>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-medium text-xs transition"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Dokumen</span>
                </button>
                <button
                  onClick={() => setShowRecapModal(false)}
                  className="text-slate-400 hover:text-slate-600 text-sm px-2"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Content */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4">
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-100 text-slate-700 text-[10px] uppercase font-bold border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 text-center border-r">No Dada</th>
                    <th className="py-2.5 px-3 border-r">NRP</th>
                    <th className="py-2.5 px-3 border-r">Nama Peserta</th>
                    <th className="py-2.5 px-3 text-center border-r">L/P</th>
                    <th className="py-2.5 px-3 border-r">Kesatuan</th>
                    <th className="py-2.5 px-3 text-center border-r">Gel</th>
                    <th className="py-2.5 px-3 text-center border-r bg-blue-50/50">Jarak Lari (m)</th>
                    <th className="py-2.5 px-3 text-center border-r bg-blue-50/50">Skor A</th>
                    <th className="py-2.5 px-3 text-center border-r bg-amber-50/50">Pullup</th>
                    <th className="py-2.5 px-3 text-center border-r bg-amber-50/50">Pushup</th>
                    <th className="py-2.5 px-3 text-center border-r bg-amber-50/50">Situp</th>
                    <th className="py-2.5 px-3 text-center border-r bg-amber-50/50">Shuttle</th>
                    <th className="py-2.5 px-3 text-center border-r bg-emerald-50/50">Nilai Akhir</th>
                    <th className="py-2.5 px-3 text-center bg-emerald-50/50">Predikat</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 font-mono text-[11px]">
                  {recapData.participants.map((item) => (
                    <tr key={item.event_participant_id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-bold text-slate-800 border-r">
                        {item.chest_number || '-'}
                      </td>
                      <td className="py-2 px-3 text-slate-700 border-r">{item.nrp}</td>
                      <td className="py-2 px-3 font-sans font-medium text-slate-900 border-r">{item.name}</td>
                      <td className="py-2 px-3 text-center border-r">{item.gender}</td>
                      <td className="py-2 px-3 font-sans text-slate-600 border-r">{item.unit || '-'}</td>
                      <td className="py-2 px-3 text-center border-r">Gel {item.wave_number}</td>
                      <td className="py-2 px-3 text-center font-bold border-r bg-blue-50/20">
                        {item.run_distance_meters > 0 ? `${item.run_distance_meters}m` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center font-bold border-r bg-blue-50/20 text-blue-700">
                        {item.run_score !== null ? item.run_score : '-'}
                      </td>
                      <td className="py-2 px-3 text-center border-r bg-amber-50/20">
                        {item.pullup_reps !== null ? `${item.pullup_reps} (${item.pullup_score})` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center border-r bg-amber-50/20">
                        {item.pushup_reps !== null ? `${item.pushup_reps} (${item.pushup_score})` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center border-r bg-amber-50/20">
                        {item.situp_reps !== null ? `${item.situp_reps} (${item.situp_score})` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center border-r bg-amber-50/20">
                        {item.shuttlerun_seconds !== null ? `${item.shuttlerun_seconds}s (${item.shuttlerun_score})` : '-'}
                      </td>
                      <td className="py-2 px-3 text-center font-bold border-r bg-emerald-50/30 text-emerald-800">
                        {item.total_final_score !== null ? item.total_final_score : '-'}
                      </td>
                      <td className="py-2 px-3 text-center font-sans font-semibold text-[10px] bg-emerald-50/30">
                        {item.final_predicate || '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-500">
              <div>Sistem Inteligensi Kesamaptaan Jasmani Terpadu dan Adaptif (SIKAPTA AI)</div>
              <button
                onClick={() => setShowRecapModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-semibold"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: LIVE CAM PENILAIAN LARI SATU GELOMBANG (DETEKSI NOMOR DADA) */}
      {showWaveRunLiveModal && selectedEvent && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-sm z-50 flex items-center justify-center p-3 md:p-5">
          <div className="bg-white rounded-2xl max-w-7xl w-full max-h-[94vh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden overscroll-contain">
            {/* Modal Top Header */}
            <div className="bg-slate-900 text-white px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Video className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-white">
                      Live Cam Penilaian Lari Satu Gelombang (Deteksi Nomor Dada)
                    </h3>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                      GELOMBANG {liveRunWave}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    {selectedEvent.name} • Lintasan {selectedEvent.track_length_meters}m • Deteksi otomatis Nomor Dada saat peserta melewati 1 putaran
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Pilih Gelombang */}
                <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-medium">Gelombang:</span>
                  <select
                    value={liveRunWave}
                    disabled={liveRunState?.status === 'in_progress'}
                    onChange={(e) => handleWaveRunChangeWave(Number(e.target.value))}
                    className="bg-transparent text-amber-400 font-bold focus:outline-none"
                  >
                    {Array.from({ length: selectedEvent.total_waves }, (_, i) => i + 1).map((w) => (
                      <option key={w} value={w} className="bg-slate-900 text-white">
                        Gelombang {w}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Pilih Kamera */}
                <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-medium">Kamera:</span>
                  <select
                    value={liveRunCameraId ?? (cameras[0]?.id || '')}
                    disabled={liveRunState?.status === 'in_progress'}
                    onChange={(e) => setLiveRunCameraId(e.target.value ? Number(e.target.value) : undefined)}
                    className="bg-transparent text-white font-semibold focus:outline-none max-w-[170px]"
                  >
                    {cameras.length === 0 ? (
                      <option value="1" className="bg-slate-900 text-white">
                        Webcam Utama (Device 0)
                      </option>
                    ) : (
                      cameras.map((cam) => (
                        <option key={cam.id} value={cam.id} className="bg-slate-900 text-white">
                          {cam.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {/* Pilih Durasi */}
                <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-medium">Waktu:</span>
                  <select
                    value={liveRunDuration}
                    disabled={liveRunState?.status === 'in_progress'}
                    onChange={(e) => setLiveRunDuration(Number(e.target.value))}
                    className="bg-transparent text-white font-semibold focus:outline-none"
                  >
                    <option value={720} className="bg-slate-900 text-white">12 Menit (720s)</option>
                    <option value={60} className="bg-slate-900 text-white">60 Detik (Uji)</option>
                    <option value={0} className="bg-slate-900 text-white">Manual</option>
                  </select>
                </div>

                {/* Pilih Cooldown Anti-Dobel */}
                <div className="flex items-center space-x-1.5 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
                  <span className="text-slate-400 font-medium" title="Jeda minimum antar putaran untuk nomor dada yang sama">Cooldown:</span>
                  <select
                    value={liveRunCooldown}
                    disabled={liveRunState?.status === 'in_progress'}
                    onChange={(e) => setLiveRunCooldown(Number(e.target.value))}
                    className="bg-transparent text-emerald-400 font-bold focus:outline-none"
                  >
                    <option value={5} className="bg-slate-900 text-white">5s (Uji Coba)</option>
                    <option value={15} className="bg-slate-900 text-white">15s</option>
                    <option value={30} className="bg-slate-900 text-white">30s</option>
                    <option value={60} className="bg-slate-900 text-white">60s (Lapangan)</option>
                  </select>
                </div>

                <button
                  onClick={() => {
                    if (waveRunWsRef.current) {
                      waveRunWsRef.current.close();
                      waveRunWsRef.current = null;
                    }
                    setShowWaveRunLiveModal(false);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Modal Main Body: Left = Camera Feed & Detection Log, Right = Live Wave Runners Table */}
            <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-50">
              {/* LEFT COLUMN: Video Stream & Live Crossing Log */}
              <div className="lg:col-span-6 flex flex-col space-y-3">
                {/* Video Container */}
                <div className="bg-slate-900 rounded-2xl overflow-hidden border border-slate-800 shadow-md flex flex-col">
                  {/* Stream Status Bar */}
                  <div className="px-4 py-2 bg-slate-950 flex items-center justify-between text-xs border-b border-slate-800">
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full ${
                          liveRunState?.status === 'in_progress'
                            ? 'bg-emerald-500 animate-pulse'
                            : liveRunState?.status === 'paused'
                            ? 'bg-amber-500'
                            : 'bg-slate-500'
                        }`}
                      />
                      <span className="font-mono font-bold text-slate-200 uppercase">
                        {liveRunState?.status === 'in_progress'
                          ? `LIVE CAM AKTIF • GELOMBANG ${liveRunWave}`
                          : liveRunState?.status === 'paused'
                          ? 'JEDA (PAUSED)'
                          : 'STANDBY / SIAP MULAI'}
                      </span>
                    </div>
                    <div className="flex items-center space-x-3 font-mono text-[11px] text-slate-400">
                      <span>FPS: <strong className="text-white">{liveRunState?.fps ?? 0}</strong></span>
                      <span>
                        Total Putaran:{' '}
                        <strong className="text-emerald-400">
                          {liveRunState?.participants.reduce((acc, r) => acc + r.run_laps, 0) ?? 0}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Camera Canvas */}
                  <div className="relative aspect-video bg-slate-950 flex items-center justify-center overflow-hidden">
                    {liveRunFrame ? (
                      <img
                        src={`data:image/jpeg;base64,${liveRunFrame}`}
                        alt="Live Cam Penilaian Lari Gelombang"
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-6 space-y-2">
                        <Video className="w-12 h-12 text-slate-700 mx-auto" />
                        <div className="text-sm font-bold text-slate-300">
                          Kamera Deteksi Nomor Dada Siap Digunakan
                        </div>
                        <p className="text-xs text-slate-500 max-w-sm mx-auto">
                          Klik tombol <strong>Mulai Live Cam Gelombang {liveRunWave}</strong> di bawah untuk mengaktifkan deteksi nomor dada otomatis setiap kali peserta melewati kamera (1 putaran).
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Timer & Camera Control Bar */}
                  <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center space-x-3">
                      <div className="flex items-center space-x-1.5 text-amber-400 font-mono">
                        <Timer className="w-4 h-4" />
                        <span className="text-lg font-black">
                          {formatSeconds(liveRunState?.elapsed_seconds ?? 0)}
                        </span>
                        {(liveRunState?.target_duration_seconds ?? liveRunDuration) > 0 && (
                          <span className="text-xs text-slate-400">
                            / {formatSeconds(liveRunState?.target_duration_seconds ?? liveRunDuration)}
                          </span>
                        )}
                      </div>
                      {(liveRunState?.target_duration_seconds ?? liveRunDuration) > 0 && (
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-mono text-slate-300">
                          Sisa: {formatSeconds(liveRunState?.remaining_seconds ?? liveRunDuration)}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center space-x-2">
                      {(!liveRunState || liveRunState.status === 'idle' || liveRunState.status === 'completed') ? (
                        <div className="flex items-center space-x-2">
                          {!isWaveConfigSaved && (
                            <span className="hidden sm:inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[11px] font-semibold">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                              <span>Simpan nomor & kaos dulu</span>
                            </span>
                          )}
                          <button
                            disabled={!isWaveConfigSaved || liveRunConfigSaving}
                            onClick={handleStartWaveRunLive}
                            className="flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            title={!isWaveConfigSaved ? "Simpan pengaturan rompi & nomor dada terlebih dahulu di tabel peserta" : "Mulai sesi deteksi lari"}
                          >
                            <Play className="w-4 h-4 fill-current" />
                            <span>Mulai Live Cam Gelombang {liveRunWave}</span>
                          </button>
                        </div>
                      ) : (
                        <>
                          {liveRunState.status === 'in_progress' ? (
                            <button
                              onClick={() => handleControlWaveRun('pause')}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs transition"
                            >
                              <Pause className="w-3.5 h-3.5" />
                              <span>Jeda</span>
                            </button>
                          ) : (
                            <button
                              onClick={() => handleControlWaveRun('resume')}
                              className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition"
                            >
                              <Play className="w-3.5 h-3.5" />
                              <span>Lanjutkan</span>
                            </button>
                          )}
                          <button
                            onClick={() => handleControlWaveRun('stop')}
                            className="flex items-center space-x-1 px-3 py-1.5 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-xs transition"
                          >
                            <Square className="w-3.5 h-3.5" />
                            <span>Hentikan Kamera</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Live Lap Crossing Log */}
                <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-xs flex-1 flex flex-col min-h-[160px] max-h-[220px]">
                  <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-100">
                    <span className="text-xs font-bold text-slate-800 flex items-center space-x-1.5">
                      <Activity className="w-4 h-4 text-emerald-600" />
                      <span>Log Deteksi Nomor Dada (Lintasan Putaran)</span>
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {liveRunState?.lap_crossing_log?.length || 0} kejadian tercatat
                    </span>
                  </div>
                  <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-xs">
                    {!liveRunState?.lap_crossing_log || liveRunState.lap_crossing_log.length === 0 ? (
                      <div className="text-center py-6 text-slate-400 text-[11px]">
                        Belum ada nomor dada yang melintasi kamera pada sesi ini.
                      </div>
                    ) : (
                      liveRunState.lap_crossing_log.map((log, i) => (
                        <div
                          key={`${log.participant_id}-${log.lap_number}-${i}`}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-emerald-50/70 border border-emerald-200/70"
                        >
                          <div className="flex items-center space-x-2">
                            <span className="px-2 py-0.5 rounded bg-emerald-600 text-white font-mono font-bold text-[11px]">
                              No. Dada {log.chest_number}
                            </span>
                            <span className="font-semibold text-slate-800">{log.full_name}</span>
                            {log.vest_color && log.vest_color !== 'Netral' && (
                              <span
                                className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border"
                                style={{
                                  backgroundColor: `${log.vest_hex || '#94a3b8'}20`,
                                  color: log.vest_hex || '#475569',
                                  borderColor: `${log.vest_hex || '#94a3b8'}40`,
                                }}
                              >
                                <span
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: log.vest_hex || '#94a3b8' }}
                                />
                                <span>Rompi {log.vest_color}</span>
                              </span>
                            )}
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-white text-slate-600 border border-slate-200">
                              {log.source === 'camera_ai' ? '🎥 Kamera AI' : '✍️ Manual'}
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 font-mono text-[11px]">
                            <span className="font-bold text-emerald-700">
                              Putaran ke-{log.lap_number} ({log.total_distance_meters}m)
                            </span>
                            <span className="text-slate-400">[{log.time_str}]</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* RIGHT COLUMN: Wave Participants Real-time Lap & Extra Meters Table */}
              <div className="lg:col-span-6 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      Daftar Peserta Gelombang {liveRunWave} ({liveRunState?.participants.length || 0} Orang)
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      {liveRunState?.status === 'in_progress' || liveRunState?.status === 'paused'
                        ? 'Putaran bertambah otomatis saat Nomor Dada terlihat di kamera. Anda juga dapat menyesuaikan putaran & mengisi lebihan meter.'
                        : 'Tentukan No. Dada & Warna Kaos setiap peserta di bawah, lalu klik "Simpan Pengaturan Rompi" sebelum memulai tes.'}
                    </p>
                  </div>
                  {(!liveRunState || liveRunState.status === 'idle' || liveRunState.status === 'completed') && (
                    <button
                      type="button"
                      disabled={liveRunConfigSaving}
                      onClick={handleSaveWaveParticipantConfigs}
                      className={`flex items-center space-x-1.5 px-3.5 py-2 rounded-xl font-bold text-xs shadow-sm transition ${
                        !isWaveConfigSaved
                          ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 animate-pulse ring-2 ring-amber-400'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <Save className="w-4 h-4" />
                      <span>
                        {liveRunConfigSaving
                          ? 'Menyimpan...'
                          : !isWaveConfigSaved
                          ? 'Simpan Pengaturan Rompi (Wajib)'
                          : 'Simpan Ulang Pengaturan Rompi'}
                      </span>
                    </button>
                  )}
                </div>

                {configSaveSuccessBanner && (
                  <div className="mx-4 mt-3 px-3.5 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{configSaveSuccessBanner}</span>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0 border-b border-slate-200">
                      <tr>
                        <th className="py-2.5 px-3 text-center">No Dada</th>
                        <th className="py-2.5 px-3">Nama Peserta</th>
                        <th className="py-2.5 px-3 text-center">Warna Rompi / Kaos</th>
                        <th className="py-2.5 px-3 text-center">Status Kamera</th>
                        <th className="py-2.5 px-3 text-center">Putaran Lari</th>
                        <th className="py-2.5 px-3 text-center">Lebihan (+m)</th>
                        <th className="py-2.5 px-3 text-center">Total Jarak</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!liveRunState?.participants || liveRunState.participants.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Tidak ada peserta pada Gelombang {liveRunWave}.
                          </td>
                        </tr>
                      ) : (
                        liveRunState.participants.map((r: WaveRunnerLiveItem) => (
                          <tr
                            key={r.participant_id}
                            className={`transition ${
                              r.recently_detected
                                ? 'bg-emerald-50/90'
                                : r.in_cooldown
                                ? 'bg-amber-50/40'
                                : 'hover:bg-slate-50'
                            }`}
                          >
                            {/* Nomor Dada */}
                            <td className="py-2.5 px-3 text-center">
                              {(!liveRunState || liveRunState.status === 'idle' || liveRunState.status === 'completed') ? (
                                <input
                                  type="text"
                                  maxLength={6}
                                  value={waveParticipantConfigs[r.participant_id]?.chest_number ?? r.chest_number}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    setIsWaveConfigSaved(false);
                                    setWaveParticipantConfigs((prev) => ({
                                      ...prev,
                                      [r.participant_id]: {
                                        chest_number: val,
                                        vest_color: prev[r.participant_id]?.vest_color || r.assigned_vest_color || r.vest_color || 'Merah',
                                      },
                                    }));
                                  }}
                                  className="w-16 px-2 py-1 text-center font-mono font-black text-sm bg-slate-900 text-amber-400 rounded-lg border border-slate-700 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                                  placeholder="01"
                                  title="Nomor dada pelari"
                                />
                              ) : (
                                <span
                                  className={`inline-block px-2.5 py-1 rounded-lg font-mono font-black text-sm ${
                                    r.recently_detected
                                      ? 'bg-emerald-600 text-white shadow-xs'
                                      : 'bg-slate-900 text-amber-400'
                                  }`}
                                >
                                  {r.chest_number}
                                </span>
                              )}
                            </td>

                            {/* Nama & NRP */}
                            <td className="py-2.5 px-3">
                              <div className="font-bold text-slate-900">{r.full_name}</div>
                              <div className="text-[10px] font-mono text-slate-500">
                                {r.nrp} • {r.gender === 'P' ? 'Wanita' : 'Pria'}
                              </div>
                            </td>

                            {/* Warna Rompi / Kaos */}
                            <td className="py-2.5 px-3 text-center">
                              {(!liveRunState || liveRunState.status === 'idle' || liveRunState.status === 'completed') ? (
                                <div className="inline-flex items-center space-x-1.5 bg-slate-100 px-2 py-1 rounded-xl border border-slate-200">
                                  <span
                                    className="w-3 h-3 rounded-full shrink-0 shadow-xs border"
                                    style={{
                                      backgroundColor:
                                        VEST_COLORS.find(
                                          (c) =>
                                            c.name ===
                                            (waveParticipantConfigs[r.participant_id]?.vest_color ||
                                              r.assigned_vest_color ||
                                              r.vest_color ||
                                              'Merah')
                                        )?.hex || '#EF4444',
                                      borderColor: '#94A3B8',
                                    }}
                                  />
                                  <select
                                    value={
                                      waveParticipantConfigs[r.participant_id]?.vest_color ||
                                      r.assigned_vest_color ||
                                      r.vest_color ||
                                      'Merah'
                                    }
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      setIsWaveConfigSaved(false);
                                      setWaveParticipantConfigs((prev) => ({
                                        ...prev,
                                        [r.participant_id]: {
                                          chest_number: prev[r.participant_id]?.chest_number || r.chest_number || '',
                                          vest_color: val,
                                        },
                                      }));
                                    }}
                                    className="bg-transparent font-bold text-xs text-slate-800 focus:outline-none cursor-pointer"
                                  >
                                    {VEST_COLORS.map((col) => (
                                      <option key={col.name} value={col.name}>
                                        {col.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              ) : (
                                <div className="flex flex-col items-center space-y-0.5">
                                  <span
                                    className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border shadow-2xs"
                                    style={{
                                      backgroundColor: `${
                                        VEST_COLORS.find((c) => c.name === (r.assigned_vest_color || r.vest_color))?.hex ||
                                        r.vest_hex ||
                                        '#94a3b8'
                                      }22`,
                                      color:
                                        VEST_COLORS.find((c) => c.name === (r.assigned_vest_color || r.vest_color))?.hex ||
                                        r.vest_hex ||
                                        '#334155',
                                      borderColor: `${
                                        VEST_COLORS.find((c) => c.name === (r.assigned_vest_color || r.vest_color))?.hex ||
                                        r.vest_hex ||
                                        '#94a3b8'
                                      }60`,
                                    }}
                                  >
                                    <span
                                      className="w-2 h-2 rounded-full shadow-xs"
                                      style={{
                                        backgroundColor:
                                          VEST_COLORS.find((c) => c.name === (r.assigned_vest_color || r.vest_color))?.hex ||
                                          r.vest_hex ||
                                          '#94a3b8',
                                      }}
                                    />
                                    <span>{r.assigned_vest_color || r.vest_color || 'Netral'}</span>
                                  </span>
                                  {r.detected_vest_color && (
                                    <span className="text-[9px] font-semibold text-emerald-600">
                                      Kamera: {r.detected_vest_color}
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>

                            {/* Status Deteksi / Cooldown */}
                            <td className="py-2.5 px-3 text-center">
                              {r.recently_detected ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 font-bold text-[10px]">
                                  ✓ Terdeteksi
                                </span>
                              ) : r.in_cooldown ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono font-semibold text-[10px]">
                                  Cooldown {r.cooldown_remaining_seconds}s
                                </span>
                              ) : (
                                <span className="text-[10px] text-slate-400">Siap Deteksi</span>
                              )}
                            </td>

                            {/* Putaran Lari (+/-) */}
                            <td className="py-2.5 px-3 text-center">
                              <div className="inline-flex items-center space-x-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
                                <button
                                  type="button"
                                  onClick={() => handleControlWaveRun('adjust_lap', r.participant_id, -1)}
                                  className="w-6 h-6 rounded-lg bg-white hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center shadow-2xs"
                                  title="Kurangi 1 Putaran"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="w-8 text-center font-mono font-black text-sm text-slate-900">
                                  {r.run_laps}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleControlWaveRun('adjust_lap', r.participant_id, 1)}
                                  className="w-6 h-6 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold flex items-center justify-center shadow-2xs"
                                  title="Tambah 1 Putaran"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </td>

                            {/* Input Lebihan Meter */}
                            <td className="py-2.5 px-3 text-center">
                              <input
                                type="number"
                                min="0"
                                max="1000"
                                step="5"
                                value={r.run_extra_meters}
                                onChange={(e) =>
                                  handleControlWaveRun(
                                    'set_extra_meters',
                                    r.participant_id,
                                    undefined,
                                    Number(e.target.value)
                                  )
                                }
                                className="w-16 px-2 py-1 text-center font-mono font-bold text-xs rounded-lg border border-slate-300 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                              />
                            </td>

                            {/* Total Jarak */}
                            <td className="py-2.5 px-3 text-center">
                              <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg">
                                {r.run_total_distance_meters} m
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Modal Footer: Approve & Save Wave Run Results */}
                <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="text-[11px] text-slate-500">
                    Pastikan jumlah putaran & lebihan meter sudah sesuai sebelum menyimpan ke database.
                  </div>
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (waveRunWsRef.current) {
                          waveRunWsRef.current.close();
                          waveRunWsRef.current = null;
                        }
                        setShowWaveRunLiveModal(false);
                      }}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 hover:bg-white font-semibold text-xs"
                    >
                      Tutup
                    </button>
                    <button
                      type="button"
                      disabled={liveRunSaving}
                      onClick={handleSaveWaveRunToDb}
                      className="flex items-center space-x-1.5 px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {liveRunSaving
                          ? 'Menyimpan...'
                          : `Setujui & Simpan Hasil Lari Gelombang ${liveRunWave}`}
                      </span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

