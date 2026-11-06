import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Play,
  Pause,
  Square,
  Activity,
  CheckCircle2,
  XCircle,
  Video,
  FileDown,
  User,
  Users,
  CalendarDays,
  Sliders,
  ShieldAlert,
  Clock,
  Gauge,
  UploadCloud,
  FileVideo,
  Sparkles,
  RefreshCw,
  AlertCircle,
  Film,
  Printer,
  Save,
  UserCheck,
  Timer,
  Camera
} from 'lucide-react';
import { api } from '../../services/api';
import { LiveAssessmentStreamData, AssessmentSession, Participant } from '../../types';
import { PrintableReportModal } from '../../components/PrintableReportModal';

interface AssessmentParticipantOption extends Participant {
  chest_number?: string;
  wave_number?: number;
}

export const LiveAssessmentPage: React.FC = () => {
  const queryClient = useQueryClient();
  const location = useLocation();

  // Input Source Mode: 'camera' | 'upload'
  const [inputSource, setInputSource] = useState<'camera' | 'upload'>('camera');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isProcessingVideo, setIsProcessingVideo] = useState(false);
  const [videoProcessResult, setVideoProcessResult] = useState<any | null>(null);
  const [videoProcessError, setVideoProcessError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const pendingTargetParticipantIdRef = useRef<number | null>(
    location.state?.participantId ? Number(location.state.participantId) : null
  );

  // Setup state
  const [selectedEventId, setSelectedEventId] = useState<number | ''>(() => {
    return location.state?.eventId ? Number(location.state.eventId) : '';
  });
  const [selectedParticipantId, setSelectedParticipantId] = useState<number | ''>(() => {
    return location.state?.participantId ? Number(location.state.participantId) : '';
  });
  const [selectedCameraId, setSelectedCameraId] = useState<number | ''>('');
  const [selectedExercise, setSelectedExercise] = useState<'pushup' | 'pullup' | 'situp' | 'shuttlerun'>('pushup');
  const [selectedModel, setSelectedModel] = useState<'mediapipe' | 'yolo'>('mediapipe');
  const [selectedGender, setSelectedGender] = useState<'L' | 'P'>('L');
  const [selectedTolerance, setSelectedTolerance] = useState<number>(5.0);
  const [examinerNotes, setExaminerNotes] = useState('');

  // Target time limit state (default 60 seconds = 1 minute military/police standard)
  const [targetDuration, setTargetDuration] = useState<number>(60);
  const [customDurationInput, setCustomDurationInput] = useState<string>('60');
  const [wasAutoStopped, setWasAutoStopped] = useState(false);

  // Active session state
  const [activeSession, setActiveSession] = useState<AssessmentSession | null>(null);
  const [streamData, setStreamData] = useState<LiveAssessmentStreamData | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const [completedSession, setCompletedSession] = useState<AssessmentSession | null>(null);

  // Live Assessment Approval & Correction State
  const [editVerifiedReps, setEditVerifiedReps] = useState<number>(0);
  const [editRejectedReps, setEditRejectedReps] = useState<number>(0);
  const [isApprovingLive, setIsApprovingLive] = useState<boolean>(false);
  const [isRejectingLive, setIsRejectingLive] = useState<boolean>(false);
  const [liveApprovedSuccess, setLiveApprovedSuccess] = useState<boolean>(false);

  // Video Assessment Approval & Correction State
  const [videoEditVerifiedReps, setVideoEditVerifiedReps] = useState<number>(0);
  const [videoEditRejectedReps, setVideoEditRejectedReps] = useState<number>(0);
  const [videoEditNotes, setVideoEditNotes] = useState<string>('');
  const [isVideoApproving, setIsVideoApproving] = useState<boolean>(false);
  const [isVideoRejecting, setIsVideoRejecting] = useState<boolean>(false);
  const [videoApprovalSuccess, setVideoApprovalSuccess] = useState<boolean>(false);

  // Printable Modal State
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printSession, setPrintSession] = useState<AssessmentSession | null>(null);

  // Participant assignment state in completion modal
  const [editNrp, setEditNrp] = useState('');
  const [editFullName, setEditFullName] = useState('');
  const [editGender, setEditGender] = useState<'L' | 'P'>('L');
  const [editOrg, setEditOrg] = useState('');
  const [editCategory, setEditCategory] = useState('Umum');
  const [editNotes, setEditNotes] = useState('');
  const [isSavingParticipant, setIsSavingParticipant] = useState(false);
  const [participantSaveSuccess, setParticipantSaveSuccess] = useState(false);

  // Camera Detection Preview State (before starting session)
  const [isPreviewActive, setIsPreviewActive] = useState<boolean>(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const previewWsRef = useRef<WebSocket | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const timerRef = useRef<any>(null);
  const isStoppingRef = useRef<boolean>(false);

  // Queries
  const { data: participants = [] } = useQuery({
    queryKey: ['participants'],
    queryFn: () => api.getParticipants({ limit: 100 }),
  });

  const { data: cameras = [] } = useQuery({
    queryKey: ['cameras'],
    queryFn: api.getCameras,
  });

  const { data: eventsList = [] } = useQuery({
    queryKey: ['events'],
    queryFn: () => api.getEvents(),
  });

  // Query participants enrolled in selected event
  const { data: eventParticipants = [], isLoading: isLoadingEventParticipants } = useQuery({
    queryKey: ['eventParticipants', selectedEventId],
    queryFn: () => (selectedEventId ? api.getEventParticipants(Number(selectedEventId)) : Promise.resolve([])),
    enabled: !!selectedEventId,
  });

  // Filtered participant list based on selected Samapta event
  const activeParticipantsList = React.useMemo<AssessmentParticipantOption[]>(() => {
    if (!selectedEventId) {
      return participants as AssessmentParticipantOption[];
    }
    return eventParticipants
      .map((ep) => {
        if (!ep.participant) return null;
        return {
          ...ep.participant,
          chest_number: ep.chest_number,
          wave_number: ep.wave_number,
        };
      })
      .filter(Boolean) as AssessmentParticipantOption[];
  }, [selectedEventId, eventParticipants, participants]);

  // Handle location state navigation from Events Management page
  useEffect(() => {
    if (location.state?.eventId) {
      setSelectedEventId(Number(location.state.eventId));
    }
    if (location.state?.participantId) {
      const pid = Number(location.state.participantId);
      pendingTargetParticipantIdRef.current = pid;
      setSelectedParticipantId(pid);
    }
  }, [location.state]);

  // Automatically select participant from activeParticipantsList and sync gender
  useEffect(() => {
    // If we are currently loading participants for an event, do not clear or reassign yet
    if (selectedEventId && isLoadingEventParticipants) {
      return;
    }

    if (activeParticipantsList.length > 0) {
      const targetId = pendingTargetParticipantIdRef.current ?? selectedParticipantId;
      const matched = activeParticipantsList.find((p) => p.id === Number(targetId));

      if (matched) {
        setSelectedParticipantId(matched.id);
        if (matched.gender === 'P' || matched.gender === 'L') {
          setSelectedGender(matched.gender as 'L' | 'P');
        }
        pendingTargetParticipantIdRef.current = null;
      } else {
        // Fallback to first participant in list
        const first = activeParticipantsList[0];
        setSelectedParticipantId(first.id);
        if (first.gender === 'P' || first.gender === 'L') {
          setSelectedGender(first.gender as 'L' | 'P');
        }
      }
    } else if (selectedEventId && !isLoadingEventParticipants && activeParticipantsList.length === 0) {
      setSelectedParticipantId('');
    }
  }, [selectedEventId, isLoadingEventParticipants, activeParticipantsList]);

  // Sync gender whenever selected participant changes
  useEffect(() => {
    if (selectedParticipantId) {
      const p = activeParticipantsList.find((item) => item.id === Number(selectedParticipantId))
        || participants.find((item) => item.id === Number(selectedParticipantId));
      if (p && (p.gender === 'P' || p.gender === 'L')) {
        setSelectedGender(p.gender as 'L' | 'P');
      }
    }
  }, [selectedParticipantId, activeParticipantsList, participants]);

  useEffect(() => {
    if (cameras.length > 0 && selectedCameraId === '') {
      setSelectedCameraId(cameras[0].id);
    }
  }, [cameras]);

  // Timer effect with auto-stop on target duration reached
  useEffect(() => {
    if (activeSession && activeSession.status === 'in_progress') {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => {
          const next = prev + 1;
          if (targetDuration > 0 && next >= targetDuration) {
            if (timerRef.current) {
              clearInterval(timerRef.current);
              timerRef.current = null;
            }
            setTimeout(() => {
              handleStop(true);
            }, 0);
          }
          return next;
        });
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [activeSession?.status, targetDuration]);

  // Camera Detection Preview WebSocket Effect (Active prior to starting official session)
  useEffect(() => {
    if (!isPreviewActive || activeSession) {
      if (previewWsRef.current) {
        previewWsRef.current.close();
        previewWsRef.current = null;
      }
      return;
    }

    const camId = selectedCameraId || (cameras.length > 0 ? cameras[0].id : 1);
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/cameras/${camId}/preview?exercise_type=${selectedExercise}&model_name=${selectedModel}&gender=${selectedGender}&tolerance_deg=${selectedTolerance}`;

    const ws = new WebSocket(wsUrl);
    previewWsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStreamData(data);
        if (data.frame) {
          setPreviewError(null);
        }
        if (data.error) {
          setPreviewError(data.error);
        }
      } catch (err) {
        console.error('Error parsing camera preview WS message', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('Camera preview WS error:', err);
      setPreviewError('Koneksi pratinjau kamera terkendala. Pastikan backend SIKAPTA AI aktif.');
    };

    ws.onclose = (event) => {
      console.log('Camera preview WS closed', event);
      if (isPreviewActive && !event.wasClean) {
        setPreviewError('Koneksi pratinjau kamera terputus. Silakan klik Aktifkan Kamera kembali.');
      }
    };

    return () => {
      ws.close();
    };
  }, [isPreviewActive, activeSession?.id, selectedCameraId, selectedExercise, selectedModel, selectedGender, selectedTolerance, cameras.length]);

  // WebSocket Connection Effect
  useEffect(() => {
    if (!activeSession) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws/assessments/${activeSession.id}/live`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setStreamData(data);

        // Auto-stop for Shuttle Run when 3 laps (6 crossings) are reached
        if (
          selectedExercise === 'shuttlerun' &&
          (data.is_completed || data.phase === 'SELESAI' || data.verified_reps >= 3) &&
          !isStoppingRef.current
        ) {
          if (data.final_time_seconds || data.current_angle) {
            setElapsedSeconds(Math.round(data.final_time_seconds || data.current_angle));
          }
          handleStop(true);
        }
      } catch (err) {
        console.error('Error parsing live assessment WS message', err);
      }
    };

    ws.onerror = (err) => {
      console.warn('Live assessment WS error:', err);
    };

    ws.onclose = () => {
      console.log('Live assessment WS closed');
    };

    return () => {
      ws.close();
    };
  }, [activeSession?.id]);

  // Handlers
  const handleStart = async () => {
    if (!selectedParticipantId) {
      alert('Pilih peserta terlebih dahulu');
      return;
    }
    // Turn off camera preview before starting active session
    if (isPreviewActive) {
      setIsPreviewActive(false);
      if (previewWsRef.current) {
        previewWsRef.current.close();
        previewWsRef.current = null;
      }
    }
    isStoppingRef.current = false;
    setWasAutoStopped(false);
    setIsStarting(true);
    try {
      const session = await api.createAssessment({
        participant_id: Number(selectedParticipantId),
        event_id: selectedEventId ? Number(selectedEventId) : undefined,
        camera_id: selectedCameraId ? Number(selectedCameraId) : undefined,
        exercise_type: selectedExercise,
        model_used: selectedModel,
        gender: selectedGender,
        tolerance_deg: Number(selectedTolerance),
        examiner_notes: examinerNotes,
      });
      setActiveSession(session);
      setElapsedSeconds(0);
      setStreamData(null);
    } catch (err: any) {
      alert(`Gagal memulai sesi: ${err.message}`);
    } finally {
      setIsStarting(false);
    }
  };

  const handlePause = async () => {
    if (!activeSession) return;
    try {
      const updated = await api.controlAssessment(activeSession.id, 'pause');
      setActiveSession(updated);
    } catch (err: any) {
      alert(`Gagal menjeda sesi: ${err.message}`);
    }
  };

  const handleResume = async () => {
    if (!activeSession) return;
    try {
      const updated = await api.controlAssessment(activeSession.id, 'resume');
      setActiveSession(updated);
    } catch (err: any) {
      alert(`Gagal melanjutkan sesi: ${err.message}`);
    }
  };

  const handleStop = async (auto = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (!activeSession || isStoppingRef.current) return;
    isStoppingRef.current = true;
    setWasAutoStopped(auto);
    try {
      const snapshotVerified = streamData?.verified_reps ?? activeSession.verified_reps ?? 0;
      const snapshotRejected = streamData?.rejected_reps ?? activeSession.rejected_reps ?? 0;
      const snapshotDetected = streamData?.detected_reps ?? activeSession.detected_reps ?? (snapshotVerified + snapshotRejected);
      const isShuttle = selectedExercise === 'shuttlerun';
      const measuredTime = (streamData?.final_time_seconds || streamData?.current_angle)
        ? Math.max(1, Math.round(streamData.final_time_seconds || streamData.current_angle))
        : elapsedSeconds;
      const snapshotDuration = isShuttle
        ? (measuredTime > 0 ? measuredTime : (activeSession.duration_seconds || 0))
        : (elapsedSeconds > 0 ? elapsedSeconds : (activeSession.duration_seconds || 0));

      const updated = await api.controlAssessment(activeSession.id, 'stop', examinerNotes, {
        duration_seconds: snapshotDuration,
        verified_reps: snapshotVerified,
        rejected_reps: snapshotRejected,
        detected_reps: snapshotDetected,
      });
      
      const mergedSession: AssessmentSession = {
        ...updated,
        verified_reps: Math.max(updated.verified_reps ?? 0, snapshotVerified),
        rejected_reps: Math.max(updated.rejected_reps ?? 0, snapshotRejected),
        detected_reps: Math.max(updated.detected_reps ?? 0, snapshotDetected),
        duration_seconds: Math.max(updated.duration_seconds ?? 0, snapshotDuration),
      };

      setCompletedSession(mergedSession);
      setEditVerifiedReps(mergedSession.verified_reps ?? 0);
      setEditRejectedReps(mergedSession.rejected_reps ?? 0);
      setLiveApprovedSuccess(mergedSession.status === 'completed');

      // Populate participant form fields for review / update
      const part = mergedSession.participant;
      setEditNrp(part?.participant_number || '');
      setEditFullName(part?.full_name || '');
      setEditGender((mergedSession.gender as 'L' | 'P') || (part?.gender as 'L' | 'P') || selectedGender);
      setEditOrg(part?.organization || '');
      setEditCategory(part?.category || 'Umum');
      setEditNotes(mergedSession.examiner_notes || examinerNotes || '');
      setParticipantSaveSuccess(false);

      setShowSummaryModal(true);
      setActiveSession(null);
      setStreamData(null);
    } catch (err: any) {
      alert(`Gagal menghentikan sesi: ${err.message}`);
    } finally {
      isStoppingRef.current = false;
    }
  };

  const handleApproveLiveSession = async () => {
    if (!completedSession) return;
    setIsApprovingLive(true);
    try {
      const approved = await api.approveAssessment(completedSession.id, {
        verified_reps: editVerifiedReps,
        rejected_reps: editRejectedReps,
        examiner_notes: editNotes.trim() || undefined,
        participant_id: completedSession.participant_id || undefined,
      });
      setCompletedSession(approved);
      setLiveApprovedSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['reportSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historySessions'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['eventRecap'] });
    } catch (err: any) {
      alert(`Gagal menyetujui sesi: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsApprovingLive(false);
    }
  };

  const handleRejectLiveSession = async () => {
    if (!completedSession) return;
    const confirmReject = window.confirm(
      'Apakah Anda yakin ingin menolak & membatalkan sesi pengujian ini?\nData pengujian ini TIDAK akan dicatat ke database rekapitulasi.'
    );
    if (!confirmReject) return;

    setIsRejectingLive(true);
    try {
      await api.rejectAssessment(completedSession.id, editNotes.trim() || 'Ditolak penguji');
      setShowSummaryModal(false);
      setCompletedSession(null);
      setLiveApprovedSuccess(false);
      alert('Sesi pengujian telah ditolak dan dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['reportSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historySessions'] });
    } catch (err: any) {
      alert(`Gagal membatalkan sesi: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsRejectingLive(false);
    }
  };

  const handleSaveParticipant = async () => {
    if (!completedSession) return;
    if (!editFullName.trim()) {
      alert('Masukkan nama lengkap pelaku');
      return;
    }
    setIsSavingParticipant(true);
    setParticipantSaveSuccess(false);
    try {
      const updated = await api.assignParticipantToSession(completedSession.id, {
        participant_number: editNrp.trim() || undefined,
        full_name: editFullName.trim(),
        gender: editGender,
        organization: editOrg.trim() || undefined,
        category: editCategory.trim() || undefined,
        examiner_notes: editNotes.trim() || undefined,
      });
      setCompletedSession(updated);
      setParticipantSaveSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['reportSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historySessions'] });
    } catch (err: any) {
      alert(`Gagal menyimpan data pelaku: ${err.message}`);
    } finally {
      setIsSavingParticipant(false);
    }
  };

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleVideoUploadSubmit = async () => {
    if (!uploadedFile) {
      alert('Pilih file video terlebih dahulu');
      return;
    }
    if (!selectedParticipantId) {
      alert('Pilih peserta uji terlebih dahulu');
      return;
    }

    setIsProcessingVideo(true);
    setVideoProcessError(null);
    setVideoProcessResult(null);
    setVideoApprovalSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      formData.append('participant_id', String(selectedParticipantId));
      formData.append('exercise_type', selectedExercise);
      formData.append('model_used', selectedModel);
      formData.append('gender', selectedGender);
      formData.append('tolerance_deg', String(selectedTolerance));
      if (selectedEventId) {
        formData.append('event_id', String(selectedEventId));
      }
      if (examinerNotes) {
        formData.append('examiner_notes', examinerNotes);
      }

      const res = await api.uploadVideoAssessment(formData);
      setVideoProcessResult(res);
      setVideoEditVerifiedReps(res.verified_reps ?? 0);
      setVideoEditRejectedReps(res.rejected_reps ?? 0);
      setVideoEditNotes(examinerNotes || '');
      setVideoApprovalSuccess(res.status === 'completed');
    } catch (err: any) {
      setVideoProcessError(err.message || 'Gagal memproses video');
    } finally {
      setIsProcessingVideo(false);
    }
  };

  const handleApproveVideoSession = async () => {
    if (!videoProcessResult) return;
    setIsVideoApproving(true);
    try {
      const approved = await api.approveAssessment(videoProcessResult.session_id, {
        verified_reps: videoEditVerifiedReps,
        rejected_reps: videoEditRejectedReps,
        examiner_notes: videoEditNotes.trim() || undefined,
        participant_id: videoProcessResult.participant_id || (selectedParticipantId ? Number(selectedParticipantId) : undefined),
      });
      setVideoProcessResult({
        ...videoProcessResult,
        status: 'completed',
        verified_reps: approved.verified_reps,
        rejected_reps: approved.rejected_reps,
        detected_reps: approved.detected_reps,
        examiner_notes: approved.examiner_notes,
      });
      setVideoApprovalSuccess(true);
      queryClient.invalidateQueries({ queryKey: ['participants'] });
      queryClient.invalidateQueries({ queryKey: ['reportSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historySessions'] });
      queryClient.invalidateQueries({ queryKey: ['events'] });
      queryClient.invalidateQueries({ queryKey: ['eventRecap'] });
    } catch (err: any) {
      alert(`Gagal menyetujui hasil analisis video: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsVideoApproving(false);
    }
  };

  const handleRejectVideoSession = async () => {
    if (!videoProcessResult) return;
    const confirmReject = window.confirm(
      'Apakah Anda yakin ingin menolak & membatalkan hasil analisis video ini?\nData TIDAK akan dicatat ke database rekapitulasi.'
    );
    if (!confirmReject) return;

    setIsVideoRejecting(true);
    try {
      await api.rejectAssessment(videoProcessResult.session_id, videoEditNotes.trim() || 'Ditolak penguji');
      setVideoProcessResult(null);
      setUploadedFile(null);
      setVideoApprovalSuccess(false);
      alert('Hasil analisis video berhasil ditolak dan dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['reportSessions'] });
      queryClient.invalidateQueries({ queryKey: ['historySessions'] });
    } catch (err: any) {
      alert(`Gagal membatalkan hasil video: ${err.message || 'Terjadi kesalahan'}`);
    } finally {
      setIsVideoRejecting(false);
    }
  };

  const selectedParticipant =
    activeParticipantsList.find((p) => p.id === Number(selectedParticipantId)) ||
    participants.find((p) => p.id === Number(selectedParticipantId));

  return (
    <div className="space-y-6">
      {/* Input Source Selector Tab */}
      <div className="flex items-center space-x-2 bg-slate-100 p-1.5 rounded-xl w-fit border border-slate-200">
        <button
          type="button"
          disabled={!!activeSession || isProcessingVideo}
          onClick={() => setInputSource('camera')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            inputSource === 'camera'
              ? 'bg-slate-900 text-amber-400 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 disabled:opacity-50'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Kamera Langsung (Webcam / RTSP)</span>
        </button>

        <button
          type="button"
          disabled={!!activeSession || isProcessingVideo}
          onClick={() => setInputSource('upload')}
          className={`flex items-center space-x-2 px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            inputSource === 'upload'
              ? 'bg-slate-900 text-amber-400 shadow-xs'
              : 'text-slate-600 hover:text-slate-900 disabled:opacity-50'
          }`}
        >
          <UploadCloud className="w-4 h-4" />
          <span>Unggah File Video (MP4 / AVI / MOV)</span>
        </button>
      </div>

      {/* Top Configuration Bar */}
      <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-4">
        {/* Optional Linked Samapta Event Banner / Selector */}
        {eventsList.length > 0 && (
          <div className="flex items-center space-x-2 bg-amber-50/70 border border-amber-200/80 px-3.5 py-2 rounded-xl text-xs text-amber-900">
            <CalendarDays className="w-4 h-4 text-amber-600 shrink-0" />
            <span className="font-semibold shrink-0">Kegiatan Samapta:</span>
            <select
              disabled={!!activeSession}
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value ? Number(e.target.value) : '')}
              className="bg-white border border-amber-300 rounded-lg px-2.5 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-amber-500 max-w-sm"
            >
              <option value="">-- Tanpa Tautan Kegiatan (Uji Mandiri) --</option>
              {eventsList.map((evt) => (
                <option key={evt.id} value={evt.id}>
                  {evt.event_code} - {evt.name} ({evt.location})
                </option>
              ))}
            </select>
            {selectedEventId && (
              <span className="text-[11px] text-amber-700 italic">
                * Hasil sesi ini akan otomatis dicatat ke dalam rekap kegiatan.
              </span>
            )}
          </div>
        )}

        {/* Row 1: Primary Selection (Peserta, Gerakan, Standar Gender, Toleransi) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          {/* Peserta Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
              <span>Pilih Peserta Uji</span>
              {selectedParticipant && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${selectedParticipant.gender === 'P' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                  {selectedParticipant.gender === 'P' ? 'Wanita (P)' : 'Pria (L)'}
                </span>
              )}
            </label>
            <select
              disabled={!!activeSession}
              value={selectedParticipantId}
              onChange={(e) => {
                const newId = e.target.value ? Number(e.target.value) : '';
                setSelectedParticipantId(newId);
                if (newId) {
                  const matched = activeParticipantsList.find((p) => p.id === newId) || participants.find((p) => p.id === newId);
                  if (matched && (matched.gender === 'P' || matched.gender === 'L')) {
                    setSelectedGender(matched.gender as 'L' | 'P');
                  }
                }
              }}
              className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
            >
              <option value="">
                {selectedEventId && activeParticipantsList.length === 0
                  ? '-- Belum ada peserta terdaftar di kegiatan ini --'
                  : selectedEventId
                  ? `-- Pilih Peserta Kegiatan (${activeParticipantsList.length} Peserta) --`
                  : '-- Pilih Peserta (Semua) --'}
              </option>
              {activeParticipantsList.map((p) => {
                const badgeInfo = p.chest_number
                  ? ` [No. Dada: ${p.chest_number}${p.wave_number ? ` | Gel: ${p.wave_number}` : ''}]`
                  : '';
                return (
                  <option key={p.id} value={p.id}>
                    {p.participant_number} - {p.full_name} ({p.gender === 'P' ? 'Wanita' : 'Pria'}){badgeInfo}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Gerakan Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Jenis Gerakan</label>
            <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
              {(['pushup', 'pullup', 'situp', 'shuttlerun'] as const).map((ex) => (
                <button
                  key={ex}
                  type="button"
                  disabled={!!activeSession}
                  onClick={() => setSelectedExercise(ex)}
                  className={`py-1.5 text-xs font-bold rounded-md capitalize transition-colors ${
                    selectedExercise === ex
                      ? 'bg-slate-900 text-amber-400 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
                  }`}
                >
                  {ex === 'shuttlerun' ? 'Shuttle' : ex}
                </button>
              ))}
            </div>
          </div>

          {/* Opsi Gerakan Pria / Wanita */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center space-x-1">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              <span>Standar Gerakan</span>
            </label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                disabled={!!activeSession}
                onClick={() => setSelectedGender('L')}
                className={`py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center space-x-1 ${
                  selectedGender === 'L'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
                }`}
              >
                <span>Pria (L)</span>
              </button>
              <button
                type="button"
                disabled={!!activeSession}
                onClick={() => setSelectedGender('P')}
                className={`py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center space-x-1 ${
                  selectedGender === 'P'
                    ? 'bg-pink-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
                }`}
              >
                <span>Wanita (P)</span>
              </button>
            </div>
          </div>

          {/* Toleransi Deteksi Gerakan */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <Sliders className="w-3.5 h-3.5 text-slate-500" />
                <span>Toleransi Sudut</span>
              </label>
              <span className="text-xs font-black text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                ±{selectedTolerance}°
              </span>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="range"
                min="0"
                max="15"
                step="1"
                disabled={!!activeSession}
                value={selectedTolerance}
                onChange={(e) => setSelectedTolerance(Number(e.target.value))}
                className="w-full accent-amber-500 cursor-pointer disabled:opacity-60"
              />
              <div className="flex space-x-1 shrink-0">
                {[3, 5, 10].map((tol) => (
                  <button
                    key={tol}
                    type="button"
                    disabled={!!activeSession}
                    onClick={() => setSelectedTolerance(tol)}
                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded border ${
                      selectedTolerance === tol
                        ? 'bg-amber-500 text-white border-amber-600'
                        : 'bg-slate-50 text-slate-600 border-slate-300 hover:bg-slate-100 disabled:opacity-60'
                    }`}
                  >
                    ±{tol}°
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Row 2: Sumber Input (Kamera vs File Video), Model AI, Batas Waktu, & Info Standar Gerakan */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-center pt-2 border-t border-slate-100">
          {/* Kamera atau File Video Picker */}
          {inputSource === 'camera' ? (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                  <Video className="w-3.5 h-3.5 text-slate-500" />
                  <span>Pilihan Kamera</span>
                </label>
                {!activeSession && (
                  <button
                    type="button"
                    onClick={() => {
                      if (isPreviewActive) {
                        setIsPreviewActive(false);
                        setStreamData(null);
                        setPreviewError(null);
                      } else {
                        setStreamData(null);
                        setPreviewError(null);
                        setIsPreviewActive(true);
                      }
                    }}
                    className={`text-[11px] font-bold px-2 py-0.5 rounded cursor-pointer transition ${
                      isPreviewActive
                        ? 'bg-amber-100 text-amber-700 border border-amber-300'
                        : 'bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200'
                    }`}
                  >
                    {isPreviewActive ? '⏹ Matikan' : '📹 Aktifkan Kamera'}
                  </button>
                )}
              </div>
              <select
                disabled={!!activeSession}
                value={selectedCameraId}
                onChange={(e) => setSelectedCameraId(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:opacity-60"
              >
                {cameras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.camera_type})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                <span className="flex items-center space-x-1">
                  <FileVideo className="w-3.5 h-3.5 text-slate-500" />
                  <span>Pilih File Video</span>
                </span>
                {uploadedFile && (
                  <span className="text-[10px] text-slate-400 font-mono">
                    {(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB
                  </span>
                )}
              </label>
              <input
                type="file"
                ref={fileInputRef}
                accept="video/mp4,video/avi,video/quicktime,video/x-matroska,video/webm"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    setUploadedFile(e.target.files[0]);
                    setVideoProcessResult(null);
                    setVideoProcessError(null);
                  }
                }}
              />
              <button
                type="button"
                disabled={isProcessingVideo}
                onClick={() => fileInputRef.current?.click()}
                className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 flex items-center justify-between transition-colors cursor-pointer disabled:opacity-60 truncate"
              >
                <span className="truncate">
                  {uploadedFile ? uploadedFile.name : 'Pilih Video (MP4 / AVI / MOV)...'}
                </span>
                <UploadCloud className="w-4 h-4 text-amber-500 shrink-0 ml-2" />
              </button>
            </div>
          )}

          {/* Model AI Selection */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Model AI Pose</label>
            <div className="grid grid-cols-2 gap-1 bg-slate-100 p-1 rounded-lg">
              {(['mediapipe', 'yolo'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  disabled={!!activeSession}
                  onClick={() => setSelectedModel(m)}
                  className={`py-1.5 text-xs font-bold rounded-md uppercase transition-colors ${
                    selectedModel === m
                      ? 'bg-slate-900 text-amber-400 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Batas Waktu Pengujian (Timer Standar Kesamaptaan) */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-slate-700 flex items-center space-x-1">
                <Timer className="w-3.5 h-3.5 text-slate-500" />
                <span>Batas Waktu Pengujian</span>
              </label>
              <span className="text-[10px] font-bold text-amber-600">
                {targetDuration > 0 ? `${targetDuration} Detik` : 'Tanpa Batas'}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1 bg-slate-100 p-1 rounded-lg">
              {[
                { label: '60s', val: 60, title: '60 Detik (Standar 1 Menit)' },
                { label: '30s', val: 30, title: '30 Detik' },
                { label: '120s', val: 120, title: '120 Detik (2 Menit)' },
                { label: 'Manual', val: 0, title: 'Tanpa Batas Waktu' },
              ].map((opt) => (
                <button
                  key={opt.val}
                  type="button"
                  title={opt.title}
                  disabled={!!activeSession}
                  onClick={() => setTargetDuration(opt.val)}
                  className={`py-1.5 text-xs font-bold rounded-md transition-colors ${
                    targetDuration === opt.val
                      ? 'bg-slate-900 text-amber-400 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 disabled:opacity-60'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Info Standar Penilaian Dinamis */}
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200 text-xs">
            <span className="font-bold text-slate-800 block mb-0.5">
              Standar {selectedExercise.toUpperCase()} ({selectedGender === 'P' ? 'Wanita' : 'Pria'}) - Toleransi ±{selectedTolerance}°:
            </span>
            <span className="text-slate-600 text-[11px] leading-relaxed line-clamp-2">
              {selectedExercise === 'pushup' && selectedGender === 'L' && (
                `Tumpuan jari kaki. Kedalaman siku target ≤ 90° (valid s/d ${90 + selectedTolerance}°), ekstensi ≥ ${160 - selectedTolerance}°.`
              )}
              {selectedExercise === 'pushup' && selectedGender === 'P' && (
                `Tumpuan lutut/kaki. Kedalaman siku target ≤ 95° (valid s/d ${95 + selectedTolerance}°), ekstensi ≥ ${155 - selectedTolerance}°.`
              )}
              {selectedExercise === 'situp' && selectedGender === 'L' && (
                `Posisi rebah ≥ ${125 - selectedTolerance}°, angkat torso mendekati lutut ≤ 70° (valid s/d ${70 + selectedTolerance}°).`
              )}
              {selectedExercise === 'situp' && selectedGender === 'P' && (
                `Posisi rebah ≥ ${120 - selectedTolerance}°, angkat torso mendekati lutut ≤ 75° (valid s/d ${75 + selectedTolerance}°).`
              )}
              {selectedExercise === 'pullup' && selectedGender === 'L' && (
                `Dead hang siku ≥ ${155 - selectedTolerance}°, tarikan siku ≤ 70° (valid s/d ${70 + selectedTolerance}°).`
              )}
              {selectedExercise === 'pullup' && selectedGender === 'P' && (
                `Chinning / Modified pull-up: Siku awal ≥ ${145 - selectedTolerance}°, tarikan siku ≤ 85° (valid s/d ${85 + selectedTolerance}°).`
              )}
              {selectedExercise === 'shuttlerun' && selectedGender === 'L' && (
                `Lari Angka 8 (6 x 10m): 3 Putaran Penuh (6 Lintasan). Pria: 100 poin ≤ 16.2 detik, 0 poin ≥ 26.0 detik.`
              )}
              {selectedExercise === 'shuttlerun' && selectedGender === 'P' && (
                `Lari Angka 8 (6 x 10m): 3 Putaran Penuh (6 Lintasan). Wanita: 100 poin ≤ 17.6 detik, 0 poin ≥ 27.5 detik.`
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Main Monitoring & Live Video Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left: Video Canvas & HUD (3 cols) */}
        <div className="lg:col-span-3 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 shadow-md flex flex-col">
          {/* Top Video Header */}
          <div className="bg-slate-900/90 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white text-xs">
            <div className="flex items-center space-x-2">
              <span className={`w-2.5 h-2.5 rounded-full ${
                inputSource === 'camera'
                  ? (activeSession ? 'bg-red-500 animate-ping' : (isPreviewActive ? 'bg-blue-500 animate-pulse' : 'bg-slate-500'))
                  : (isProcessingVideo ? 'bg-amber-500 animate-ping' : videoProcessResult ? 'bg-emerald-500' : 'bg-slate-500')
              }`} />
              <span className="font-bold uppercase tracking-wider">
                {inputSource === 'camera'
                  ? (activeSession
                      ? `LIVE STREAM: ${activeSession.session_code}`
                      : (isPreviewActive ? `LIVE PRATINJAU KAMERA (${selectedExercise.toUpperCase()})` : 'STANDBY / IDLE (KAMERA)'))
                  : (isProcessingVideo ? 'MEMPROSES REKAMAN VIDEO...' : videoProcessResult ? `HASIL ANALISIS VIDEO: ${videoProcessResult.session_code}` : 'STANDBY / UNGGAH VIDEO')}
              </span>
            </div>
            <div className="flex items-center space-x-3 text-slate-300">
              {inputSource === 'camera' ? (
                <>
                  <span>FPS: <b className="text-white">{streamData?.fps ?? 0}</b></span>
                  <span>Latensi: <b className="text-white">{streamData?.latency_ms ?? 0} ms</b></span>
                </>
              ) : videoProcessResult ? (
                <>
                  <span>Avg FPS: <b className="text-white">{videoProcessResult.avg_fps}</b></span>
                  <span>Latensi: <b className="text-white">{videoProcessResult.avg_latency_ms} ms</b></span>
                  <span>Frame: <b className="text-white">{videoProcessResult.total_frames}</b></span>
                </>
              ) : null}
              <span>Model: <b className="text-amber-400 uppercase">{selectedModel}</b></span>
              <span className="hidden sm:inline border-l border-slate-700 pl-3">
                Kategori: <b className={selectedGender === 'P' ? 'text-pink-400 uppercase' : 'text-blue-400 uppercase'}>
                  {selectedGender === 'P' ? 'Wanita' : 'Pria'}
                </b>
              </span>
              <span className="hidden sm:inline">
                Toleransi: <b className="text-amber-300">±{selectedTolerance}°</b>
              </span>
            </div>
          </div>

          {/* Video / Frame Screen */}
          <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
            {inputSource === 'camera' ? (
              // Mode 1: Live Camera Feed (Active Session or Preview)
              streamData?.frame ? (
                <div className="relative w-full h-full flex items-center justify-center">
                  <img
                    src={`data:image/jpeg;base64,${streamData.frame}`}
                    alt="Live Stream SIKAPTA AI"
                    className="w-full h-full object-contain"
                  />
                  {isPreviewActive && !activeSession && (
                    <div className="absolute top-3 right-3 bg-blue-950/85 backdrop-blur-md px-3 py-1.5 rounded-lg text-xs font-bold text-blue-300 border border-blue-500/50 flex items-center space-x-2 shadow-lg">
                      <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
                      <span>Mode Pratinjau Kamera Aktif</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center p-8 text-slate-500 max-w-md mx-auto">
                  <Video className="w-16 h-16 mx-auto mb-3 opacity-30" />
                  <h4 className="text-lg font-bold text-slate-400">SIKAPTA VISION ENGINE</h4>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    {activeSession
                      ? 'Menghubungkan stream video dan modul inferensi...'
                      : previewError
                      ? 'Terjadi kendala saat menghubungkan kamera perangkat:'
                      : isPreviewActive
                      ? 'Menghubungkan kamera dan modul deteksi...'
                      : selectedExercise === 'shuttlerun'
                      ? 'Aktifkan kamera terlebih dahulu untuk memeriksa jangkauan kedua tiang lintasan sebelum memulai pengujian.'
                      : 'Pilih peserta dan konfigurasi kamera, kemudian aktifkan kamera atau tekan "Mulai Pengujian".'}
                  </p>

                  {previewError ? (
                    <div className="bg-red-950/70 border border-red-800 text-red-200 p-4 rounded-xl text-center space-y-3 shadow-lg mb-3">
                      <div className="flex items-center justify-center space-x-2 text-red-400 font-bold text-xs">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>Kamera Belum Terhubung</span>
                      </div>
                      <p className="text-[11px] text-red-300 leading-relaxed">{previewError}</p>
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewError(null);
                          setStreamData(null);
                          setIsPreviewActive(false);
                          setTimeout(() => setIsPreviewActive(true), 250);
                        }}
                        className="inline-flex items-center space-x-1.5 bg-red-600 hover:bg-red-500 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow-md transition cursor-pointer"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Coba Hubungkan Ulang</span>
                      </button>
                    </div>
                  ) : !activeSession && !isPreviewActive ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewError(null);
                        setStreamData(null);
                        setIsPreviewActive(true);
                      }}
                      className="inline-flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-4 py-2 rounded-lg text-xs shadow-md transition-colors cursor-pointer"
                    >
                      <Camera className="w-4 h-4" />
                      <span>Aktifkan Kamera Deteksi</span>
                    </button>
                  ) : null}

                  {!activeSession && isPreviewActive && !previewError && (
                    <div className="inline-flex items-center space-x-2 text-blue-400 text-xs font-semibold bg-blue-950/60 border border-blue-800/60 px-4 py-2 rounded-lg">
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
                      <span>Membuka stream kamera perangkat & modul deteksi...</span>
                    </div>
                  )}
                </div>
              )
            ) : (
              // Mode 2: Video Upload Screen
              isProcessingVideo ? (
                <div className="text-center p-8 text-slate-300 space-y-4">
                  <div className="relative w-16 h-16 mx-auto">
                    <div className="w-16 h-16 rounded-full border-4 border-amber-500/20 border-t-amber-500 animate-spin" />
                    <Sparkles className="w-6 h-6 text-amber-400 absolute inset-0 m-auto animate-pulse" />
                  </div>
                  <div>
                    <h4 className="text-lg font-bold text-white">SIKAPTA Vision Engine Sedang Menganalisis Video</h4>
                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                      Mengekstraksi frame, mendeteksi pose skeletal, mengukur sudut sendi, memvalidasi siklus repetisi, dan menyusun rekaman video beranotasi...
                    </p>
                  </div>
                  <div className="inline-block bg-slate-900 border border-slate-800 rounded-full px-4 py-1.5 text-xs text-amber-300 font-mono">
                    Model: {selectedModel.toUpperCase()} (CPU Mode) | Gerakan: {selectedExercise.toUpperCase()} ({selectedGender === 'P' ? 'Wanita' : 'Pria'})
                  </div>
                </div>
              ) : videoProcessResult ? (
                <div className="w-full h-full flex flex-col items-center justify-center relative bg-black">
                  <video
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                    src={videoProcessResult.annotated_video_url}
                  >
                    Format video tidak didukung oleh peramban Anda.
                  </video>
                  <div className="absolute top-3 left-3 bg-slate-950/80 backdrop-blur-md px-3 py-1 rounded-md text-[11px] font-bold text-emerald-400 border border-emerald-500/30 flex items-center space-x-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>HASIL REKAMAN BERANOTASI SIKAPTA AI</span>
                  </div>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="text-center p-8 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer space-y-3 w-full h-full flex flex-col items-center justify-center border-2 border-dashed border-slate-800 hover:border-slate-700 m-4 rounded-xl"
                >
                  <div className="w-16 h-16 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-amber-400 shadow-lg">
                    <UploadCloud className="w-8 h-8" />
                  </div>
                  <div>
                    <h4 className="text-base font-bold text-slate-200">
                      {uploadedFile ? uploadedFile.name : 'Pilih atau Tarik File Rekaman Video ke Sini'}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">
                      {uploadedFile
                        ? `Ukuran: ${(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB - Klik untuk mengganti file`
                        : 'Mendukung format video MP4, AVI, MOV, atau MKV rekaman tes fisik'}
                    </p>
                  </div>
                  {videoProcessError && (
                    <div className="bg-red-950/80 border border-red-500/40 text-red-200 text-xs px-4 py-2 rounded-lg flex items-center space-x-2">
                      <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                      <span>{videoProcessError}</span>
                    </div>
                  )}
                </div>
              )
            )}

            {/* In-Video Real-time Form Alert Banner (Live Mode only) */}
            {inputSource === 'camera' && streamData && (
              <div className="absolute bottom-4 left-4 right-4 pointer-events-none">
                <div
                  className={`px-4 py-2.5 rounded-lg shadow-lg text-sm font-semibold flex items-center space-x-2 backdrop-blur-md ${
                    streamData.is_good_form
                      ? 'bg-emerald-950/80 text-emerald-200 border border-emerald-500/50'
                      : 'bg-red-950/80 text-red-200 border border-red-500/50 animate-bounce'
                  }`}
                >
                  {streamData.is_good_form ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                  ) : (
                    <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                  )}
                  <span>{streamData.feedback || 'Pertahankan postur tubuh dengan baik'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Progress Bar for Target Time Limit */}
          {activeSession && targetDuration > 0 && (
            <div className="w-full bg-slate-800 h-1.5 overflow-hidden">
              <div
                className={`h-full transition-all duration-1000 ${
                  targetDuration - elapsedSeconds <= 10
                    ? 'bg-red-500 animate-pulse'
                    : 'bg-amber-400'
                }`}
                style={{
                  width: `${Math.min(100, (elapsedSeconds / targetDuration) * 100)}%`,
                }}
              />
            </div>
          )}

          {/* Action Control Toolbar */}
          <div className="bg-slate-900 p-3 sm:p-4 border-t border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {inputSource === 'camera' ? (
              <>
                <div className="flex items-center justify-between sm:justify-start space-x-3 text-white">
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-amber-500 shrink-0" />
                    <div className="flex items-baseline space-x-1.5">
                      <span className="text-xl sm:text-2xl font-mono font-black text-amber-400">
                        {formatTimer(elapsedSeconds)}
                      </span>
                      {targetDuration > 0 && (
                        <span className="text-xs sm:text-sm font-mono text-slate-400">
                          / {formatTimer(targetDuration)}
                        </span>
                      )}
                    </div>
                  </div>

                  {targetDuration > 0 && activeSession?.status === 'in_progress' && (
                    <span
                      className={`text-xs font-mono font-bold px-2 py-0.5 rounded border ${
                        targetDuration - elapsedSeconds <= 10
                          ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      Sisa: {Math.max(0, targetDuration - elapsedSeconds)}s
                    </span>
                  )}

                  <span className="text-xs text-slate-400 uppercase tracking-wider font-semibold hidden md:inline">
                    Status: {activeSession?.status || (isPreviewActive ? 'Kamera Deteksi Aktif' : 'Siap')}
                  </span>
                </div>

                <div className="flex items-center justify-end space-x-2 sm:space-x-3 flex-wrap">
                  {!activeSession ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (isPreviewActive) {
                            setIsPreviewActive(false);
                            setStreamData(null);
                            setPreviewError(null);
                          } else {
                            setStreamData(null);
                            setPreviewError(null);
                            setIsPreviewActive(true);
                          }
                        }}
                        className={`flex items-center space-x-1.5 sm:space-x-2 font-bold px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg border text-xs transition-all cursor-pointer ${
                          isPreviewActive
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 hover:bg-amber-500/30'
                            : 'bg-slate-800 border-slate-700 text-slate-200 hover:bg-slate-700'
                        }`}
                        title="Aktifkan kamera deteksi untuk memeriksa posisi pelari dan sudut lintasan sebelum memulai pengujian"
                      >
                        <Camera className="w-4 h-4" />
                        <span>{isPreviewActive ? 'Matikan Kamera' : 'Aktifkan Kamera'}</span>
                      </button>

                      <button
                        onClick={handleStart}
                        disabled={isStarting || !selectedParticipantId}
                        className="flex items-center space-x-1.5 sm:space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50 text-xs sm:text-sm"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>{isStarting ? 'Memulai...' : 'Mulai Pengujian'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      {activeSession.status === 'in_progress' ? (
                        <button
                          onClick={handlePause}
                          className="flex items-center space-x-2 bg-amber-600 hover:bg-amber-500 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer text-xs sm:text-sm"
                        >
                          <Pause className="w-4 h-4 fill-current" />
                          <span>Jeda</span>
                        </button>
                      ) : (
                        <button
                          onClick={handleResume}
                          className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white font-bold px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-lg transition-all cursor-pointer text-xs sm:text-sm"
                        >
                          <Play className="w-4 h-4 fill-current" />
                          <span>Lanjutkan</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleStop(false)}
                        className="flex items-center space-x-2 bg-red-600 hover:bg-red-500 text-white font-bold px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg shadow-md transition-all cursor-pointer text-xs sm:text-sm"
                      >
                        <Square className="w-4 h-4 fill-current" />
                        <span>Hentikan & Simpan</span>
                      </button>
                    </>
                  )}
                </div>
              </>
            ) : (
              // Toolbar for Video Upload Mode
              <>
                <div className="flex items-center space-x-3 text-white text-xs">
                  <Film className="w-5 h-5 text-amber-400" />
                  <div>
                    <span className="font-bold block text-slate-200">
                      {uploadedFile ? uploadedFile.name : 'Belum ada file video dipilih'}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {videoProcessResult
                        ? `Selesai dalam ${videoProcessResult.duration_seconds}s (${videoProcessResult.total_frames} frame)`
                        : 'Format MP4, AVI, MOV, MKV'}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  {videoProcessResult ? (
                    <>
                      {videoProcessResult.status === 'completed' || videoApprovalSuccess ? (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setPrintSession({
                                ...videoProcessResult,
                                id: videoProcessResult.session_id,
                                start_time: videoProcessResult.start_time || new Date().toISOString(),
                                created_at: new Date().toISOString(),
                                updated_at: new Date().toISOString(),
                              } as AssessmentSession);
                              setIsPrintModalOpen(true);
                            }}
                            className="flex items-center space-x-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3.5 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                            <span>Cetak Laporan</span>
                          </button>
                          <a
                            href={api.getPdfUrl(videoProcessResult.session_id)}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-amber-400 font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-sm"
                          >
                            <FileDown className="w-4 h-4" />
                            <span>Unduh PDF</span>
                          </a>
                        </>
                      ) : (
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] text-amber-300 bg-amber-950/70 border border-amber-500/50 px-3 py-1.5 rounded-lg flex items-center space-x-1.5 font-bold">
                            <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                            <span>Menunggu Persetujuan Penguji</span>
                          </span>
                          <button
                            type="button"
                            disabled={isVideoApproving}
                            onClick={handleApproveVideoSession}
                            className="flex items-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{isVideoApproving ? 'Menyimpan...' : 'Setujui & Simpan Resmi'}</span>
                          </button>
                          <button
                            type="button"
                            disabled={isVideoRejecting}
                            onClick={handleRejectVideoSession}
                            className="flex items-center space-x-1.5 bg-red-600/80 hover:bg-red-600 text-white font-bold px-3 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>{isVideoRejecting ? 'Membatalkan...' : 'Tolak'}</span>
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => {
                          setVideoProcessResult(null);
                          setUploadedFile(null);
                          setVideoApprovalSuccess(false);
                        }}
                        className="flex items-center space-x-1.5 bg-slate-700 hover:bg-slate-600 text-white font-bold px-3.5 py-2 rounded-lg text-xs transition-colors shadow-sm cursor-pointer"
                      >
                        <RefreshCw className="w-4 h-4" />
                        <span>Analisis Video Baru</span>
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleVideoUploadSubmit}
                      disabled={isProcessingVideo || !uploadedFile || !selectedParticipantId}
                      className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-2.5 rounded-lg shadow-md transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isProcessingVideo ? 'Menganalisis Video...' : 'Mulai Analisis Video'}</span>
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Right: Assessment Metrics & Results (1 col) */}
        <div className="space-y-4">
          {/* Card: Repetisi Sah (Verified) */}
          <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs text-center">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              {selectedExercise === 'shuttlerun' ? 'Putaran Sah (Target 3)' : 'Repetisi Sah (Terverifikasi)'}
            </span>
            <div className="text-5xl font-black text-emerald-600 mt-2">
              {inputSource === 'camera'
                ? (streamData?.verified_reps ?? 0)
                : (videoProcessResult ? videoProcessResult.verified_reps : 0)}
            </div>
            <p className="text-[11px] text-emerald-700 mt-1 font-medium">
              {selectedExercise === 'shuttlerun' ? 'Putaran angka 8 tuntas' : 'Memenuhi seluruh standar siklus'}
            </p>
          </div>

          {/* Card: Repetisi Ditolak & Total */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                {selectedExercise === 'shuttlerun' ? 'Pelanggaran' : 'Ditolak'}
              </span>
              <div className="text-3xl font-black text-red-500 mt-1">
                {inputSource === 'camera'
                  ? (streamData?.rejected_reps ?? 0)
                  : (videoProcessResult ? videoProcessResult.rejected_reps : 0)}
              </div>
              <span className="text-[10px] text-red-500 font-medium">
                {selectedExercise === 'shuttlerun' ? 'Keluar jalur' : 'Parsial / Kurang'}
              </span>
            </div>

            <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-xs text-center">
              <span className="text-[11px] font-semibold text-slate-400 uppercase">
                {selectedExercise === 'shuttlerun' ? 'Lintasan (6)' : 'Total Gerak'}
              </span>
              <div className="text-3xl font-black text-slate-800 mt-1">
                {inputSource === 'camera'
                  ? (streamData?.detected_reps ?? 0)
                  : (videoProcessResult ? videoProcessResult.detected_reps : 0)}
              </div>
              <span className="text-[10px] text-slate-400 font-medium">
                {selectedExercise === 'shuttlerun' ? 'Bolak-balik lintasan' : 'Siklus terdeteksi'}
              </span>
            </div>
          </div>

          {/* Mode-specific Metric Cards */}
          {inputSource === 'camera' ? (
            /* Live Camera Gauges */
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1">
                  <Gauge className="w-4 h-4 text-amber-600" />
                  <span>{selectedExercise === 'shuttlerun' ? 'Waktu Tempuh (Detik)' : 'Sudut Sendi Saat Ini'}</span>
                </span>
                <span className="text-lg font-black text-slate-900">
                  {selectedExercise === 'shuttlerun'
                    ? `${(streamData?.current_angle || 0).toFixed(1)}s`
                    : (streamData?.current_angle ? `${streamData.current_angle.toFixed(1)}°` : '0.0°')}
                </span>
              </div>

              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-semibold text-slate-700">Fase Gerakan</span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 uppercase">
                  {streamData?.phase || 'INIT'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Catatan Penguji</label>
                <textarea
                  rows={3}
                  value={examinerNotes}
                  onChange={(e) => setExaminerNotes(e.target.value)}
                  placeholder="Catatan verifikasi penguji..."
                  className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              </div>
            </div>
          ) : (
            /* Video Upload Results & Reps List */
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span className="text-xs font-semibold text-slate-700">Rincian Hasil Analisis</span>
                {videoProcessResult && (
                  videoProcessResult.status === 'completed' || videoApprovalSuccess ? (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                      Disetujui &amp; Tersimpan
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                      Menunggu Approval
                    </span>
                  )
                )}
              </div>

              {/* Approval & Repetition Adjustment Section for Video Upload */}
              {videoProcessResult && (
                videoProcessResult.status === 'completed' || videoApprovalSuccess ? (
                  <div className="bg-emerald-50 border border-emerald-300 rounded-xl p-3 flex items-start space-x-2 text-xs text-emerald-900 font-semibold shadow-xs">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold">Hasil Video Telah Disetujui!</p>
                      <p className="text-[11px] text-emerald-700 font-normal">
                        Nilai repetisi resmi tersimpan di database dan masuk ke rekapitulasi nilai kegiatan samapta.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-amber-50/80 border-2 border-amber-300 rounded-xl p-3.5 space-y-3 shadow-xs">
                    <div className="flex items-center space-x-2 text-amber-900 border-b border-amber-200/80 pb-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span className="font-bold text-xs uppercase tracking-wide">Persetujuan &amp; Koreksi Penguji</span>
                    </div>

                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      Hasil deteksi video belum disimpan ke database. Penguji dapat menyesuaikan jumlah repetisi sah/ditolak secara diskresioner sebelum menyetujui.
                    </p>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-white p-2.5 rounded-lg border-2 border-emerald-300 text-center">
                        <label className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">
                          Repetisi Sah *
                        </label>
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setVideoEditVerifiedReps((v) => Math.max(0, v - 1))}
                            className="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={videoEditVerifiedReps}
                            onChange={(e) => setVideoEditVerifiedReps(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-14 text-center font-black text-lg text-emerald-700 bg-emerald-50/50 border border-emerald-300 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                          />
                          <button
                            type="button"
                            onClick={() => setVideoEditVerifiedReps((v) => v + 1)}
                            className="w-6 h-6 rounded bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="bg-white p-2.5 rounded-lg border-2 border-red-300 text-center">
                        <label className="text-[10px] font-bold text-red-800 uppercase block mb-1">
                          Repetisi Ditolak *
                        </label>
                        <div className="flex items-center justify-center space-x-1">
                          <button
                            type="button"
                            onClick={() => setVideoEditRejectedReps((v) => Math.max(0, v - 1))}
                            className="w-6 h-6 rounded bg-red-100 hover:bg-red-200 text-red-800 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={videoEditRejectedReps}
                            onChange={(e) => setVideoEditRejectedReps(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-14 text-center font-black text-lg text-red-600 bg-red-50/50 border border-red-300 rounded py-0.5 focus:outline-none focus:ring-1 focus:ring-red-500"
                          />
                          <button
                            type="button"
                            onClick={() => setVideoEditRejectedReps((v) => v + 1)}
                            className="w-6 h-6 rounded bg-red-100 hover:bg-red-200 text-red-800 font-bold flex items-center justify-center cursor-pointer text-xs"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">Catatan Penguji</label>
                      <input
                        type="text"
                        value={videoEditNotes}
                        onChange={(e) => setVideoEditNotes(e.target.value)}
                        placeholder="Catatan verifikasi video..."
                        className="w-full text-xs p-2 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                      />
                    </div>

                    <div className="pt-1 space-y-2">
                      <button
                        type="button"
                        disabled={isVideoApproving || isVideoRejecting}
                        onClick={handleApproveVideoSession}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs shadow-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{isVideoApproving ? 'Menyimpan...' : 'Setujui & Simpan ke Database'}</span>
                      </button>
                      <button
                        type="button"
                        disabled={isVideoApproving || isVideoRejecting}
                        onClick={handleRejectVideoSession}
                        className="w-full bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 font-bold py-1.5 px-3 rounded-lg text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5 text-red-600" />
                        <span>{isVideoRejecting ? 'Membatalkan...' : 'Tolak & Hapus Hasil Sesi'}</span>
                      </button>
                    </div>
                  </div>
                )
              )}

              {videoProcessResult && videoProcessResult.rep_events?.length > 0 ? (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {videoProcessResult.rep_events.map((ev: any) => (
                    <div
                      key={ev.rep_number}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        ev.is_valid
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                          : 'bg-red-50/70 border-red-200 text-red-950'
                      }`}
                    >
                      <div className="flex items-center space-x-2">
                        <span
                          className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] ${
                            ev.is_valid ? 'bg-emerald-600 text-white' : 'bg-red-500 text-white'
                          }`}
                        >
                          #{ev.rep_number}
                        </span>
                        <div>
                          <div className="font-bold flex items-center space-x-1">
                            <span>{ev.is_valid ? 'SAH' : 'DITOLAK'}</span>
                            {ev.rejection_reason && (
                              <span className="text-[10px] text-red-700 font-medium">({ev.rejection_reason})</span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-500">{ev.feedback}</span>
                        </div>
                      </div>
                      <div className="text-right text-[11px] font-mono text-slate-600">
                        {ev.min_angle?.toFixed(0)}° / {ev.peak_angle?.toFixed(0)}°
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400 text-xs space-y-2">
                  <Film className="w-8 h-8 mx-auto opacity-30" />
                  <p>
                    {isProcessingVideo
                      ? 'Sedang menghitung evaluasi repetisi...'
                      : 'Unggah file video dan klik tombol "Mulai Analisis Video" untuk melihat rincian siklus repetisi.'}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Post-Assessment Summary Modal */}
      {showSummaryModal && completedSession && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95 max-h-[92vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="text-center">
              {completedSession.status === 'completed' || liveApprovedSuccess ? (
                <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-2 shadow-xs ring-4 ring-emerald-50">
                  <CheckCircle2 className="w-7 h-7" />
                </div>
              ) : (
                <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 mx-auto flex items-center justify-center mb-2 shadow-xs ring-4 ring-amber-50">
                  <AlertCircle className="w-7 h-7" />
                </div>
              )}
              <h3 className="text-xl font-bold text-slate-900">
                {completedSession.status === 'completed' || liveApprovedSuccess
                  ? 'Sesi Pengujian Disetujui & Tersimpan'
                  : 'Verifikasi & Persetujuan Penguji (Approval)'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {completedSession.status === 'completed' || liveApprovedSuccess
                  ? 'Hasil evaluasi resmi telah disahkan oleh penguji dan tersimpan ke database SIKAPTA AI'
                  : 'Deteksi AI selesai. Tinjau & verifikasi repetisi sebelum menyetujui dan menyimpan resmi ke database.'}
              </p>
            </div>

            {/* Approval Status Banner */}
            {completedSession.status === 'completed' || liveApprovedSuccess ? (
              <div className="bg-emerald-50 border-2 border-emerald-400 text-emerald-950 p-3.5 rounded-xl flex items-center justify-between text-xs shadow-xs">
                <div className="flex items-center space-x-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <div>
                    <p className="font-extrabold text-sm text-emerald-900">STATUS: RESMI TERVERIFIKASI &amp; DISETUJUI</p>
                    <p className="text-emerald-700 text-[11px]">Hasil telah masuk ke rekapitulasi nilai kegiatan dan siap dicetak sebagai laporan resmi.</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-emerald-600 text-white font-black text-xs rounded-lg uppercase tracking-wider shrink-0">
                  Disetujui
                </span>
              </div>
            ) : (
              <div className="bg-amber-50 border-2 border-amber-400 text-amber-950 p-4 rounded-xl flex items-start space-x-3 shadow-xs">
                <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-extrabold text-sm text-amber-900 uppercase tracking-wide flex items-center space-x-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
                    <span>STATUS: MENUNGGU PERSETUJUAN PENGUJI (PENDING APPROVAL)</span>
                  </p>
                  <p className="text-amber-800">
                    Data pengujian ini <b>belum tersimpan resmi ke database rekapitulasi</b>. Penguji memiliki hak diskresi untuk memeriksa, mengonfirmasi, atau mengoreksi jumlah repetisi di bawah ini sebelum menyetujuinya.
                  </p>
                </div>
              </div>
            )}

            {/* Auto-Stop Notice Banner */}
            {wasAutoStopped && (
              <div className="bg-blue-50 border border-blue-200 text-blue-900 text-xs px-3.5 py-2.5 rounded-xl flex items-center space-x-2.5">
                <Timer className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <p className="font-bold">
                    {completedSession.exercise_type === 'shuttlerun'
                      ? `3 Putaran Shuttle Run Selesai Otomatis (${completedSession.duration_seconds} Detik)`
                      : `Batas Waktu Pengujian Tercapai (${completedSession.duration_seconds} Detik)`}
                  </p>
                  <p className="text-[11px] text-blue-700">
                    {completedSession.exercise_type === 'shuttlerun'
                      ? 'Sistem otomatis menghentikan pengujian & mencatat waktu tempuh saat pelari menyelesaikan putaran ke-3 (lintasan ke-6).'
                      : 'Sistem otomatis menghentikan deteksi gerakan kamera karena target waktu selesai.'}
                  </p>
                </div>
              </div>
            )}

            {/* Metrik Hasil Pengujian */}
            <div className="bg-slate-50 p-4 rounded-xl space-y-3 border border-slate-200 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pb-2 border-b border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400">Kode Sesi:</span>{' '}
                  <b className="font-mono text-slate-900">{completedSession.session_code}</b>
                </div>
                <div>
                  <span className="text-slate-400">Jenis Gerakan:</span>{' '}
                  <b className="text-slate-900 uppercase font-black">{completedSession.exercise_type}</b>
                </div>
                <div>
                  <span className="text-slate-400">Model AI:</span>{' '}
                  <b className="text-slate-900 uppercase">{completedSession.model_used} (CPU)</b>
                </div>
                <div>
                  <span className="text-slate-400">Kategori &amp; Toleransi:</span>{' '}
                  <b className="text-slate-900">
                    {completedSession.gender === 'P' ? 'Wanita (P)' : 'Pria (L)'} (±{completedSession.tolerance_deg ?? selectedTolerance}°)
                  </b>
                </div>
                <div>
                  <span className="text-slate-400">Durasi Pengujian:</span>{' '}
                  <b className="text-slate-900">
                    {completedSession.duration_seconds} Detik ({formatTimer(completedSession.duration_seconds)})
                  </b>
                </div>
                <div>
                  <span className="text-slate-400">Tingkat Keberhasilan:</span>{' '}
                  <b className="text-blue-600">
                    {(editVerifiedReps + editRejectedReps) > 0
                      ? `${((editVerifiedReps / (editVerifiedReps + editRejectedReps)) * 100).toFixed(1)}%`
                      : '0.0%'}
                  </b>
                </div>
              </div>

              {/* Repetition Counts / Correction Controls */}
              {completedSession.status === 'completed' || liveApprovedSuccess ? (
                /* Readonly summary for approved session */
                <div className="grid grid-cols-3 gap-2 pt-1 text-center">
                  <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">
                      {completedSession.exercise_type === 'shuttlerun' ? 'Total Lintasan' : 'Total Gerak'}
                    </span>
                    <span className="text-xl font-black text-slate-800">
                      {completedSession.detected_reps ?? (completedSession.verified_reps + completedSession.rejected_reps)}
                    </span>
                  </div>
                  <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                    <span className="text-[10px] uppercase font-bold text-emerald-700 block">
                      {completedSession.exercise_type === 'shuttlerun' ? 'Putaran Sah (Target 3)' : 'Repetisi Sah'}
                    </span>
                    <span className="text-xl font-black text-emerald-600">
                      {completedSession.verified_reps}
                    </span>
                  </div>
                  <div className="bg-red-50 p-2.5 rounded-lg border border-red-200">
                    <span className="text-[10px] uppercase font-bold text-red-700 block">
                      {completedSession.exercise_type === 'shuttlerun' ? 'Pelanggaran' : 'Repetisi Ditolak'}
                    </span>
                    <span className="text-xl font-black text-red-500">
                      {completedSession.rejected_reps}
                    </span>
                  </div>
                </div>
              ) : (
                /* Interactive Referee Verification & Correction */
                <div className="bg-white p-3 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between text-xs text-slate-700 font-semibold border-b border-slate-100 pb-1.5">
                    <span className="flex items-center space-x-1.5">
                      <Sliders className="w-3.5 h-3.5 text-amber-600" />
                      <span>Verifikasi &amp; Koreksi Nilai Penguji:</span>
                    </span>
                    <span className="text-[10px] text-slate-400 italic">Dapat disesuaikan jika penguji memiliki koreksi</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5 pt-1 text-center">
                    {/* Total Gerakan */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 flex flex-col justify-center">
                      <span className="text-[10px] font-bold text-slate-400 uppercase block">Total Gerak</span>
                      <span className="text-xl font-black text-slate-800 mt-1">
                        {Math.max(completedSession.detected_reps ?? 0, editVerifiedReps + editRejectedReps)}
                      </span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Siklus Terdeteksi</span>
                    </div>

                    {/* Repetisi Sah Input */}
                    <div className="bg-emerald-50/70 p-2.5 rounded-xl border-2 border-emerald-400">
                      <label className="text-[10px] font-bold text-emerald-800 uppercase block mb-1">
                        Repetisi Sah *
                      </label>
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditVerifiedReps((v) => Math.max(0, v - 1))}
                          className="w-6 h-6 rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold flex items-center justify-center cursor-pointer text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={editVerifiedReps}
                          onChange={(e) => setEditVerifiedReps(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 text-center text-lg font-black text-emerald-700 bg-white border border-emerald-300 rounded py-0.5 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setEditVerifiedReps((v) => v + 1)}
                          className="w-6 h-6 rounded bg-emerald-200 hover:bg-emerald-300 text-emerald-900 font-bold flex items-center justify-center cursor-pointer text-xs"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[9px] text-emerald-700 font-medium mt-1 block">Memenuhi standar</span>
                    </div>

                    {/* Repetisi Ditolak Input */}
                    <div className="bg-red-50/70 p-2.5 rounded-xl border-2 border-red-300">
                      <label className="text-[10px] font-bold text-red-800 uppercase block mb-1">
                        Repetisi Ditolak *
                      </label>
                      <div className="flex items-center justify-center space-x-1">
                        <button
                          type="button"
                          onClick={() => setEditRejectedReps((v) => Math.max(0, v - 1))}
                          className="w-6 h-6 rounded bg-red-200 hover:bg-red-300 text-red-900 font-bold flex items-center justify-center cursor-pointer text-xs"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="0"
                          value={editRejectedReps}
                          onChange={(e) => setEditRejectedReps(Math.max(0, parseInt(e.target.value) || 0))}
                          className="w-14 text-center text-lg font-black text-red-600 bg-white border border-red-300 rounded py-0.5 focus:ring-1 focus:ring-red-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setEditRejectedReps((v) => v + 1)}
                          className="w-6 h-6 rounded bg-red-200 hover:bg-red-300 text-red-900 font-bold flex items-center justify-center cursor-pointer text-xs"
                        >
                          +
                        </button>
                      </div>
                      <span className="text-[9px] text-red-600 font-medium mt-1 block">Tidak memenuhi</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Identitas Pelaku / Peserta Uji Form */}
            <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200/60 pb-2">
                <div className="flex items-center space-x-2 text-blue-900">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider">Identitas Pelaku / Peserta Uji</h4>
                </div>
                {completedSession.participant && (
                  <span className="text-[11px] font-semibold text-blue-700">
                    Tersimpan: {completedSession.participant.full_name} ({completedSession.participant.participant_number})
                  </span>
                )}
              </div>

              {participantSaveSuccess && (
                <div className="bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs px-3 py-1.5 rounded-md flex items-center space-x-1.5 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Identitas pelaku berhasil disimpan dan dikaitkan ke laporan!</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nomor Peserta / NRP / NIP</label>
                  <input
                    type="text"
                    value={editNrp}
                    onChange={(e) => setEditNrp(e.target.value)}
                    placeholder="Contoh: NRP-89210214 atau PST-001"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Lengkap Pelaku *</label>
                  <input
                    type="text"
                    value={editFullName}
                    onChange={(e) => setEditFullName(e.target.value)}
                    placeholder="Nama lengkap peserta"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Kelamin</label>
                  <select
                    value={editGender}
                    onChange={(e) => setEditGender(e.target.value as 'L' | 'P')}
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="L">Laki-laki (Pria)</option>
                    <option value="P">Perempuan (Wanita)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Satuan / Instansi / Kesatuan</label>
                  <input
                    type="text"
                    value={editOrg}
                    onChange={(e) => setEditOrg(e.target.value)}
                    placeholder="Contoh: Yonif 400, Ditlantas, dsb."
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Kategori / Pangkat</label>
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="Tamtama / Bintara / Perwira / Taruna / Umum"
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Catatan Penguji</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Catatan tambahan hasil pengujian..."
                    className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={isSavingParticipant}
                  onClick={handleSaveParticipant}
                  className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded-lg text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-60"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSavingParticipant ? 'Menyimpan...' : 'Simpan Identitas Pelaku'}</span>
                </button>
              </div>
            </div>

            {/* Modal Action Buttons: Distinct for Pending vs Approved */}
            {completedSession.status === 'completed' || liveApprovedSuccess ? (
              <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-3 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setPrintSession(completedSession);
                    setIsPrintModalOpen(true);
                  }}
                  className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold py-2.5 rounded-lg text-xs shadow-md transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Laporan Resmi</span>
                </button>
                <a
                  href={api.getPdfUrl(completedSession.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="w-full sm:w-auto flex items-center justify-center space-x-2 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold px-4 py-2.5 rounded-lg text-xs shadow-md transition-colors"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Unduh File PDF</span>
                </a>
                <button
                  type="button"
                  onClick={() => setShowSummaryModal(false)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isRejectingLive || isApprovingLive}
                  onClick={handleRejectLiveSession}
                  className="w-full sm:w-auto px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-300 font-bold rounded-xl text-xs transition-colors flex items-center justify-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-red-600" />
                  <span>{isRejectingLive ? 'Membatalkan...' : 'Tolak / Batalkan Sesi'}</span>
                </button>

                <div className="flex items-center space-x-2 w-full sm:w-auto">
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('Tutup jendela ini? Sesi akan tetap berstatus Menunggu Approval sampai disetujui atau dibatalkan.')) {
                        setShowSummaryModal(false);
                      }
                    }}
                    className="w-full sm:w-auto px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                  >
                    Tutup Sementara
                  </button>

                  <button
                    type="button"
                    disabled={isApprovingLive || isRejectingLive}
                    onClick={handleApproveLiveSession}
                    className="w-full sm:w-auto flex-1 flex items-center justify-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold px-6 py-2.5 rounded-xl text-xs shadow-md transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{isApprovingLive ? 'Menyimpan & Menyetujui...' : 'Setujui & Simpan Resmi'}</span>
                  </button>
                </div>
              </div>
            )}
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

