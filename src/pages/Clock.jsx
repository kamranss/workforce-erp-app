import { useEffect, useState } from 'react';
import { FiClock, FiLoader, FiMapPin, FiPlayCircle } from 'react-icons/fi';
import { checkIn, checkOut, myOpenEntry } from '../api/timeEntriesApi.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

async function getGeoPermissionState() {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) return 'prompt';
  try {
    const status = await navigator.permissions.query({ name: 'geolocation' });
    return status?.state || 'prompt';
  } catch {
    return 'prompt';
  }
}

function readGeoPreference() {
  if (typeof localStorage === 'undefined') return true;
  const raw = localStorage.getItem('ab_geo_precise');
  if (raw === '0') return false;
  if (raw === '1') return true;
  return true;
}

function getPosition(options) {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, options);
  });
}

async function getGeo(preferPrecise) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    throw new Error('Geolocation unavailable on this device.');
  }

  const permission = await getGeoPermissionState();
  if (permission === 'denied') {
    throw new Error('Location access is blocked. Enable location permission in browser/device settings.');
  }

  const strategies = preferPrecise
    ? [
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 }
      ]
    : [
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 30000 },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      ];

  let lastError;
  for (const options of strategies) {
    try {
      const pos = await getPosition(options);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError?.code === 1) {
    throw new Error('Location permission denied. Please allow access and try again.');
  }
  throw new Error('Unable to get your location. Check GPS/device location settings and retry.');
}

export default function Clock() {
  const { activeTab, showToast, refreshTick, showGlobalLoader, requestRefresh } = useUI();
  const { role } = useAuth();
  const [openEntry, setOpenEntry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [msg, setMsg] = useState('');
  const [preferPreciseLocation] = useState(readGeoPreference);
  const [geoPermissionState, setGeoPermissionState] = useState('prompt');
  const [loadingData, setLoadingData] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const isActive = activeTab === 'clock';
  const roleLower = String(role || '').toLowerCase();
  const isUser = roleLower === 'user' || roleLower === 'employee';

  const resolveOpenEntry = (open) => {
    if (!open) return null;
    if (open?.entry && typeof open.entry === 'object') return open.entry;
    if (open?.data?.entry && typeof open.data.entry === 'object') return open.data.entry;
    if (open?.data && typeof open.data === 'object' && (open.data.clockInAt || open.data.id)) return open.data;
    if (typeof open === 'object' && (open.clockInAt || open.id)) return open;
    return null;
  };

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoadingData(true);
    try {
      const open = await myOpenEntry();
      const nextOpenEntry = resolveOpenEntry(open);
      setOpenEntry(nextOpenEntry);
      setMsg('');
      setHasLoaded(true);
    } finally {
      if (!silent) setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!isActive || !isUser || hasLoaded) return;
    const stop = showGlobalLoader ? showGlobalLoader('Loading clock...', { center: true }) : () => {};
    loadData().catch((err) => setMsg(err?.message || 'Failed to load clock data.')).finally(stop);
  }, [isActive, isUser, hasLoaded]);

  useEffect(() => {
    if (!isUser) return;
    getGeoPermissionState().then(setGeoPermissionState).catch(() => setGeoPermissionState('prompt'));
  }, [isUser]);

  useEffect(() => {
    if (!isActive || !isUser) return;
    loadData().catch((err) => setMsg(err?.message || 'Failed to refresh clock data.'));
  }, [refreshTick]);

  const onCheckIn = async () => {
    setBusy(true);
    setBusyAction('check-in');
    setMsg('Checking in...');

    try {
      const geo = await getGeo(preferPreciseLocation);
      await checkIn({ geoIn: geo });
      setMsg('Check-in successful.');
      showToast('Check-in successful.', 'success');
      try {
        await loadData({ silent: true });
      } catch (refreshErr) {
        setMsg('Check-in successful. Refreshing latest shift data failed, please reopen Clock tab.');
        showToast(refreshErr?.message || 'Could not refresh clock status after check-in.', 'warning');
      }
      requestRefresh();
      return true;
    } catch (err) {
      const errCode = String(err?.code || err?.details?.code || '').toUpperCase();
      const errMsg = String(err?.message || '');
      const noMatch = errCode === 'NO_MATCHING_PROJECT' || errMsg.toUpperCase().includes('NO_MATCHING_PROJECT');
      if (noMatch) {
        const special = 'No nearby ongoing project found.';
        setMsg(special);
        showToast(special, 'warning');
        return false;
      }
      setMsg(err?.message || 'Check-in failed.');
      showToast(err?.message || 'Check-in failed.', 'error');
      return false;
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  const onCheckOut = async () => {
    setBusy(true);
    setBusyAction('check-out');
    setMsg('Checking out...');

    try {
      const geo = await getGeo(preferPreciseLocation);
      const payload = { geoOut: geo };
      const projectOutId = String(openEntry?.projectIdIn || '').trim();
      if (projectOutId) payload.projectIdOut = projectOutId;
      await checkOut(payload);
      setMsg('Check-out successful.');
      showToast('Check-out successful.', 'success');
      try {
        await loadData({ silent: true });
      } catch (refreshErr) {
        setMsg('Check-out successful. Refreshing latest shift data failed, please reopen Clock tab.');
        showToast(refreshErr?.message || 'Could not refresh clock status after check-out.', 'warning');
      }
      requestRefresh();
      return true;
    } catch (err) {
      setMsg(err?.message || 'Check-out failed.');
      showToast(err?.message || 'Check-out failed.', 'error');
      return false;
    } finally {
      setBusy(false);
      setBusyAction('');
    }
  };

  if (!isActive) return <div id="clockPage" className="tab-page hidden" />;
  if (!isUser) return <div id="clockPage" className="tab-page active section card">Clock-in page is available for users only.</div>;

  return (
    <div id="clockPage" className="tab-page active">
      <div id="homeClockCard" className="section card" data-clocked-in={openEntry ? '1' : '0'}>
        <div className="clock-hero">
          <div>
            <div className="clock-label">Shift Status</div>
            <div id="clkBadge">{openEntry ? 'Clocked In' : 'Clocked Out'}</div>
          </div>
          <div className="clock-msg">
            {openEntry ? `Open since ${new Date(openEntry.clockInAt).toLocaleString()}` : 'No open entry'}
          </div>
        </div>
      </div>

      <div className="section card">
        <div className="home-card-head">
          <div>
            <div className="eyebrow">Location</div>
            <h3>Check In / Check Out</h3>
          </div>
          <FiMapPin />
        </div>
        <div className="page-actions">
          <button className="ghost btn-tone-success" type="button" onClick={onCheckIn} disabled={busy || !!openEntry}>
            <FiPlayCircle />
            Check In
          </button>
          <button className="ghost btn-tone-warning" type="button" onClick={onCheckOut} disabled={busy || !openEntry}>
            <FiClock />
            Check Out
          </button>
        </div>
        <div className="clock-msg" style={{ marginTop: 8 }}>
          <FiClock style={{ verticalAlign: 'middle', marginRight: 6 }} />
          Location permission: {geoPermissionState}.
        </div>
      </div>

      {msg ? <div className="section card muted">{msg}</div> : null}

      {busy ? (
        <div className="section card" style={{ textAlign: 'center' }}>
          <FiLoader className="btn-spinner" style={{ width: 26, height: 26, marginBottom: 8 }} />
          <div style={{ fontWeight: 600 }}>{busyAction === 'check-out' ? 'Check-out in progress...' : 'Check-in in progress...'}</div>
        </div>
      ) : null}

      {loadingData && !busy && !hasLoaded ? (
        <div className="section card" style={{ textAlign: 'center' }}>
          <FiLoader className="btn-spinner" style={{ width: 24, height: 24, marginBottom: 8 }} />
          <div style={{ fontWeight: 600 }}>Loading clock data...</div>
        </div>
      ) : null}
    </div>
  );
}
