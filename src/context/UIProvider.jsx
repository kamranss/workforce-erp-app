import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { useEffect } from 'react';
import { invalidateApiCache } from '../api/httpClient.js';
import { useAuth } from './AuthProvider.jsx';

const UIContext = createContext({
  activeTab: 'home',
  setActiveTab: () => {},
  activeTabLabel: 'Home',
  allowedTabs: ['home'],
  openModal: () => {},
  closeModal: () => {},
  closeAllModals: () => {},
  dismissActiveModal: () => {},
  requestRefresh: () => {},
  refreshTick: 0,
  modalStack: [],
  showGlobalLoader: () => () => {},
  hideGlobalLoader: () => {},
  globalLoader: { visible: false, centerVisible: false, message: 'Loading...' },
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
  toast: { visible: false, message: '', type: 'info' },
  showToast: () => {},
  adminClockPreview: false,
  setAdminClockPreview: () => {},
  fabMenu: null,
  toggleFabMenu: () => {},
  closeFabMenu: () => {},
  triggerTabAction: () => {}
});

const TAB_LABELS = {
  home: 'Dashboard',
  clock: 'Clock',
  projects: 'Projects',
  finance: 'Admin',
  hours: 'Time',
  payments: 'Payments',
  profile: 'Profile'
};

export function UIProvider({ children }) {
  const auth = useAuth();
  const [activeTab, setActiveTabState] = useState('home');
  const [refreshTick, setRefreshTick] = useState(0);
  const [toast, setToast] = useState({ visible: false, message: '', type: 'info' });
  const [globalLoader, setGlobalLoader] = useState({ visible: false, centerVisible: false, message: 'Loading...' });
  const [theme, setThemeState] = useState('light');

  const role = String(auth.role || '').toLowerCase();
  const isAdmin = role === 'admin' || role === 'superadmin';

  const allowedTabs = useMemo(() => {
    if (!auth.isAuthed) return ['home'];
    if (isAdmin) return ['home', 'projects', 'finance', 'hours', 'profile'];
    return ['clock', 'hours', 'payments', 'profile'];
  }, [auth.isAuthed, isAdmin]);

  const setActiveTab = useCallback((nextTab) => {
    setActiveTabState((prev) => {
      const resolved = typeof nextTab === 'function' ? nextTab(prev) : nextTab;
      if (!allowedTabs.includes(resolved)) return prev;
      return resolved;
    });
  }, [allowedTabs]);

  useEffect(() => {
    if (allowedTabs.includes(activeTab)) return;
    if (!auth.isAuthed) {
      setActiveTabState('home');
      return;
    }
    setActiveTabState(isAdmin ? 'home' : 'clock');
  }, [activeTab, allowedTabs, auth.isAuthed, isAdmin]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.dataset.auth = auth.isAuthed ? 'user' : 'anon';
    document.body.dataset.role = String(auth.role || 'anon').toLowerCase();
  }, [auth.isAuthed, auth.role]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    let initialTheme = 'light';
    if (typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem('ab_theme');
      if (saved === 'light' || saved === 'dark') {
        initialTheme = saved;
      }
    }
    document.body.dataset.theme = initialTheme;
    setThemeState(initialTheme);
  }, []);

  const setTheme = useCallback((nextTheme) => {
    const resolved = nextTheme === 'dark' ? 'dark' : 'light';
    setThemeState(resolved);
    if (typeof document !== 'undefined') {
      document.body.dataset.theme = resolved;
    }
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('ab_theme', resolved);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const showToast = (message, type = 'info') => {
    if (!message) return;
    const raw = String(message || '');
    const inferredType = type === 'info'
      ? (/(fail|error|denied|invalid|unauthorized|forbidden|timeout|unable|blocked|required)/i.test(raw) ? 'error' : 'success')
      : type;
    const safeType = ['success', 'error', 'warning', 'info'].includes(inferredType) ? inferredType : 'info';
    setToast({ visible: true, message: raw, type: safeType });
    setTimeout(() => setToast({ visible: false, message: '', type: 'info' }), 2600);
  };

  const showGlobalLoader = (message = 'Loading...', _options = {}) => {
    setGlobalLoader({ visible: true, centerVisible: false, message: String(message || 'Loading...') });
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      setGlobalLoader({ visible: false, centerVisible: false, message: 'Loading...' });
    };
  };

  const hideGlobalLoader = () => {
    setGlobalLoader({ visible: false, centerVisible: false, message: 'Loading...' });
  };

  const requestRefresh = useCallback(() => {
    invalidateApiCache(['auth', 'dashboard', 'hours', 'projects', 'finance', 'reports', 'payments', 'users', 'expenses', 'bonuses', 'tasks', 'time-entries']);
    setRefreshTick((prev) => prev + 1);
  }, []);
  const triggerTabAction = (tabKey) => {
    if (tabKey !== activeTab) return;
    requestRefresh();
  };

  const value = useMemo(() => ({
    activeTab,
    setActiveTab,
    activeTabLabel: TAB_LABELS[activeTab] || 'Dashboard',
    allowedTabs,
    openModal: () => {},
    closeModal: () => {},
    closeAllModals: () => {},
    dismissActiveModal: () => {},
    requestRefresh,
    refreshTick,
    modalStack: [],
    showGlobalLoader,
    hideGlobalLoader,
    globalLoader,
    theme,
    setTheme,
    toggleTheme,
    toast,
    showToast,
    searchModal: { results: [], query: '' },
    openSearchModal: () => {},
    runSearchModalQuery: () => {},
    setSearchModalQuery: () => {},
    setSearchModalPage: () => {},
    selectSearchResult: () => {},
    useSearchCustomEntry: () => {},
    renderSearchItem: () => '',
    homePulseModal: { mode: '' },
    openHomePulseModal: () => {},
    closeHomePulseModal: () => {},
    adminClockPreview: false,
    setAdminClockPreview: () => {},
    fabMenu: null,
    toggleFabMenu: () => {},
    closeFabMenu: () => {},
    triggerTabAction
  }), [activeTab, allowedTabs, refreshTick, toast, globalLoader, theme, setTheme, toggleTheme, requestRefresh]);

  return <UIContext.Provider value={value}>{children}</UIContext.Provider>;
}

export function useUI() {
  return useContext(UIContext);
}
