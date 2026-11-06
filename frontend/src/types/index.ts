export interface Participant {
  id: number;
  participant_number: string;
  full_name: string;
  gender: 'L' | 'P';
  birth_date?: string;
  organization?: string;
  category: string;
  phone?: string;
  photo_url?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: number;
  name: string;
  camera_type: 'webcam' | 'rtsp';
  device_index?: number;
  rtsp_url?: string;
  rtsp_username?: string;
  resolution_w: number;
  resolution_h: number;
  target_fps: number;
  is_active: boolean;
  status: 'online' | 'offline' | 'error';
  last_seen?: string;
  created_at: string;
  updated_at: string;
}

export interface RuleProfile {
  id: number;
  name: string;
  exercise_type: 'pushup' | 'pullup' | 'situp' | 'shuttlerun';
  version: string;
  description?: string;
  is_default: boolean;
  config_json: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface RepEvent {
  id: number;
  session_id: number;
  rep_number: number;
  status: 'verified' | 'rejected';
  rejection_reason?: string;
  start_timestamp_ms?: number;
  end_timestamp_ms?: number;
  peak_angle?: number;
  min_angle?: number;
  confidence_avg?: number;
  feedback?: string;
  created_at: string;
}

export interface AssessmentSession {
  id: number;
  session_code: string;
  participant_id: number;
  camera_id?: number;
  rule_profile_id?: number;
  exercise_type: 'pushup' | 'pullup' | 'situp' | 'shuttlerun';
  model_used: 'mediapipe' | 'yolo';
  gender?: string;
  tolerance_deg?: number;
  source_type?: 'camera' | 'video_upload';
  video_path?: string;
  annotated_video_path?: string;
  annotated_video_url?: string;
  status: 'in_progress' | 'paused' | 'completed' | 'cancelled';
  start_time: string;
  end_time?: string;
  duration_seconds: number;
  detected_reps: number;
  verified_reps: number;
  rejected_reps: number;
  avg_fps: number;
  avg_latency_ms: number;
  examiner_notes?: string;
  created_at: string;
  updated_at: string;
  participant?: Participant;
  camera?: Camera;
  rep_events?: RepEvent[];
}

export interface ModelBenchmark {
  id: number;
  test_name: string;
  video_source: string;
  duration_seconds: number;
  total_frames: number;
  model_name: string;
  avg_fps: number;
  avg_latency_ms: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  precision_score: number;
  recall_score: number;
  f1_score: number;
  false_positives: number;
  false_negatives: number;
  detected_reps: number;
  verified_reps: number;
  invalid_pose_frames: number;
  test_date: string;
  created_at: string;
}

export interface DashboardStats {
  total_participants: number;
  total_sessions: number;
  active_sessions_count: number;
  total_reps_verified: number;
  total_reps_detected: number;
  online_cameras_count: number;
  total_cameras_count: number;
  active_default_model: string;
  backend_status: string;
  database_status: string;
  database_dialect: string;
  exercise_distribution: Record<string, number>;
  recent_sessions: AssessmentSession[];
  rep_trend_daily: Array<{
    date: string;
    verified: number;
    rejected: number;
    total: number;
  }>;
}

export interface LiveAssessmentStreamData {
  session_id: number;
  session_code: string;
  status: 'in_progress' | 'paused' | 'completed';
  exercise: string;
  model: string;
  gender?: string;
  tolerance_deg?: number;
  fps: number;
  latency_ms: number;
  current_angle: number;
  phase: string;
  detected_reps: number;
  verified_reps: number;
  rejected_reps: number;
  feedback: string;
  is_good_form: boolean;
  bar_y?: number | null;
  chin_y?: number | null;
  chin_passed_bar?: boolean | null;
  frame?: string;
  error?: string;
  is_completed?: boolean;
  final_time_seconds?: number | null;
  final_score?: number | null;
  preview?: boolean;
}

export interface SamaptaEvent {
  id: number;
  event_code: string;
  name: string;
  location: string;
  start_date: string;
  end_date?: string;
  description?: string;
  track_length_meters: number;
  total_waves: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  total_participants?: number;
}

export interface EventParticipant {
  id: number;
  event_id: number;
  participant_id: number;
  chest_number?: string;
  vest_color?: string;
  wave_number: number;
  group_name?: string;
  attendance_status: 'registered' | 'present' | 'absent' | 'completed';
  run_laps: number;
  run_extra_meters: number;
  run_total_distance_meters: number;
  run_score?: number;
  run_notes?: string;
  pullup_reps?: number;
  pullup_score?: number;
  pushup_reps?: number;
  pushup_score?: number;
  situp_reps?: number;
  situp_score?: number;
  shuttlerun_seconds?: number;
  shuttlerun_score?: number;
  created_at: string;
  updated_at: string;
  participant?: Participant;
}

export interface BulkEventParticipantItem {
  nrp: string;
  name?: string;
  gender?: 'L' | 'P';
  unit?: string;
  category?: string;
  phone?: string;
  chest_number?: string;
  vest_color?: string;
  wave_number?: number;
}

export interface BulkEventParticipantsResponse {
  total_processed: number;
  existing_participants_reused: number;
  new_participants_created: number;
  linked_to_event: number;
  failed_rows: number;
  errors: string[];
}

export interface ParticipantRecapItem {
  event_participant_id: number;
  participant_id: number;
  nrp: string;
  name: string;
  gender: string;
  unit?: string;
  category?: string;
  chest_number?: string;
  wave_number: number;
  run_laps: number;
  run_extra_meters: number;
  run_distance_meters: number;
  run_score?: number;
  run_predicate?: string;
  pullup_reps?: number;
  pullup_score?: number;
  pushup_reps?: number;
  pushup_score?: number;
  situp_reps?: number;
  situp_score?: number;
  shuttlerun_seconds?: number;
  shuttlerun_score?: number;
  samapta_a_score?: number;
  samapta_b_avg_score?: number;
  total_final_score?: number;
  final_predicate?: string;
}

export interface EventRecapResponse {
  event: SamaptaEvent;
  total_participants: number;
  waves: Array<{ wave_number: number; total: number; completed: number }>;
  participants: ParticipantRecapItem[];
}

export interface WaveRunCrossingLogItem {
  participant_id: number;
  chest_number: string;
  full_name: string;
  lap_number: number;
  total_distance_meters: number;
  run_score: number;
  time_str: string;
  source: 'camera_ai' | 'manual';
  vest_color?: string;
  vest_hex?: string;
  confidence?: number;
  timestamp: number;
}

export interface WaveRunnerLiveItem {
  event_participant_id: number;
  participant_id: number;
  nrp: string;
  full_name: string;
  gender: string;
  unit: string;
  chest_number: string;
  wave_number: number;
  run_laps: number;
  run_extra_meters: number;
  run_total_distance_meters: number;
  run_score: number;
  in_cooldown: boolean;
  cooldown_remaining_seconds: number;
  recently_detected: boolean;
  vest_color?: string | null;
  assigned_vest_color?: string | null;
  detected_vest_color?: string | null;
  vest_hex?: string | null;
  last_lap_time_str?: string | null;
  lap_history: WaveRunCrossingLogItem[];
}

export interface WaveParticipantConfigItem {
  participant_id: number;
  chest_number?: string;
  vest_color?: string;
}

export interface WaveParticipantConfigRequest {
  participants: WaveParticipantConfigItem[];
}

export interface WaveRunLiveState {
  event_id: number;
  event_name: string;
  wave_number: number;
  track_length_meters: number;
  status: 'idle' | 'in_progress' | 'paused' | 'completed';
  elapsed_seconds: number;
  target_duration_seconds: number;
  remaining_seconds: number;
  lap_cooldown_seconds: number;
  fps: number;
  participants: WaveRunnerLiveItem[];
  lap_crossing_log: WaveRunCrossingLogItem[];
  frame?: string;
  error?: string;
}


