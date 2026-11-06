import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MainLayout } from './components/layout/MainLayout';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { EventsManagementPage } from './features/events/EventsManagementPage';
import { LiveAssessmentPage } from './features/assessments/LiveAssessmentPage';
import { ParticipantsPage } from './features/participants/ParticipantsPage';
import { CamerasPage } from './features/cameras/CamerasPage';
import { AssessmentHistoryPage } from './features/assessments/AssessmentHistoryPage';
import { BenchmarkPage } from './features/benchmark/BenchmarkPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<MainLayout />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/events" element={<EventsManagementPage />} />
            <Route path="/assessment" element={<LiveAssessmentPage />} />
            <Route path="/participants" element={<ParticipantsPage />} />
            <Route path="/cameras" element={<CamerasPage />} />
            <Route path="/history" element={<AssessmentHistoryPage />} />
            <Route path="/benchmark" element={<BenchmarkPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
};

export default App;
