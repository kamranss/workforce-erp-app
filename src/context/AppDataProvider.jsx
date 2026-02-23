'use client';

import { createContext, useContext, useMemo, useState } from 'react';

const AppDataContext = createContext({
  preloadStatus: 'ready',
  preloadError: '',
  otpVerified: true,
  setOtpVerified: () => {},
  preload: async () => null,
  refresh: async () => null,
  refreshDashboard: async () => null,
  invalidateDashboard: () => {},
  refreshTimeStatus: async () => null,
  fetchHours: async () => null,
  dashboard: null,
  dashboardLoading: false,
  projects: [],
  hoursByKey: {},
  hoursEmployees: []
});

export function AppDataProvider({ children }) {
  const [otpVerified, setOtpVerified] = useState(true);

  const value = useMemo(() => ({
    preloadStatus: 'ready',
    preloadError: '',
    otpVerified,
    setOtpVerified,
    preload: async () => null,
    refresh: async () => null,
    refreshDashboard: async () => null,
    invalidateDashboard: () => {},
    refreshTimeStatus: async () => null,
    fetchHours: async () => null,
    dashboard: null,
    dashboardLoading: false,
    projects: [],
    hoursByKey: {},
    hoursEmployees: []
  }), [otpVerified]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  return useContext(AppDataContext);
}
