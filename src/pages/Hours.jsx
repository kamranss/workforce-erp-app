import { useEffect, useMemo, useRef, useState } from 'react';
import { FiChevronDown, FiClock, FiEdit, FiEye, FiLoader, FiPlusCircle, FiTrash2, FiUser } from 'react-icons/fi';
import { getStoredToken } from '../api/httpClient.js';
import { listProjects } from '../api/projectsApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { adminAddHours, deleteTimeEntry, hoursReport, patchTimeEntry } from '../api/timeEntriesApi.js';
import { listUsers } from '../api/usersApi.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

const PRESETS = [
  { value: 'last15', label: 'Current 15 Days' },
  { value: 'previous15', label: 'Previous 15 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'custom', label: 'Custom' }
];

function resolveProjectLabel(entry) {
  const addressRaw = String(entry?.projectIn?.address?.raw || '').trim();
  if (addressRaw) return addressRaw;
  const description = String(entry?.projectIn?.description || '').trim();
  if (description) return description;
  return '-';
}

function truncateText(value, max = 44) {
  const text = String(value || '').trim();
  if (!text) return '-';
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}...`;
}

function toLocalDateTimeInputValue(value) {
  if (!value) return '';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '';
  const tzOffset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
}

function toIsoDateTimeOrUndefined(value) {
  if (!value) return undefined;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return undefined;
  return dt.toISOString();
}

function resolveUserLabel(entry) {
  const userObj = entry?.user || entry?.employee || {};
  const first =
    entry?.userName
    || userObj?.name
    || userObj?.firstName
    || entry?.name
    || '';
  const last =
    entry?.userSurname
    || userObj?.surname
    || userObj?.lastName
    || entry?.surname
    || '';
  const full = `${first} ${last}`.trim();
  if (full) return full;
  return String(entry?.userEmail || userObj?.email || entry?.email || entry?.userId || '').trim();
}

function entryDayKey(entry) {
  const source = entry?.clockInAt || entry?.clockOutAt;
  if (!source) return 'unknown';
  const dt = new Date(source);
  if (Number.isNaN(dt.getTime())) return 'unknown';
  return dt.toISOString().slice(0, 10);
}

function formatDayLabel(dayKey) {
  if (dayKey === 'unknown') return 'No Date';
  const dt = new Date(`${dayKey}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return dayKey;
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

function presetDisplayLabels() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();
  const thisMonthRef = new Date(y, m, 1);
  const prevMonthRef = new Date(y, m - 1, 1);
  const thisMonthName = thisMonthRef.toLocaleString(undefined, { month: 'long' });
  const thisMonthYear = thisMonthRef.getFullYear();
  const prevMonthName = prevMonthRef.toLocaleString(undefined, { month: 'long' });
  const prevMonthYear = prevMonthRef.getFullYear();
  const thisMonthLastDay = new Date(thisMonthRef.getFullYear(), thisMonthRef.getMonth() + 1, 0).getDate();
  const prevMonthLastDay = new Date(prevMonthRef.getFullYear(), prevMonthRef.getMonth() + 1, 0).getDate();
  const thisMonthFirstHalfLabel = `${thisMonthName} 1 - ${thisMonthName} 15`;
  const thisMonthSecondHalfLabel = `${thisMonthName} 16 - ${thisMonthName} ${thisMonthLastDay}`;
  const prevMonthSecondHalfLabel = `${prevMonthName} 16 - ${prevMonthName} ${prevMonthLastDay}`;
  return {
    last15: day <= 15 ? thisMonthFirstHalfLabel : thisMonthSecondHalfLabel,
    previous15: day <= 15 ? prevMonthSecondHalfLabel : thisMonthFirstHalfLabel,
    thisMonth: `${thisMonthName} ${thisMonthYear}`,
    previousMonth: `${prevMonthName} ${prevMonthYear}`,
    custom: 'Pick dates'
  };
}

function monthHalfRange(preset, now = new Date()) {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = now.getDate();
  const toIso = (dt) => dt.toISOString();

  if (preset === 'last15') {
    if (day <= 15) {
      const from = new Date(y, m, 1, 0, 0, 0, 0);
      const to = new Date(y, m, 15, 23, 59, 59, 999);
      return { from: toIso(from), to: toIso(to) };
    }
    const monthEnd = new Date(y, m + 1, 0).getDate();
    const from = new Date(y, m, 16, 0, 0, 0, 0);
    const to = new Date(y, m, monthEnd, 23, 59, 59, 999);
    return { from: toIso(from), to: toIso(to) };
  }

  if (preset === 'previous15') {
    if (day <= 15) {
      const prevMonthEnd = new Date(y, m, 0).getDate();
      const from = new Date(y, m - 1, 16, 0, 0, 0, 0);
      const to = new Date(y, m - 1, prevMonthEnd, 23, 59, 59, 999);
      return { from: toIso(from), to: toIso(to) };
    }
    const from = new Date(y, m, 1, 0, 0, 0, 0);
    const to = new Date(y, m, 15, 23, 59, 59, 999);
    return { from: toIso(from), to: toIso(to) };
  }

  return { from: undefined, to: undefined };
}

function toIsoStart(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T00:00:00.000`).toISOString();
}

function toIsoEnd(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function entryMinutes(row) {
  return toNumber(row?.minutesWorked ?? row?.workedMinutes ?? row?.minutes, 0);
}

function entryEarned(row) {
  return toNumber(row?.earnedAmount ?? row?.earned ?? row?.amount, 0);
}

function entryHours(row) {
  return entryMinutes(row) / 60;
}

function isEditedEntry(entry) {
  return entry?.edited === true;
}

function resolveSummary(payload, items = []) {
  const source =
    payload?.summary
    || payload?.data?.summary
    || payload?.totals
    || payload?.data?.totals
    || null;

  const fallbackMinutes = items.reduce((sum, row) => sum + entryMinutes(row), 0);
  const fallbackEarned = items.reduce((sum, row) => sum + entryEarned(row), 0);
  const fallbackEntries = items.length;
  const sourceMinutes = toNumber(source?.totalMinutes, 0);
  const sourceHours = toNumber(source?.totalHours, 0);
  const sourceEarned = toNumber(source?.totalEarned, 0);
  const sourceEntries = toNumber(source?.totalEntries, 0);

  const sourceLooksEmpty = source && sourceMinutes === 0 && sourceHours === 0 && sourceEarned === 0 && sourceEntries === 0;
  const fallbackHasData = fallbackMinutes > 0 || fallbackEarned > 0 || fallbackEntries > 0;
  if (sourceLooksEmpty && fallbackHasData) {
    return {
      totalEntries: fallbackEntries,
      totalMinutes: fallbackMinutes,
      totalHours: fallbackMinutes / 60,
      totalEarned: fallbackEarned
    };
  }

  return {
    totalEntries: toNumber(source?.totalEntries, fallbackEntries),
    totalMinutes: toNumber(source?.totalMinutes, fallbackMinutes),
    totalHours: toNumber(source?.totalHours, fallbackMinutes / 60),
    totalEarned: toNumber(source?.totalEarned, fallbackEarned)
  };
}

export default function Hours() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();

  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState({ totalHours: 0, totalEarned: 0, totalEntries: 0, totalMinutes: 0 });
  const [rangeInfo, setRangeInfo] = useState({ label: '-' });
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const [rangePreset, setRangePreset] = useState('last15');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const [userOptions, setUserOptions] = useState([]);
  const [userIdFilter, setUserIdFilter] = useState('');
  const [projectOptions, setProjectOptions] = useState([]);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualUserPickerOpen, setManualUserPickerOpen] = useState(false);
  const [manualProjectPickerOpen, setManualProjectPickerOpen] = useState(false);
  const [manualUserSearch, setManualUserSearch] = useState('');
  const [manualProjectSearch, setManualProjectSearch] = useState('');
  const [manualForm, setManualForm] = useState({
    userId: '',
    projectId: '',
    clockInAt: '',
    clockOutAt: '',
    notes: ''
  });
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [viewEntry, setViewEntry] = useState(null);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [deleteBusyId, setDeleteBusyId] = useState('');
  const [editForm, setEditForm] = useState({
    id: '',
    clockInAt: '',
    clockOutAt: '',
    notes: ''
  });

  const sentinelRef = useRef(null);
  const lastRefreshRef = useRef(0);
  const skipNextFilterReloadRef = useRef(false);
  const reportRequestLockRef = useRef(false);

  const roleLower = String(role || '').toLowerCase();
  const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';
  const isActive = activeTab === 'hours';
  const presetLabels = useMemo(() => presetDisplayLabels(), []);
  const groupedItems = useMemo(() => {
    const map = new Map();
    for (const entry of items) {
      const key = entryDayKey(entry);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => {
        if (a[0] === 'unknown') return 1;
        if (b[0] === 'unknown') return -1;
        return a[0] < b[0] ? 1 : -1;
      })
      .map(([dayKey, dayItems]) => ({
        dayKey,
        dayLabel: formatDayLabel(dayKey),
        count: dayItems.length,
        totalMinutes: dayItems.reduce((sum, item) => sum + entryMinutes(item), 0),
        items: dayItems
      }));
  }, [items]);
  const selectedManualUser = userOptions.find((user) => String(user?.id || '') === String(manualForm.userId || ''));
  const selectedManualProject = projectOptions.find((project) => String(project?.id || '') === String(manualForm.projectId || ''));
  const manualUserSearchText = String(manualUserSearch || '').trim().toLowerCase();
  const manualProjectSearchText = String(manualProjectSearch || '').trim().toLowerCase();
  const manualFilteredUsers = userOptions.filter((user) => {
    if (!manualUserSearchText) return true;
    const text = `${user?.name || ''} ${user?.surname || ''} ${user?.email || ''}`.toLowerCase();
    return text.includes(manualUserSearchText);
  });
  const manualFilteredProjects = projectOptions.filter((project) => {
    if (!manualProjectSearchText) return true;
    const text = `${project?.description || ''} ${project?.address?.raw || ''} ${project?.id || ''}`.toLowerCase();
    return text.includes(manualProjectSearchText);
  });
  const selectedManualUserLabel = selectedManualUser
    ? `${selectedManualUser.name || ''} ${selectedManualUser.surname || ''}`.trim() || selectedManualUser.email || selectedManualUser.id
    : '';
  const selectedManualProjectLabel = selectedManualProject
    ? (selectedManualProject.description || selectedManualProject.address?.raw || selectedManualProject.id || '')
    : '';

  const loadUsers = async () => {
    if (!isAdmin || !getStoredToken()) return;
    try {
      const res = await listUsers({ limit: 50 });
      const rows = Array.isArray(res?.items) ? res.items : [];
      const filtered = rows.filter((u) => String(u?.role || '').toLowerCase() === 'user' && u?.isActive !== false);
      setUserOptions(filtered);
    } catch (err) {
      showToast(err?.message || 'Failed to load users.');
    }
  };

  const loadProjects = async () => {
    if (!isAdmin || !getStoredToken()) return;
    try {
      const res = await listProjects({ limit: 100 });
      const rows = Array.isArray(res?.items) ? res.items : [];
      setProjectOptions(rows);
    } catch (err) {
      showToast(err?.message || 'Failed to load projects.');
    }
  };

  const loadReport = async ({ reset = false } = {}) => {
    if (!getStoredToken()) return;
    if (reportRequestLockRef.current) return;
    if (loading) return;
    if (!reset && !cursor) return;

    if (rangePreset === 'custom' && (!customFrom || !customTo)) {
      setError('Choose start and end dates for custom range.');
      return;
    }

    if (reset) {
      setLoading(true);
      setError('');
    } else {
      setLoadMoreBusy(true);
    }

    reportRequestLockRef.current = true;
    try {
      const isHalfPreset = rangePreset === 'last15' || rangePreset === 'previous15';
      const halfRange = isHalfPreset ? monthHalfRange(rangePreset) : { from: undefined, to: undefined };
      const query = {
        rangePreset: isHalfPreset ? 'custom' : rangePreset,
        limit: 30,
        cursor: reset ? undefined : cursor,
        userId: isAdmin && userIdFilter ? userIdFilter : undefined,
        from: rangePreset === 'custom' ? toIsoStart(customFrom) : halfRange.from,
        to: rangePreset === 'custom' ? toIsoEnd(customTo) : halfRange.to
      };

      const data = await hoursReport(query);
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setCursor(data?.nextCursor || null);
      const nextSummary = resolveSummary(data, nextItems);
      if (reset) setSummary(nextSummary);
      else if (data?.summary || data?.data?.summary || data?.totals || data?.data?.totals) setSummary(nextSummary);
      if (reset) {
        if (isHalfPreset) {
          setRangeInfo({ preset: rangePreset, label: presetLabels[rangePreset] || '-' });
        } else {
          setRangeInfo(data?.range || data?.data?.range || { label: '-' });
        }
      }
      if (reset) setHasLoaded(true);
    } catch (err) {
      const message = err?.message || 'Failed to load hours report.';
      setError(message);
      showToast(message);
    } finally {
      reportRequestLockRef.current = false;
      setLoading(false);
      setLoadMoreBusy(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadUsers();
    loadProjects();
  }, [isAdmin]);

  useEffect(() => {
    if (!isActive || hasLoaded) return;
    const stop = showGlobalLoader ? showGlobalLoader('Loading hours...', { center: true }) : () => {};
    loadReport({ reset: true }).finally(() => {
      skipNextFilterReloadRef.current = true;
      stop();
    });
  }, [isActive, hasLoaded]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (skipNextFilterReloadRef.current) {
      skipNextFilterReloadRef.current = false;
      return;
    }
    loadReport({ reset: true });
  }, [hasLoaded, isAdmin, userIdFilter, rangePreset, customFrom, customTo]);

  useEffect(() => {
    if (!isActive) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    loadReport({ reset: true });
  }, [isActive, refreshTick]);

  // Safety guard: if state says "loading" but no request is in-flight, clear stale spinners.
  useEffect(() => {
    if (reportRequestLockRef.current) return;
    if (loading) setLoading(false);
    if (loadMoreBusy) setLoadMoreBusy(false);
  }, [loading, loadMoreBusy]);

  useEffect(() => {
    if (!isActive) return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting || !cursor || loading) return;
      loadReport();
    }, { rootMargin: '200px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [isActive, cursor, loading]);

  const openManualEntryModal = () => {
    setManualForm({
      userId: userOptions[0]?.id || '',
      projectId: projectOptions[0]?.id || '',
      clockInAt: '',
      clockOutAt: '',
      notes: ''
    });
    setManualUserPickerOpen(false);
    setManualProjectPickerOpen(false);
    setManualUserSearch('');
    setManualProjectSearch('');
    setManualModalOpen(true);
  };

  const saveManualEntry = async () => {
    if (!isAdmin) return;
    if (manualSaving) return;
    if (!manualForm.userId || !manualForm.projectId || !manualForm.clockInAt || !manualForm.clockOutAt) {
      showToast('User, Project, Start, and End are required.');
      return;
    }
    const clockInAtIso = toIsoDateTimeOrUndefined(manualForm.clockInAt);
    const clockOutAtIso = toIsoDateTimeOrUndefined(manualForm.clockOutAt);
    if (!clockInAtIso || !clockOutAtIso) {
      showToast('Start and End date/time are invalid.');
      return;
    }
    if (new Date(clockOutAtIso).getTime() < new Date(clockInAtIso).getTime()) {
      showToast('End time must be after start time.');
      return;
    }
    setManualSaving(true);
    try {
      const body = {
        userId: manualForm.userId,
        projectId: manualForm.projectId,
        clockInAt: clockInAtIso,
        clockOutAt: clockOutAtIso,
        notes: manualForm.notes || undefined
      };
      await adminAddHours(body);
      setManualModalOpen(false);
      showToast('Hours added successfully.');
      await loadReport({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Failed to add hours.');
    } finally {
      setManualSaving(false);
    }
  };

  const openViewEntryModal = (entry) => {
    if (!entry?.id) return;
    setViewEntry(entry);
    setViewModalOpen(true);
  };

  const openEditEntryModal = (entry) => {
    const item = entry || {};
    const entryId = String(item?.id || '');
    if (!entryId) return;
    setEditLoading(false);
    setEditForm({
      id: entryId,
      clockInAt: toLocalDateTimeInputValue(item?.clockInAt),
      clockOutAt: toLocalDateTimeInputValue(item?.clockOutAt),
      notes: String(item?.notes || '')
    });
    setEditModalOpen(true);
  };

  const saveEditedEntry = async () => {
    if (!isAdmin || editSaving || !editForm.id) return;
    setEditSaving(true);
    try {
      const body = {
        clockInAt: toIsoDateTimeOrUndefined(editForm.clockInAt),
        clockOutAt: toIsoDateTimeOrUndefined(editForm.clockOutAt),
        notes: editForm.notes || undefined
      };
      await patchTimeEntry(editForm.id, body);
      setEditModalOpen(false);
      showToast('Time entry updated.');
      await loadReport({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Failed to update entry.');
    } finally {
      setEditSaving(false);
    }
  };

  const removeEntry = async (entryId) => {
    if (roleLower !== 'superadmin') return;
    if (!entryId) return;
    if (!confirm('Soft delete this time entry?')) return;
    setDeleteBusyId(String(entryId));
    try {
      await deleteTimeEntry(entryId);
      showToast('Time entry deleted.');
      if (viewEntry?.id === entryId) {
        setViewModalOpen(false);
      }
      await loadReport({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Failed to delete entry.');
    } finally {
      setDeleteBusyId('');
    }
  };

  if (!isActive) return <div id="hoursPage" className="tab-page hidden" />;

  return (
    <div id="hoursPage" className="tab-page active">
      <div className="section card">
        <div className="hours-report-hero">
          <div className="hours-report-meta">
            <div className="hours-report-kicker">Hours Report</div>
            <h3 className="hours-report-range">{rangeInfo?.label || '-'}</h3>
          </div>
          <div className="hours-report-icon" aria-hidden="true">
            <FiClock />
          </div>
        </div>

        <div className="prj-filter-group" style={{ marginBottom: 10 }}>
          <div className="prj-select-wrap">
            <select
              className="hours-filter-select"
              value={rangePreset}
              onChange={(e) => setRangePreset(e.target.value)}
              aria-label="Time filter"
            >
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>
                  {preset.label} ({presetLabels[preset.value]})
                </option>
              ))}
            </select>
            <span className="prj-select-icon" aria-hidden="true">
              <FiChevronDown />
            </span>
          </div>
        </div>

        {rangePreset === 'custom' ? (
          <div className="prj-filter-group" style={{ marginBottom: 10 }}>
            <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
          </div>
        ) : null}

        {isAdmin ? (
          <div className="prj-filter-group" style={{ marginBottom: 10 }}>
            <div className="prj-select-wrap">
              <select className="hours-filter-select" value={userIdFilter} onChange={(e) => setUserIdFilter(e.target.value)} aria-label="User filter">
                <option value="">All active users</option>
                {userOptions.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} {user.surname} ({user.email})
                  </option>
                ))}
              </select>
              <span className="prj-select-icon" aria-hidden="true">
                <FiChevronDown />
              </span>
            </div>
          </div>
        ) : null}

        {isAdmin ? (
          <div className="row" style={{ gap: 8, marginBottom: 10 }}>
            <button type="button" className="ghost btn-tone-primary" onClick={openManualEntryModal}>
              <FiPlusCircle />
              Add Hours
            </button>
          </div>
        ) : null}

        <div className="home-personal-grid">
          <div className="metric">
            <span className="metric-label">Total Hours</span>
            <span className="metric-value">{Number(summary?.totalHours || 0).toFixed(2)}</span>
          </div>
          <div className="metric">
            <span className="metric-label">Total Earned</span>
            <span className="metric-value">${Number(summary?.totalEarned || 0).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <div className="section card">
        <div className="home-card-head">
          <h3>{isAdmin ? 'Users Hours' : 'My Hours'}</h3>
          <FiUser />
        </div>

        {error ? <div className="muted">{error}</div> : null}

        <div className="hours-list">
          {groupedItems.map((group) => (
            <div key={group.dayKey} className="day-group">
              <div className="day-header" style={{ cursor: 'default' }}>
                <div className="day-title">{group.dayLabel}</div>
                <div className="muted">{group.count} entries | {(group.totalMinutes / 60).toFixed(2)} hrs</div>
              </div>
              <div className="day-body">
                {group.items.map((entry) => {
                  const userLabel = resolveUserLabel(entry) || '-';
                  const projectLabel = resolveProjectLabel(entry);
                  const edited = isEditedEntry(entry);
                  const editedTooltip = 'Edited';
                  return (
                    <div key={entry.id} className={`hours-card time-card hours-card-compact${edited ? ' is-edited' : ''}`}>
                    <div className="hours-card-head">
                      <div className="hours-emp-wrap">
                        <FiUser />
                        <div className="hours-title-wrap">
                          <strong className="hours-emp" title={userLabel}>{userLabel}</strong>
                          <div className="hours-user-line" title={projectLabel}>{truncateText(projectLabel, 48)}</div>
                        </div>
                      </div>
                      {edited ? <span className="hours-edited-badge" title={editedTooltip} aria-label={editedTooltip}>Edited</span> : null}
                    </div>
                    <div className="hours-entry-grid">
                      <div className="hours-entry-row two">
                        <div className="hours-chip">
                          <span>Clock In</span>
                          <strong>{entry.clockInAt ? new Date(entry.clockInAt).toLocaleString() : '-'}</strong>
                        </div>
                        <div className="hours-chip">
                          <span>Clock Out</span>
                          <strong>{entry.clockOutAt ? new Date(entry.clockOutAt).toLocaleString() : 'Open'}</strong>
                        </div>
                      </div>
                      <div className="hours-entry-row two">
                        <div className="hours-chip">
                          <span>Total Time</span>
                          <strong>{entryHours(entry).toFixed(2)} h</strong>
                        </div>
                        <div className="hours-chip">
                          <span>Earned</span>
                          <strong>${entryEarned(entry).toFixed(2)}</strong>
                        </div>
                      </div>
                      {isAdmin ? (
                        <div className="hours-entry-row one">
                          <div className="row" style={{ gap: 8 }}>
                            <button
                              type="button"
                              className="ghost btn-tone-info btn-with-spinner"
                              onClick={() => openViewEntryModal(entry)}
                            >
                              <FiEye />
                              <span>View</span>
                            </button>
                            <button
                              type="button"
                              className="ghost btn-tone-warning btn-with-spinner"
                              onClick={() => openEditEntryModal(entry)}
                            >
                              <FiEdit />
                              <span>Edit</span>
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {!items.length && !loading ? <div className="muted">No hours found for selected filters.</div> : null}
        {loading && !items.length ? (
          <div className="section card" style={{ textAlign: 'center' }}>
            <FiLoader className="btn-spinner" style={{ width: 24, height: 24, marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>Loading hours data...</div>
          </div>
        ) : null}
        {!loading && cursor ? (
          <button type="button" onClick={() => loadReport()} disabled={loadMoreBusy} className="btn-tone-neutral btn-with-spinner">
            {loadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
            <span>{loadMoreBusy ? 'Loading...' : 'Load more'}</span>
          </button>
        ) : null}

        <div ref={sentinelRef} />
      </div>

      <SimpleModal
        open={manualModalOpen}
        onClose={() => {
          if (manualSaving) return;
          setManualUserPickerOpen(false);
          setManualProjectPickerOpen(false);
          setManualUserSearch('');
          setManualProjectSearch('');
          setManualModalOpen(false);
        }}
        title="Add Hours"
        size="md"
      >
        <div className="modal-form-grid">
          <input
            className="full"
            placeholder="Search user"
            value={manualUserPickerOpen ? manualUserSearch : selectedManualUserLabel}
            onFocus={() => {
              setManualProjectPickerOpen(false);
              setManualUserPickerOpen(true);
              if (!manualUserPickerOpen) setManualUserSearch('');
            }}
            onClick={() => {
              setManualProjectPickerOpen(false);
              setManualUserPickerOpen((prev) => !prev);
              if (!manualUserPickerOpen) setManualUserSearch('');
            }}
            onChange={(e) => {
              setManualProjectPickerOpen(false);
              setManualUserPickerOpen(true);
              setManualUserSearch(e.target.value);
            }}
          />
          {manualUserPickerOpen ? (
            <div className="full fin-expense-project-picker" style={{ maxHeight: 180 }}>
              {manualFilteredUsers.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`fin-expense-project-item${String(manualForm.userId || '') === String(user.id) ? ' active' : ''}`}
                  onClick={() => {
                    setManualForm((prev) => ({ ...prev, userId: String(user.id) }));
                    setManualUserPickerOpen(false);
                  }}
                >
                  <span className="fin-expense-status none">USER</span>
                  <span className="fin-expense-project-label">{`${user.name || ''} ${user.surname || ''}`.trim() || user.email || user.id}</span>
                </button>
              ))}
              {!manualFilteredUsers.length ? <div className="muted fin-expense-project-empty">No users found.</div> : null}
            </div>
          ) : null}
          <input
            className="full"
            placeholder="Search project"
            value={manualProjectPickerOpen ? manualProjectSearch : selectedManualProjectLabel}
            onFocus={() => {
              setManualUserPickerOpen(false);
              setManualProjectPickerOpen(true);
              if (!manualProjectPickerOpen) setManualProjectSearch('');
            }}
            onClick={() => {
              setManualUserPickerOpen(false);
              setManualProjectPickerOpen((prev) => !prev);
              if (!manualProjectPickerOpen) setManualProjectSearch('');
            }}
            onChange={(e) => {
              setManualUserPickerOpen(false);
              setManualProjectPickerOpen(true);
              setManualProjectSearch(e.target.value);
            }}
          />
          {manualProjectPickerOpen ? (
            <div className="full fin-expense-project-picker" style={{ maxHeight: 180 }}>
              {manualFilteredProjects.map((project) => (
                <button
                  key={project.id}
                  type="button"
                  className={`fin-expense-project-item${String(manualForm.projectId || '') === String(project.id) ? ' active' : ''}`}
                  onClick={() => {
                    setManualForm((prev) => ({ ...prev, projectId: String(project.id) }));
                    setManualProjectPickerOpen(false);
                  }}
                >
                  <span className="fin-expense-status none">PRJ</span>
                  <span className="fin-expense-project-label">{project.description || project.address?.raw || project.id}</span>
                </button>
              ))}
              {!manualFilteredProjects.length ? <div className="muted fin-expense-project-empty">No projects found.</div> : null}
            </div>
          ) : null}
          <input className="full" type="datetime-local" placeholder="Clock in date & time" value={manualForm.clockInAt} onChange={(e) => setManualForm((prev) => ({ ...prev, clockInAt: e.target.value }))} />
          <input className="full" type="datetime-local" placeholder="Clock out date & time" value={manualForm.clockOutAt} onChange={(e) => setManualForm((prev) => ({ ...prev, clockOutAt: e.target.value }))} />
          <input className="full" placeholder="Notes (optional)" value={manualForm.notes} onChange={(e) => setManualForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setManualModalOpen(false)} disabled={manualSaving}>Cancel</button>
            <button type="button" className="btn-tone-primary btn-with-spinner" onClick={saveManualEntry} disabled={manualSaving}>
              {manualSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{manualSaving ? 'Saving...' : 'Add Hours'}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal open={viewModalOpen} onClose={() => setViewModalOpen(false)} title="Time Entry Details" size="md">
        <div className="modal-form-grid hours-view-grid">
          <div className="full muted">Entry ID: {viewEntry?.id || '-'}</div>
          <div className="hours-chip">
            <span>Clock In</span>
            <strong>{viewEntry?.clockInAt ? new Date(viewEntry.clockInAt).toLocaleString() : '-'}</strong>
          </div>
          <div className="hours-chip">
            <span>Clock Out</span>
            <strong>{viewEntry?.clockOutAt ? new Date(viewEntry.clockOutAt).toLocaleString() : 'Open'}</strong>
          </div>
          <div className="hours-chip">
            <span>Project In</span>
            <strong>{viewEntry?.projectIn?.address?.raw || viewEntry?.projectIn?.description || viewEntry?.projectIdIn || '-'}</strong>
          </div>
          <div className="hours-chip">
            <span>Project Out</span>
            <strong>{viewEntry?.projectOut?.address?.raw || viewEntry?.projectOut?.description || viewEntry?.projectIdOut || '-'}</strong>
          </div>
          <div className="hours-chip full">
            <span>Notes</span>
            <strong>{viewEntry?.notes || '-'}</strong>
          </div>
          <div className="full row" style={{ justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setViewModalOpen(false)}>Close</button>
            {roleLower === 'superadmin' ? (
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={() => removeEntry(viewEntry?.id)}
                disabled={deleteBusyId === String(viewEntry?.id || '')}
              >
                {deleteBusyId === String(viewEntry?.id || '') ? <FiLoader className="btn-spinner" /> : <FiTrash2 />}
                <span>{deleteBusyId === String(viewEntry?.id || '') ? 'Deleting...' : 'Delete Entry'}</span>
              </button>
            ) : null}
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={editModalOpen}
        onClose={() => {
          if (editSaving) return;
          setEditModalOpen(false);
        }}
        title="Edit Time Entry"
        size="md"
      >
        <div className="modal-form-grid">
          {editLoading ? <div className="full muted">Loading entry...</div> : null}
          <input type="datetime-local" value={editForm.clockInAt} onChange={(e) => setEditForm((prev) => ({ ...prev, clockInAt: e.target.value }))} />
          <input type="datetime-local" value={editForm.clockOutAt} onChange={(e) => setEditForm((prev) => ({ ...prev, clockOutAt: e.target.value }))} />
          <input className="full" placeholder="Notes" value={editForm.notes} onChange={(e) => setEditForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setEditModalOpen(false)} disabled={editSaving}>Cancel</button>
            <button type="button" className="btn-tone-primary btn-with-spinner" onClick={saveEditedEntry} disabled={editSaving}>
              {editSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{editSaving ? 'Saving...' : 'Update Entry'}</span>
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
