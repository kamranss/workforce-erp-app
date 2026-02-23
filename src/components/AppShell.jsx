import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';
import BottomNav from './BottomNav.jsx';
import GlobalLoader from './GlobalLoader.jsx';
import Login from '../pages/Login.jsx';
import Home from '../pages/Home.jsx';
import Clock from '../pages/Clock.jsx';
import Projects from '../pages/Projects.jsx';
import Finance from '../pages/Finance.jsx';
import Hours from '../pages/Hours.jsx';
import Payments from '../pages/Payments.jsx';
import Profile from '../pages/Profile.jsx';
import Toast from './Toast.jsx';

export default function AppShell() {
  const auth = useAuth();
  const { activeTabLabel, toast, requestRefresh } = useUI();
  const PULL_START_ZONE_PX = 220;
  const PULL_TRIGGER_PX = 95;
  const PULL_MAX_PX = 140;
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const startYRef = useRef(null);
  const isDragActiveRef = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshLockRef = useRef(false);
  const refreshLockAtRef = useRef(0);
  const pullEligibleRef = useRef(false);

  const isAtScrollableTop = () => {
    if (typeof document === 'undefined') return true;
    const activePage = document.querySelector('.tab-page.active');
    if (activePage && typeof activePage.scrollTop === 'number') {
      if (activePage.scrollTop > 6) return false;
    }
    const appShell = document.querySelector('.app-shell');
    if (appShell && typeof appShell.scrollTop === 'number') {
      if (appShell.scrollTop > 6) return false;
    }
    const winTop = window?.scrollY || document.documentElement?.scrollTop || document.body?.scrollTop || 0;
    return winTop <= 6;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onActivity = (event) => {
      setNetworkBusy(Boolean(event?.detail?.active));
    };
    window.addEventListener('ab:network-activity', onActivity);
    return () => window.removeEventListener('ab:network-activity', onActivity);
  }, []);

  useEffect(() => () => {
  }, []);

  const beginPull = (startY) => {
    if (!auth.isAuthed) return;
    if (refreshLockRef.current && (Date.now() - refreshLockAtRef.current > 2500)) {
      refreshLockRef.current = false;
      setPullRefreshing(false);
    }
    if (pullRefreshing || refreshLockRef.current) return;
    startYRef.current = startY;
    pullEligibleRef.current = Boolean(startY != null && startY <= PULL_START_ZONE_PX && isAtScrollableTop());
    isDragActiveRef.current = Boolean(pullEligibleRef.current);
    if (!pullEligibleRef.current) return;
    setPulling(false);
    setPullDistance(0);
    pullDistanceRef.current = 0;
  };

  const movePull = (currentY) => {
    if (!auth.isAuthed) return;
    if (!pullEligibleRef.current) return;
    if (startYRef.current == null) return;
    const delta = Math.max(0, currentY - startYRef.current);
    if (delta <= 0) return;
    const nextDistance = Math.min(delta, PULL_MAX_PX);
    pullDistanceRef.current = nextDistance;
    setPulling(true);
    setPullDistance(nextDistance);
  };

  const endPull = () => {
    if (!auth.isAuthed) return;
    if (pullRefreshing || refreshLockRef.current) return;
    const shouldRefresh = pullEligibleRef.current && pullDistanceRef.current >= PULL_TRIGGER_PX;
    startYRef.current = null;
    pullEligibleRef.current = false;
    isDragActiveRef.current = false;
    setPulling(false);
    setPullDistance(0);
    pullDistanceRef.current = 0;
    if (!shouldRefresh) return;
    refreshLockRef.current = true;
    refreshLockAtRef.current = Date.now();
    setPullRefreshing(true);
    requestRefresh();
    setTimeout(() => {
      setPullRefreshing(false);
      refreshLockRef.current = false;
      refreshLockAtRef.current = 0;
    }, 900);
  };

  const cancelPull = () => {
    startYRef.current = null;
    pullEligibleRef.current = false;
    isDragActiveRef.current = false;
    setPulling(false);
    setPullDistance(0);
    pullDistanceRef.current = 0;
  };

  const onTouchStart = (event) => beginPull(event.touches?.[0]?.clientY ?? null);
  const onTouchMove = (event) => movePull(event.touches?.[0]?.clientY ?? startYRef.current);
  const onTouchEnd = () => endPull();
  const onTouchCancel = () => cancelPull();
  const onMouseDown = (event) => {
    if (event.button !== 0) return;
    beginPull(event.clientY);
  };
  const onMouseMove = (event) => {
    if (!isDragActiveRef.current) return;
    movePull(event.clientY);
  };
  const onMouseUp = () => {
    if (!isDragActiveRef.current) return;
    endPull();
  };
  const onMouseLeave = () => {
    if (!isDragActiveRef.current) return;
    cancelPull();
  };

  return (
    <div
      className="app-root legacy-root"
      onTouchStartCapture={onTouchStart}
      onTouchMoveCapture={onTouchMove}
      onTouchEndCapture={onTouchEnd}
      onTouchCancelCapture={onTouchCancel}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      <header className="app-header">
        <div className="wrap">
          <div className="brand">{auth.isAuthed ? activeTabLabel : 'Login'}</div>
        </div>
      </header>

      {(pulling || pullRefreshing) ? (
        <div className="pull-refresh-indicator" style={{ transform: `translateX(-50%) translateY(${Math.max(0, pullDistance - 38)}px)` }}>
          <div className={`loader-spinner${pullRefreshing ? ' loader-spinner-lg' : ''}`} />
          <span>{pullRefreshing ? 'Refreshing...' : 'Pull to refresh'}</span>
        </div>
      ) : null}
      {auth.isAuthed && networkBusy && !pullRefreshing ? (
        <div className="network-activity-indicator" aria-live="polite" aria-busy="true">
          <div className="loader-spinner" />
          <span>Loading...</span>
        </div>
      ) : null}

      <main className="app-shell">
        {!auth.bootstrapped && <div className="section card">Checking session...</div>}
        {auth.bootstrapped && !auth.isAuthed && <Login />}

        {auth.bootstrapped && auth.isAuthed && (
          <>
            <Home />
            <Clock />
            <Projects />
            <Finance />
            <Hours />
            <Payments />
            <Profile />
          </>
        )}

        {toast?.visible && <Toast />}
        <GlobalLoader />
      </main>

      {auth.isAuthed && <BottomNav />}
    </div>
  );
}
