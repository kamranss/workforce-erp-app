import { useEffect, useState } from 'react';
import { FiClock, FiLoader, FiMapPin, FiPlayCircle } from 'react-icons/fi';
import { listOngoingProjects } from '../api/projectsApi.js';
import { checkIn, checkOut, myOpenEntry } from '../api/timeEntriesApi.js';
import { myEarnings } from '../api/reportsApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
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
  const [projects, setProjects] = useState([]);
  const [projectIdIn, setProjectIdIn] = useState('');
  const [projectIdOut, setProjectIdOut] = useState('');
  const [checkInNeedsManualProject, setCheckInNeedsManualProject] = useState(false);
  const [openEntry, setOpenEntry] = useState(null);
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [msg, setMsg] = useState('');
  const [balance, setBalance] = useState(null);
  const [manualProjectModalOpen, setManualProjectModalOpen] = useState(false);
  const [preferPreciseLocation] = useState(readGeoPreference);
  const [geoPermissionState, setGeoPermissionState] = useState('prompt');
  const [loadingData, setLoadingData] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const isActive = activeTab === 'clock';
  const roleLower = String(role || '').toLowerCase();
  const isUser = roleLower === 'user' || roleLower === 'employee';

  const eligibleStatus = new Set(['waiting', 'ongoing', 'finished']);
  const loadOngoingProjects = async () => {
    const ongoing = await listOngoingProjects({ limit: 20 });
    const items = (ongoing?.items || []).filter((project) => {
      const status = String(project?.status || '').toLowerCase();
      return eligibleStatus.has(status);
    });
    setProjects(items);
    setProjectIdOut((prev) => prev || items[0]?.id || '');
    return items;
  };

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoadingData(true);
    try {
      const [items, open, earnings] = await Promise.all([
        loadOngoingProjects(),
        myOpenEntry(),
        myEarnings({ year: String(new Date().getFullYear()) })
      ]);

      if (checkInNeedsManualProject && !projectIdIn) {
        setProjectIdIn(items[0]?.id || '');
      }
      setOpenEntry(open?.entry || null);
      setBalance(earnings?.pendingTotal ?? null);
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

  const onCheckIn = async (projectIdOverride = '', forceAuto = false) => {
    setBusy(true);
    setBusyAction('check-in');
    setMsg('Checking in...');

    try {
      const geo = await getGeo(preferPreciseLocation);
      const payload = {
        geoIn: geo
      };
      const projectIdToUse = String(projectIdOverride || projectIdIn || '').trim();
      if (checkInNeedsManualProject && !forceAuto) {
        if (!projectIdToUse) {
          setMsg('Select a project to continue check-in.');
          return false;
        }
        payload.projectIdIn = projectIdToUse;
      }

      await checkIn(payload);
      setMsg('Check-in successful.');
      showToast('Check-in successful.', 'success');
      setCheckInNeedsManualProject(false);
      setProjectIdIn('');
      setManualProjectModalOpen(false);
      await loadData({ silent: true });
      requestRefresh();
      return true;
    } catch (err) {
      const errCode = String(err?.code || err?.details?.code || '').toUpperCase();
      const errMsg = String(err?.message || '');
      const noMatch = errCode === 'NO_MATCHING_PROJECT' || errMsg.toUpperCase().includes('NO_MATCHING_PROJECT');
      if (noMatch) {
        const latest = await loadOngoingProjects().catch(() => []);
        if (!projectIdIn) {
          setProjectIdIn(latest?.[0]?.id || '');
        }
        setCheckInNeedsManualProject(true);
        setManualProjectModalOpen(true);
        const special = 'No nearby ongoing project found. Please select project manually.';
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
    const projectOutId = String(openEntry?.projectIdIn || projectIdOut || projects[0]?.id || '').trim();
    if (!projectOutId) {
      setMsg('No available project for check-out.');
      showToast('No available project for check-out.');
      return false;
    }

    setBusy(true);
    setBusyAction('check-out');
    setMsg('Checking out...');

    try {
      const geo = await getGeo(preferPreciseLocation);
      await checkOut({
        projectIdOut: projectOutId,
        geoOut: geo
      });
      setMsg('Check-out successful.');
      showToast('Check-out successful.', 'success');
      await loadData({ silent: true });
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
          <div className="clock-id">
            <label>Pending Balance</label>
            <div>{balance == null ? '-' : `$${Number(balance).toFixed(2)}`}</div>
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
          <button className="ghost btn-tone-success" type="button" onClick={() => {
            setCheckInNeedsManualProject(false);
            setProjectIdIn('');
            setManualProjectModalOpen(false);
            onCheckIn('', true);
          }} disabled={busy || !!openEntry}>
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

      <SimpleModal open={manualProjectModalOpen} onClose={() => setManualProjectModalOpen(false)} title="Manual Project Selection" size="sm">
        <div className="modal-form-grid">
          {checkInNeedsManualProject ? (
            <>
            <div className="full muted">Available Projects</div>
            <select className="full" value={projectIdIn} onChange={(event) => setProjectIdIn(event.target.value)} disabled={busy || !!openEntry}>
              <option value="">Select check-in project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.description} ({project.status || 'active'})
                </option>
              ))}
            </select>
            </>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setManualProjectModalOpen(false)}>Cancel</button>
            <button type="button" onClick={async () => {
              const ok = await onCheckIn(projectIdIn);
              if (ok) setManualProjectModalOpen(false);
            }} disabled={busy || !!openEntry} className="btn-tone-primary btn-with-spinner">
              {busy ? <FiLoader className="btn-spinner" /> : null}
              <span>{busy ? 'Submitting...' : 'Confirm Check In'}</span>
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
