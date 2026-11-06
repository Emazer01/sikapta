import {
  Participant, Camera, RuleProfile, AssessmentSession,
  ModelBenchmark, DashboardStats, SamaptaEvent, EventParticipant,
  BulkEventParticipantItem, BulkEventParticipantsResponse, EventRecapResponse,
  WaveRunLiveState
} from '../types';

const API_BASE = '/api';

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem('sikapta_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    let errorDetail = 'Terjadi kesalahan sistem';
    try {
      const errorJson = await response.json();
      errorDetail = errorJson.detail || errorDetail;
    } catch {
      errorDetail = response.statusText || errorDetail;
    }
    throw new Error(errorDetail);
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json();
}

export const api = {
  // Health
  getHealth: () => request<{ status: string; database: { status: string; dialect: string } }>('/health'),

  // Dashboard
  getDashboardStats: () => request<DashboardStats>('/dashboard/stats'),

  // Participants
  getParticipants: (params?: { search?: string; category?: string; gender?: string; skip?: number; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.search) q.append('search', params.search);
    if (params?.category) q.append('category', params.category);
    if (params?.gender) q.append('gender', params.gender);
    if (params?.skip) q.append('skip', String(params.skip));
    if (params?.limit) q.append('limit', String(params.limit));
    return request<Participant[]>(`/participants/?${q.toString()}`);
  },
  getParticipant: (id: number) => request<Participant>(`/participants/${id}`),
  createParticipant: (data: Partial<Participant>) => request<Participant>('/participants/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  bulkCreateParticipants: (participants: Partial<Participant>[]) =>
    request<{
      total_received: number;
      inserted_count: number;
      updated_count: number;
      skipped_count: number;
      participants: Participant[];
      errors: string[];
    }>('/participants/bulk', {
      method: 'POST',
      body: JSON.stringify({ participants }),
    }),
  updateParticipant: (id: number, data: Partial<Participant>) => request<Participant>(`/participants/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteParticipant: (id: number) => request<void>(`/participants/${id}`, {
    method: 'DELETE',
  }),

  // Cameras
  getCameras: () => request<Camera[]>('/cameras/'),
  getCamera: (id: number) => request<Camera>(`/cameras/${id}`),
  createCamera: (data: any) => request<Camera>('/cameras/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateCamera: (id: number, data: any) => request<Camera>(`/cameras/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteCamera: (id: number) => request<void>(`/cameras/${id}`, {
    method: 'DELETE',
  }),
  testCameraConnection: (data: { camera_type: string; device_index?: number; rtsp_url?: string }) =>
    request<{ success: boolean; message: string; details?: any }>('/cameras/test-connection', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Rule Profiles
  getRuleProfiles: (exercise_type?: string) => {
    const q = exercise_type ? `?exercise_type=${exercise_type}` : '';
    return request<RuleProfile[]>(`/rule-profiles/${q}`);
  },

  // Assessments
  getAssessments: (params?: { participant_id?: number; exercise_type?: string; model_used?: string; status?: string }) => {
    const q = new URLSearchParams();
    if (params?.participant_id) q.append('participant_id', String(params.participant_id));
    if (params?.exercise_type) q.append('exercise_type', params.exercise_type);
    if (params?.model_used) q.append('model_used', params.model_used);
    if (params?.status) q.append('status', params.status);
    return request<AssessmentSession[]>(`/assessments/?${q.toString()}`);
  },
  getAssessment: (id: number) => request<AssessmentSession>(`/assessments/${id}`),
  createAssessment: (data: {
    participant_id: number;
    event_id?: number;
    camera_id?: number;
    rule_profile_id?: number;
    exercise_type: string;
    model_used: string;
    gender?: string;
    tolerance_deg?: number;
    examiner_notes?: string;
  }) => request<AssessmentSession>('/assessments/', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  controlAssessment: (
    id: number,
    action: 'pause' | 'resume' | 'stop',
    examiner_notes?: string,
    metrics?: {
      duration_seconds?: number;
      verified_reps?: number;
      rejected_reps?: number;
      detected_reps?: number;
    }
  ) =>
    request<AssessmentSession>(`/assessments/${id}/control`, {
      method: 'POST',
      body: JSON.stringify({
        action,
        examiner_notes,
        ...(metrics || {}),
      }),
    }),
  assignParticipantToSession: (
    sessionId: number,
    data: {
      participant_id?: number;
      participant_number?: string;
      full_name?: string;
      gender?: string;
      organization?: string;
      category?: string;
      examiner_notes?: string;
    }
  ) =>
    request<AssessmentSession>(`/assessments/${sessionId}/assign-participant`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  approveAssessment: (
    sessionId: number,
    data: {
      verified_reps?: number;
      rejected_reps?: number;
      examiner_notes?: string;
      participant_id?: number;
    }
  ) =>
    request<AssessmentSession>(`/assessments/${sessionId}/approve`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  rejectAssessment: (sessionId: number, reason?: string) =>
    request<{ message: string; session_id: number; status: string }>(`/assessments/${sessionId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
  uploadVideoAssessment: async (formData: FormData): Promise<any> => {
    const token = localStorage.getItem('sikapta_token');
    const headers: Record<string, string> = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE}/assessments/upload-video`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!response.ok) {
      let errorDetail = 'Terjadi kesalahan saat memproses video';
      try {
        const errorJson = await response.json();
        errorDetail = errorJson.detail || errorDetail;
      } catch {
        errorDetail = response.statusText || errorDetail;
      }
      throw new Error(errorDetail);
    }
    return response.json();
  },
  getAnnotatedVideoUrl: (sessionId: number) => `${API_BASE}/assessments/${sessionId}/annotated-video`,
  getSourceVideoUrl: (sessionId: number) => `${API_BASE}/assessments/${sessionId}/source-video`,

  // Benchmark
  runBenchmark: (video_path?: string) => request<any>('/benchmark/run', {
    method: 'POST',
    body: JSON.stringify({ video_path }),
  }),
  getBenchmarkHistory: () => request<ModelBenchmark[]>('/benchmark/history'),

  // Settings
  getSettings: () => request<any>('/settings/'),
  updateSettings: (data: any) => request<any>('/settings/', {
    method: 'PUT',
    body: JSON.stringify(data),
  }),

  // Reports
  getPdfUrl: (sessionId: number) => `${API_BASE}/reports/sessions/${sessionId}/pdf`,
  getCsvUrl: () => `${API_BASE}/reports/sessions/csv`,

  // Samapta Events & SIM
  getEvents: (params?: { status?: string }) => {
    const q = new URLSearchParams();
    if (params?.status) q.append('status_filter', params.status);
    return request<SamaptaEvent[]>(`/events${q.toString() ? `?${q.toString()}` : ''}`);
  },
  getEvent: (id: number) => request<SamaptaEvent>(`/events/${id}`),
  createEvent: (data: Partial<SamaptaEvent>) => request<SamaptaEvent>('/events', {
    method: 'POST',
    body: JSON.stringify(data),
  }),
  updateEvent: (id: number, data: Partial<SamaptaEvent>) => request<SamaptaEvent>(`/events/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  }),
  deleteEvent: (id: number) => request<void>(`/events/${id}`, {
    method: 'DELETE',
  }),
  getEventParticipants: (eventId: number, waveNumber?: number) => {
    const q = new URLSearchParams();
    if (waveNumber) q.append('wave_number', String(waveNumber));
    return request<EventParticipant[]>(`/events/${eventId}/participants${q.toString() ? `?${q.toString()}` : ''}`);
  },
  bulkInsertEventParticipants: (eventId: number, participants: BulkEventParticipantItem[]) =>
    request<BulkEventParticipantsResponse>(`/events/${eventId}/participants/bulk`, {
      method: 'POST',
      body: JSON.stringify({ participants }),
    }),
  removeParticipantFromEvent: (eventId: number, participantId: number) =>
    request<void>(`/events/${eventId}/participants/${participantId}`, {
      method: 'DELETE',
    }),
  distributeWaves: (
    eventId: number,
    data: { total_waves: number; strategy?: string; auto_chest_numbers?: boolean }
  ) =>
    request<{ message: string; total_participants: number; total_waves: number; distribution: any[] }>(
      `/events/${eventId}/distribute-waves`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  submitRunScore: (
    eventId: number,
    participantId: number,
    data: { run_laps: number; run_extra_meters: number; run_notes?: string }
  ) =>
    request<EventParticipant>(`/events/${eventId}/participants/${participantId}/run-score`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  configureWaveParticipants: (
    eventId: number,
    waveNumber: number,
    data: { participants: Array<{ participant_id: number; chest_number?: string; vest_color?: string }> }
  ) =>
    request<{ message: string; event_id: number; wave_number: number; saved_count: number }>(
      `/events/${eventId}/waves/${waveNumber}/configure-participants`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  startWaveRunLive: (
    eventId: number,
    waveNumber: number,
    data: {
      camera_id?: number;
      target_duration_seconds?: number;
      lap_cooldown_seconds?: number;
      confirm_frames_required?: number;
    }
  ) =>
    request<WaveRunLiveState>(`/events/${eventId}/waves/${waveNumber}/run-live/start`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  getWaveRunLiveState: (eventId: number, waveNumber: number) =>
    request<WaveRunLiveState>(`/events/${eventId}/waves/${waveNumber}/run-live/state`),
  controlWaveRunLive: (
    eventId: number,
    waveNumber: number,
    data: {
      action: 'pause' | 'resume' | 'stop' | 'adjust_lap' | 'set_extra_meters';
      participant_id?: number;
      delta?: number;
      extra_meters?: number;
    }
  ) =>
    request<WaveRunLiveState>(`/events/${eventId}/waves/${waveNumber}/run-live/control`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  saveWaveRunLive: (
    eventId: number,
    waveNumber: number,
    data: {
      participants?: Array<{ participant_id: number; run_laps: number; run_extra_meters: number }>;
      stop_session?: boolean;
    }
  ) =>
    request<{ message: string; event_id: number; wave_number: number; saved_count: number }>(
      `/events/${eventId}/waves/${waveNumber}/run-live/save`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    ),
  getEventRecap: (eventId: number) => request<EventRecapResponse>(`/events/${eventId}/recap`),
};

