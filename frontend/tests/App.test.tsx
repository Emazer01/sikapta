import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from '../src/App';

// Mock fetch globally
global.fetch = vi.fn().mockImplementation((url: string) => {
  if (url.includes('/api/health')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        status: 'healthy',
        database: { status: 'connected', dialect: 'postgresql' }
      }),
    });
  }
  if (url.includes('/api/dashboard/stats')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        total_participants: 4,
        total_sessions: 2,
        active_sessions_count: 0,
        total_reps_verified: 15,
        total_reps_detected: 18,
        online_cameras_count: 1,
        total_cameras_count: 1,
        active_default_model: 'mediapipe',
        backend_status: 'healthy',
        database_status: 'connected',
        database_dialect: 'postgresql',
        exercise_distribution: { pushup: 2, pullup: 0, situp: 0 },
        recent_sessions: [],
        rep_trend_daily: []
      }),
    });
  }
  if (url.includes('/api/settings')) {
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        default_vision_model: 'mediapipe',
        camera_target_fps: 30
      }),
    });
  }
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve([]),
  });
});

describe('SIKAPTA AI Frontend Integration', () => {
  it('renders application brand and navigation sidebar', async () => {
    render(<App />);

    expect(screen.getByText('SIKAPTA')).toBeInTheDocument();
    expect(screen.getByText('AI')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('Uji Langsung')).toBeInTheDocument();
    expect(screen.getByText('Data Peserta')).toBeInTheDocument();
    expect(screen.getByText('Manajemen Kamera')).toBeInTheDocument();
    expect(screen.getByText('Riwayat Asesmen')).toBeInTheDocument();
  });
});

