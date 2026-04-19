import { useEffect, useRef, useState } from 'react';
import { FiClock, FiLoader, FiMapPin, FiPlayCircle } from 'react-icons/fi';
import { checkIn, checkOut, myOpenEntry } from '../api/timeEntriesApi.js';
import { myTasks, updateMyAssignedTaskStatus } from '../api/tasksApi.js';
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

function pushClockDebugLog(entry) {
  if (typeof window === 'undefined') return;
  const key = '__abClockPayloadLogs';
  const prev = Array.isArray(window[key]) ? window[key] : [];
  window[key] = [...prev.slice(-19), entry];
}

function logClockPayload(kind, payload, geoDetails) {
  const now = new Date();
  const entry = {
    kind,
    requestTimestampLocal: now.toString(),
    requestTimestampUtc: now.toISOString(),
    payload,
    geoDetails
  };
  console.info(`[clock] ${kind} payload`, entry);
  pushClockDebugLog(entry);
}

function normalizeTaskStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'ongoing') return 'progress';
  if (key === 'created' || key === 'progress' || key === 'done') return key;
  return 'created';
}

function formatTaskStatus(value) {
  const key = normalizeTaskStatus(value);
  if (key === 'progress') return 'In Progress';
  if (key === 'done') return 'Done';
  return 'Created';
}

function taskStatusTone(value) {
  const key = normalizeTaskStatus(value);
  if (key === 'done') return 'Completed';
  if (key === 'progress') return 'Started';
  return 'Waiting';
}

function matchesUserTaskFilter(task, filter) {
  const status = normalizeTaskStatus(task?.status);
  if (filter === 'created') return status === 'created';
  if (filter === 'progress') return status === 'progress';
  if (filter === 'done') return status === 'done';
  return status === 'created' || status === 'progress';
}

function resolveTaskAddress(task) {
  return String(
    task?.project?.address?.raw
    || task?.projectAddressRaw
    || task?.projectAddress
    || ''
  ).trim();
}

const TASK_STATUS_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'progress', label: 'Progress' },
  { value: 'done', label: 'Done' }
];

async function getGeo(preferPrecise, options = {}) {
  const { allowCached = true } = options;
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
        { enableHighAccuracy: false, timeout: 12000, maximumAge: allowCached ? 30000 : 0 }
      ]
    : [
        { enableHighAccuracy: false, timeout: 12000, maximumAge: allowCached ? 30000 : 0 },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
      ];

  let lastError;
  for (const options of strategies) {
    try {
      const pos = await getPosition(options);
      const capturedAt = Number(pos?.timestamp || Date.now());
      return {
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        accuracyMeters: Number(pos?.coords?.accuracy || 0) || undefined,
        capturedAtLocal: new Date(capturedAt).toString(),
        capturedAtUtc: new Date(capturedAt).toISOString(),
        isCachedAllowed: Boolean(allowCached)
      };
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
  const [assignedTasks, setAssignedTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('all');
  const [taskCursor, setTaskCursor] = useState(null);
  const [taskLoadBusy, setTaskLoadBusy] = useState(false);
  const [taskLoadMoreBusy, setTaskLoadMoreBusy] = useState(false);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [taskStatusModalOpen, setTaskStatusModalOpen] = useState(false);
  const [taskStatusTarget, setTaskStatusTarget] = useState(null);
  const [taskStatusValue, setTaskStatusValue] = useState('created');
  const [taskError, setTaskError] = useState('');
  const [busy, setBusy] = useState(false);
  const [busyAction, setBusyAction] = useState('');
  const [msg, setMsg] = useState('');
  const [preferPreciseLocation] = useState(readGeoPreference);
  const [geoPermissionState, setGeoPermissionState] = useState('prompt');
  const [loadingData, setLoadingData] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const taskLoadLockRef = useRef(false);

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

  const loadAssignedTasks = async ({ reset = false, fresh = false, force = false } = {}) => {
    if (!force && (taskLoadLockRef.current || taskLoadBusy || taskLoadMoreBusy)) return;
    if (!reset && !taskCursor) return;
    taskLoadLockRef.current = true;
    if (reset) setTaskLoadBusy(true);
    else setTaskLoadMoreBusy(true);

    try {
      const response = await myTasks({
        limit: 20,
        cursor: reset ? undefined : taskCursor,
        includeDone: taskFilter === 'done' ? true : false
      }, { cache: false });
      const rows = Array.isArray(response?.items)
        ? response.items
        : (Array.isArray(response?.tasks) ? response.tasks : []);
      const filtered = rows.filter((task) => matchesUserTaskFilter(task, taskFilter));
      setAssignedTasks((prev) => (reset ? filtered : [...prev, ...filtered]));
      setTaskCursor(response?.nextCursor || null);
      setTaskError('');
    } catch (err) {
      const statusCode = Number(err?.status || err?.response?.status || 0);
      if (statusCode === 401 || statusCode === 403) {
        setTaskError('Session/permission issue while loading assigned tasks. Please login again.');
      } else {
        setTaskError(err?.message || 'Failed to load assigned tasks.');
      }
    } finally {
      taskLoadLockRef.current = false;
      setTaskLoadBusy(false);
      setTaskLoadMoreBusy(false);
    }
  };

  const openTaskStatusModal = (task) => {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return;
    setTaskStatusTarget(task);
    setTaskStatusValue(normalizeTaskStatus(task?.status));
    setTaskStatusModalOpen(true);
  };

  const updateAssignedTaskStatus = async () => {
    const taskId = String(taskStatusTarget?.id || '').trim();
    if (!taskId || !taskStatusValue) return;
    setTaskUpdatingId(taskId);
    const previousRows = assignedTasks;
    setAssignedTasks((prev) => prev.map((row) => (
      String(row?.id || '') === taskId ? { ...row, status: taskStatusValue } : row
    )));
    try {
      await updateMyAssignedTaskStatus(taskId, { status: taskStatusValue });
      showToast('Task status updated.', 'success');
      setTaskStatusModalOpen(false);
      setTaskStatusTarget(null);
      await loadAssignedTasks({ reset: true, fresh: true, force: true });
    } catch (err) {
      setAssignedTasks(previousRows);
      const statusCode = Number(err?.status || err?.response?.status || 0);
      if (statusCode === 401 || statusCode === 403) {
        setTaskError('You are not authorized to update this task.');
      }
      showToast(err?.message || 'Task status update failed.', 'error');
    } finally {
      setTaskUpdatingId('');
    }
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
    Promise.all([
      loadData(),
      loadAssignedTasks({ reset: true })
    ])
      .catch((err) => setMsg(err?.message || 'Failed to load clock data.'))
      .finally(stop);
  }, [isActive, isUser, hasLoaded]);

  useEffect(() => {
    if (!isUser) return;
    getGeoPermissionState().then(setGeoPermissionState).catch(() => setGeoPermissionState('prompt'));
  }, [isUser]);

  useEffect(() => {
    if (!isActive || !isUser) return;
    Promise.all([
      loadData(),
      loadAssignedTasks({ reset: true })
    ]).catch((err) => setMsg(err?.message || 'Failed to refresh clock data.'));
  }, [refreshTick]);

  useEffect(() => {
    if (!isActive || !isUser || !hasLoaded) return;
    loadAssignedTasks({ reset: true }).catch(() => {});
  }, [taskFilter]);

  const onCheckIn = async () => {
    setBusy(true);
    setBusyAction('check-in');
    setMsg('Checking in...');

    try {
      const geoSnapshot = await getGeo(preferPreciseLocation);
      const geoIn = { lat: geoSnapshot.lat, lng: geoSnapshot.lng };
      const payload = { geoIn };
      logClockPayload('check-in', payload, geoSnapshot);
      await checkIn(payload);
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
        const special = 'No nearby check-in eligible project found.';
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
      const geoSnapshot = await getGeo(preferPreciseLocation, { allowCached: false });
      const geoOut = { lat: geoSnapshot.lat, lng: geoSnapshot.lng };
      const addrOut = String(openEntry?.projectIn?.address?.raw || openEntry?.projectIn?.description || '').trim();
      const payload = { geoOut };
      if (addrOut) payload.addrOut = addrOut;
      logClockPayload('check-out', payload, geoSnapshot);
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

      <div className="section card home-tasks">
        <div className="home-card-head">
          <div>
            <div className="eyebrow">My Work</div>
            <h3>My Assigned Tasks</h3>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <div className="pill">{assignedTasks.length}</div>
          </div>
        </div>
        <div className="prj-filter-group prj-time-filter home-task-status-row">
          <button type="button" className={`prj-time-btn${taskFilter === 'all' ? ' active' : ''}`} onClick={() => setTaskFilter('all')}>All</button>
          <button type="button" className={`prj-time-btn${taskFilter === 'created' ? ' active' : ''}`} onClick={() => setTaskFilter('created')}>Created</button>
          <button type="button" className={`prj-time-btn${taskFilter === 'progress' ? ' active' : ''}`} onClick={() => setTaskFilter('progress')}>In Progress</button>
          <button type="button" className={`prj-time-btn${taskFilter === 'done' ? ' active' : ''}`} onClick={() => setTaskFilter('done')}>Done</button>
        </div>
        {taskError ? (
          <div className="task-empty">
            <div>{taskError}</div>
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                className="btn-tone-neutral"
                onClick={() => loadAssignedTasks({ reset: true, fresh: true, force: true })}
              >
                Retry
              </button>
            </div>
          </div>
        ) : null}
        {!taskError && !taskLoadBusy && !assignedTasks.length ? (
          <div className="task-empty">No tasks assigned to you right now.</div>
        ) : null}
        <div className="task-list">
          {assignedTasks.map((task) => {
            const dueDateText = task?.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-';
            const description = String(task?.description || '').trim();
            const address = resolveTaskAddress(task);
            const statusTone = taskStatusTone(task?.status);
            return (
              <div key={task.id} className="prj-item" data-status={statusTone}>
                <div className="prj-row1">
                  <div className="prj-title">{task?.title || 'Untitled task'}</div>
                  <div className="prj-status-inline">
                    <span className={`pill ${statusTone}`}>{formatTaskStatus(task?.status)}</span>
                  </div>
                </div>
                {description ? <div className="prj-time-muted">{description}</div> : null}
                <div className="prj-time-muted"><strong>Address:</strong> {address || '-'}</div>
                <div className="prj-time-muted"><strong>Due:</strong> {dueDateText}</div>
                <div className="prj-actions">
                  <div className="prj-action-buttons">
                    <button
                      type="button"
                      className="ghost btn-tone-success btn-with-spinner"
                      onClick={() => openTaskStatusModal(task)}
                      disabled={taskUpdatingId === String(task?.id || '')}
                    >
                      {taskUpdatingId === String(task?.id || '') ? <FiLoader className="btn-spinner" /> : null}
                      <span>{taskUpdatingId === String(task?.id || '') ? 'Updating...' : 'Status'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        {!taskLoadBusy && taskCursor ? (
          <button
            type="button"
            onClick={() => loadAssignedTasks()}
            disabled={taskLoadMoreBusy}
            className="btn-tone-neutral btn-with-spinner"
          >
            {taskLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
            <span>{taskLoadMoreBusy ? 'Loading...' : 'Load more tasks'}</span>
          </button>
        ) : null}
      </div>

      <SimpleModal
        open={taskStatusModalOpen}
        onClose={() => {
          if (taskUpdatingId) return;
          setTaskStatusModalOpen(false);
          setTaskStatusTarget(null);
        }}
        title="Change Task Status"
        size="sm"
      >
        <div className="modal-form-grid">
          <div className="full muted">{taskStatusTarget?.title || 'Task'}</div>
          <select
            className="full"
            value={taskStatusValue}
            onChange={(e) => setTaskStatusValue(e.target.value)}
            disabled={Boolean(taskUpdatingId)}
          >
            {TASK_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="ghost btn-tone-neutral"
              onClick={() => {
                setTaskStatusModalOpen(false);
                setTaskStatusTarget(null);
              }}
              disabled={Boolean(taskUpdatingId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-tone-success btn-with-spinner"
              onClick={updateAssignedTaskStatus}
              disabled={Boolean(taskUpdatingId)}
            >
              {taskUpdatingId ? <FiLoader className="btn-spinner" /> : null}
              <span>{taskUpdatingId ? 'Updating...' : 'Update Status'}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

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
