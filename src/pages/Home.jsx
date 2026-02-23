import { useEffect, useRef, useState } from 'react';
import { FiActivity, FiChevronDown, FiClock, FiFilePlus, FiLoader, FiTrendingUp, FiUser } from 'react-icons/fi';
import { dashboardOpenEntries, dashboardToday } from '../api/dashboardApi.js';
import { listProjects } from '../api/projectsApi.js';
import { projectUserBreakdown } from '../api/reportsApi.js';
import { createTask, deleteTask, getTask, listTasks, myTasks, updateTask } from '../api/tasksApi.js';
import { patchTimeEntry } from '../api/timeEntriesApi.js';
import { listUsers } from '../api/usersApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return `$${num(value).toFixed(2)}`;
}

function fmtDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString();
}

function toLocalDateTimeInputValue(value) {
  const dt = value ? new Date(value) : new Date();
  if (Number.isNaN(dt.getTime())) return '';
  const tzOffset = dt.getTimezoneOffset() * 60000;
  const local = new Date(dt.getTime() - tzOffset);
  return local.toISOString().slice(0, 16);
}

function statusClass(value) {
  const key = normalizeTaskStatus(value);
  if (key === 'done') return 'done';
  if (key === 'progress') return 'progress';
  return 'created';
}

function formatTaskStatus(value) {
  const key = normalizeTaskStatus(value);
  if (key === 'progress') return 'Progress';
  if (key === 'done') return 'Done';
  return 'Created';
}

function normalizeTaskStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'ongoing') return 'progress';
  if (key === 'progress' || key === 'done' || key === 'created') return key;
  return 'created';
}

function nextTaskStatus(value) {
  const current = normalizeTaskStatus(value);
  if (current === 'created') return 'progress';
  if (current === 'progress') return 'done';
  return 'created';
}

export default function Home() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();
  const [today, setToday] = useState(null);
  const [openEntries, setOpenEntries] = useState([]);
  const [projectBreakdown, setProjectBreakdown] = useState([]);
  const [openUsersById, setOpenUsersById] = useState({});
  const [openProjectsById, setOpenProjectsById] = useState({});
  const [homeTasks, setHomeTasks] = useState([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState('');
  const [taskForm, setTaskForm] = useState({ title: '', description: '', projectId: '', status: 'created' });
  const [taskProjects, setTaskProjects] = useState([]);
  const [taskProjectsCursor, setTaskProjectsCursor] = useState(null);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const [taskCursor, setTaskCursor] = useState(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskIncludeDone, setTaskIncludeDone] = useState(false);
  const [taskLoadBusy, setTaskLoadBusy] = useState(false);
  const [taskLoadMoreBusy, setTaskLoadMoreBusy] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState(null);
  const [taskViewingId, setTaskViewingId] = useState('');
  const [openEntriesExpanded, setOpenEntriesExpanded] = useState(false);
  const [openEntriesModalOpen, setOpenEntriesModalOpen] = useState(false);
  const [forcedEntry, setForcedEntry] = useState(null);
  const [forcedClockOutAt, setForcedClockOutAt] = useState('');
  const [forcedNotes, setForcedNotes] = useState('');
  const [forcedCheckoutBusy, setForcedCheckoutBusy] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [taskDeletingId, setTaskDeletingId] = useState('');
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);
  const lastRefreshRef = useRef(0);
  const skipNextFilterReloadRef = useRef(false);
  const dashboardLoadLockRef = useRef(false);
  const taskLoadLockRef = useRef(false);
  const taskProjectsLoadLockRef = useRef(false);

  const isActive = activeTab === 'home';
  const roleLower = String(role || '').toLowerCase();
  const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';
  const canDeleteTasks = roleLower === 'superadmin';

  const refreshDashboardAdminData = async () => {
    if (dashboardLoadLockRef.current) return;
    dashboardLoadLockRef.current = true;
    try {
    const [todayData, openData, breakdownData] = await Promise.all([
      dashboardToday(),
      dashboardOpenEntries({ limit: 20 }),
      projectUserBreakdown({ limit: 20 })
    ]);
    setToday(todayData || null);
    setOpenEntries(openData?.items || []);
    setProjectBreakdown(breakdownData?.items || []);
    } finally {
      dashboardLoadLockRef.current = false;
    }
  };

  const hydrateOpenEntryLookups = async (entries) => {
    const rows = Array.isArray(entries) ? entries : [];
    if (!rows.length) return;
    const hasReadable = rows.some((entry) => {
      const fullName = `${entry?.user?.name || ''} ${entry?.user?.surname || ''}`.trim();
      const projectLabel = String(entry?.projectIn?.address?.raw || entry?.projectIn?.description || entry?.projectDescription || entry?.projectAddressRaw || '').trim();
      return Boolean(fullName || entry?.userName || entry?.userSurname || projectLabel);
    });
    if (hasReadable) return;

    const needUserIds = Array.from(new Set(rows.map((entry) => String(entry?.userId || '')).filter(Boolean)))
      .filter((id) => !openUsersById[id]);
    const needProjectIds = Array.from(new Set(rows.map((entry) => String(entry?.projectIdIn || '')).filter(Boolean)))
      .filter((id) => !openProjectsById[id]);
    if (!needUserIds.length && !needProjectIds.length) return;

    try {
      const [usersRes, projectsRes] = await Promise.all([
        needUserIds.length ? listUsers({ limit: 20 }) : Promise.resolve({ items: [] }),
        needProjectIds.length ? listProjects({ limit: 20 }) : Promise.resolve({ items: [] })
      ]);
      const nextUsers = { ...openUsersById };
      for (const user of (usersRes?.items || [])) {
        if (user?.id) nextUsers[String(user.id)] = user;
      }
      const nextProjects = { ...openProjectsById };
      for (const project of (projectsRes?.items || [])) {
        if (project?.id) nextProjects[String(project.id)] = project;
      }
      setOpenUsersById(nextUsers);
      setOpenProjectsById(nextProjects);
    } catch {
      // Keep raw IDs fallback if lookup endpoints fail.
    }
  };

  const getOpenEntryUserLabelResolved = (entry) => {
    const fullName = `${entry?.user?.name || ''} ${entry?.user?.surname || ''}`.trim();
    if (fullName) return fullName;
    if (entry?.userName || entry?.userSurname) return `${entry.userName || ''} ${entry.userSurname || ''}`.trim();
    if (entry?.userEmail) return entry.userEmail;
    const lookupUser = openUsersById[String(entry?.userId || '')];
    if (lookupUser) {
      const fromLookup = `${lookupUser?.name || ''} ${lookupUser?.surname || ''}`.trim();
      if (fromLookup) return fromLookup;
      if (lookupUser?.email) return lookupUser.email;
    }
    return entry?.userId ? `User ${entry.userId}` : 'Unknown user';
  };

  const getOpenEntryProjectLabelResolved = (entry) => {
    if (entry?.projectIn?.address?.raw) return entry.projectIn.address.raw;
    if (entry?.projectIn?.description) return entry.projectIn.description;
    if (entry?.projectAddressRaw) return entry.projectAddressRaw;
    if (entry?.projectDescription) return entry.projectDescription;
    const lookupProject = openProjectsById[String(entry?.projectIdIn || '')];
    if (lookupProject?.address?.raw) return lookupProject.address.raw;
    if (lookupProject?.description) return lookupProject.description;
    return entry?.projectIdIn ? `Project ${entry.projectIdIn}` : 'No project';
  };

  const loadHomeTasks = async ({ reset = false, fresh = false, force = false } = {}) => {
    if (!force && (taskLoadBusy || taskLoadLockRef.current)) return;
    if (!reset && !taskCursor) return;
    taskLoadLockRef.current = true;
    if (reset) {
      setTaskLoadBusy(true);
    } else {
      setTaskLoadMoreBusy(true);
    }
    try {
      const res = isAdmin
        ? await listTasks({
          limit: 20,
          cursor: reset ? undefined : taskCursor,
          status: taskStatusFilter || undefined
        }, { cache: fresh ? false : undefined })
        : await myTasks({
          limit: 20,
          cursor: reset ? undefined : taskCursor,
          includeDone: taskIncludeDone ? true : undefined
        }, { cache: fresh ? false : undefined });
      const nextItems = Array.isArray(res?.items) ? res.items : [];
      setHomeTasks((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setTaskCursor(res?.nextCursor || null);
    } finally {
      taskLoadLockRef.current = false;
      setTaskLoadBusy(false);
      setTaskLoadMoreBusy(false);
    }
  };

  const loadTaskProjects = async ({ reset = false } = {}) => {
    if (taskProjectsLoading || taskProjectsLoadLockRef.current) return;
    if (!reset && !taskProjectsCursor) return;
    taskProjectsLoadLockRef.current = true;
    setTaskProjectsLoading(true);
    try {
      const res = await listProjects({
        limit: reset ? 5 : 20,
        cursor: reset ? undefined : taskProjectsCursor
      });
      const items = Array.isArray(res?.items) ? res.items : [];
      const nextCursor =
        res?.nextCursor
        || res?.cursor
        || res?.next
        || res?.nextPageCursor
        || res?.pagination?.nextCursor
        || null;
      setTaskProjects((prev) => {
        const next = reset ? items : [...prev, ...items];
        const seen = new Set();
        return next.filter((project) => {
          const id = String(project?.id || '');
          if (!id || seen.has(id)) return false;
          seen.add(id);
          return true;
        });
      });
      setTaskProjectsCursor(nextCursor);
    } catch (err) {
      showToast(err?.message || 'Failed to load projects for task.');
    } finally {
      taskProjectsLoadLockRef.current = false;
      setTaskProjectsLoading(false);
    }
  };

  useEffect(() => {
    if (!isActive) return;
    if (hasLoaded) return;

    let mounted = true;
    setError('');
    const stop = showGlobalLoader ? showGlobalLoader('Loading home...', { center: true }) : () => {};

    if (isAdmin) {
      refreshDashboardAdminData()
        .then(() => {
          if (!mounted) return;
          loadHomeTasks({ reset: true }).catch((err) => {
            if (!mounted) return;
            setError(err?.message || 'Failed to load tasks.');
          });
        })
        .catch((err) => {
          if (!mounted) return;
          setError(err?.message || 'Failed to load dashboard.');
        })
        .finally(() => {
          stop();
          if (!mounted) return;
          skipNextFilterReloadRef.current = true;
          setHasLoaded(true);
        });
    } else {
      loadHomeTasks({ reset: true })
        .then(() => {})
        .catch((err) => {
          if (!mounted) return;
          setError(err?.message || 'Failed to load tasks.');
        })
        .finally(() => {
          stop();
          if (!mounted) return;
          skipNextFilterReloadRef.current = true;
          setHasLoaded(true);
        });
    }

    return () => {
      mounted = false;
      stop();
    };
  }, [isActive, isAdmin, hasLoaded]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (skipNextFilterReloadRef.current) {
      skipNextFilterReloadRef.current = false;
      return;
    }
    setError('');
    if (isAdmin) {
      refreshDashboardAdminData().catch((err) => setError(err?.message || 'Failed to load dashboard.'));
      loadHomeTasks({ reset: true }).catch((err) => setError(err?.message || 'Failed to load tasks.'));
      return;
    }
    loadHomeTasks({ reset: true }).catch((err) => setError(err?.message || 'Failed to load tasks.'));
  }, [hasLoaded, isAdmin, taskStatusFilter, taskIncludeDone]);

  useEffect(() => {
    if (!isAdmin || !openEntries.length) return;
    hydrateOpenEntryLookups(openEntries);
  }, [isAdmin, openEntries]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    setError('');
    if (isAdmin) {
      refreshDashboardAdminData().catch((err) => setError(err?.message || 'Failed to load dashboard.'));
      loadHomeTasks({ reset: true }).catch((err) => setError(err?.message || 'Failed to load tasks.'));
      return;
    }
    loadHomeTasks({ reset: true }).catch((err) => setError(err?.message || 'Failed to load tasks.'));
  }, [isActive, hasLoaded, isAdmin, refreshTick]);

  useEffect(() => {
    if (!taskModalOpen || !isAdmin) return;
    loadTaskProjects({ reset: true });
  }, [taskModalOpen, isAdmin]);

  const saveTask = async () => {
    setTaskSaving(true);
    try {
      const payload = {
        title: taskForm.title,
        description: taskForm.description || undefined,
        projectId: taskForm.projectId || undefined,
        status: taskForm.status
      };
      if (taskEditId) {
        await updateTask(taskEditId, payload);
      } else {
        await createTask(payload);
      }
      setTaskForm({ title: '', description: '', projectId: '', status: 'created' });
      setTaskEditId('');
      setTaskModalOpen(false);
      await loadHomeTasks({ reset: true, fresh: true, force: true });
      showToast(taskEditId ? 'Task updated.' : 'Task created.');
    } catch (err) {
      showToast(err?.message || (taskEditId ? 'Task update failed.' : 'Task create failed.'));
    } finally {
      setTaskSaving(false);
    }
  };

  const changeTaskStatus = async (task) => {
    const taskId = task?.id;
    if (!taskId) return;
    const nextStatus = nextTaskStatus(task?.status);
    setTaskUpdatingId(String(taskId || ''));
    try {
      await updateTask(taskId, { status: nextStatus });
      await loadHomeTasks({ reset: true, fresh: true, force: true });
      if (String(taskDetail?.id || '') === String(taskId)) {
        setTaskDetail((prev) => (prev ? { ...prev, status: nextStatus } : prev));
      }
    } catch (err) {
      showToast(err?.message || 'Task update failed.');
    } finally {
      setTaskUpdatingId('');
    }
  };

  const removeTask = async (taskId) => {
    if (!canDeleteTasks) return;
    setTaskDeletingId(String(taskId || ''));
    try {
      await deleteTask(taskId);
      await loadHomeTasks({ reset: true, fresh: true, force: true });
      showToast('Task deleted.');
    } catch (err) {
      showToast(err?.message || 'Task delete failed.');
    } finally {
      setTaskDeletingId('');
    }
  };

  const openTaskDetail = async (taskId) => {
    if (!taskId) return;
    const localTask = homeTasks.find((task) => String(task?.id || '') === String(taskId));
    if (localTask) {
      setTaskDetail(localTask);
      setTaskDetailOpen(true);
      return;
    }
    setTaskViewingId(String(taskId));
    try {
      const data = await getTask(taskId);
      setTaskDetail(data || null);
      setTaskDetailOpen(true);
    } catch (err) {
      showToast(err?.message || 'Task detail load failed.');
    } finally {
      setTaskViewingId('');
    }
  };

  const startEditTask = (task) => {
    setTaskEditId(String(task?.id || ''));
    setTaskForm({
      title: task?.title || '',
      description: task?.description || '',
      projectId: task?.projectId || '',
      status: task?.status || 'created'
    });
    setTaskModalOpen(true);
  };

  const resolveTaskProjectDescription = (task) => {
    const fromTask =
      String(task?.project?.description || '').trim()
      || String(task?.project?.address?.raw || '').trim()
      || String(task?.projectDescription || '').trim()
      || String(task?.projectAddressRaw || '').trim();
    if (fromTask) return fromTask;
    const projectId = String(task?.projectId || '').trim();
    if (!projectId) return 'No project';
    const inProjects = taskProjects.find((project) => String(project?.id || '') === projectId);
    return String(inProjects?.description || inProjects?.address?.raw || '').trim() || 'No project';
  };

  const renderTaskDetailModal = () => (
    <SimpleModal open={taskDetailOpen} onClose={() => setTaskDetailOpen(false)} title="Task Details" size="sm">
      <div className="modal-form-grid task-detail-modal">
        <div className="full task-detail-head">
          <strong>{taskDetail?.title || 'Untitled task'}</strong>
          <div className="muted">{taskDetail?.description || 'No description'}</div>
        </div>
        <div className="full task-detail-grid">
          <div className="task-detail-chip">
            <span>Status</span>
            <strong className={`task-status-pill ${statusClass(taskDetail?.status)}`}>{formatTaskStatus(taskDetail?.status)}</strong>
          </div>
          <div className="task-detail-chip">
            <span>Due Date</span>
            <strong>{taskDetail?.dueDate ? new Date(taskDetail.dueDate).toLocaleString() : '-'}</strong>
          </div>
          <div className="task-detail-chip full">
            <span>Project</span>
            <strong>{resolveTaskProjectDescription(taskDetail)}</strong>
          </div>
        </div>
        <div className="full row task-detail-actions">
          {isAdmin ? (
            <button
              type="button"
              className="ghost btn-tone-warning"
              onClick={() => {
                startEditTask(taskDetail);
                setTaskDetailOpen(false);
              }}
            >
              Edit
            </button>
          ) : null}
          {canDeleteTasks ? (
            <button
              type="button"
              className="ghost btn-tone-danger btn-with-spinner"
              onClick={async () => {
                await removeTask(taskDetail?.id);
                setTaskDetailOpen(false);
              }}
              disabled={taskDeletingId === String(taskDetail?.id || '')}
            >
              {taskDeletingId === String(taskDetail?.id || '') ? <FiLoader className="btn-spinner" /> : null}
              <span>{taskDeletingId === String(taskDetail?.id || '') ? 'Deleting...' : 'Delete'}</span>
            </button>
          ) : null}
          <button type="button" className="ghost btn-tone-neutral" onClick={() => setTaskDetailOpen(false)}>Close</button>
        </div>
      </div>
    </SimpleModal>
  );

  const openOpenEntriesModal = () => {
    setOpenEntriesModalOpen(true);
    setForcedEntry(null);
    setForcedClockOutAt('');
    setForcedNotes('');
  };

  const selectForcedEntry = (entry) => {
    setForcedEntry(entry);
    setForcedClockOutAt(toLocalDateTimeInputValue(new Date()));
    setForcedNotes('');
  };

  const confirmForcedCheckout = async () => {
    if (!forcedEntry?.id) return;
    if (!forcedClockOutAt) {
      showToast('Pick checkout time first.');
      return;
    }
    setForcedCheckoutBusy(true);
    try {
      await patchTimeEntry(forcedEntry.id, {
        clockOutAt: new Date(forcedClockOutAt).toISOString(),
        notes: String(forcedNotes || '').trim() || undefined
      });
      showToast('Forced checkout completed.');
      setOpenEntriesModalOpen(false);
      setForcedEntry(null);
      setForcedClockOutAt('');
      setForcedNotes('');
      await refreshDashboardAdminData();
    } catch (err) {
      showToast(err?.message || 'Forced checkout failed.');
    } finally {
      setForcedCheckoutBusy(false);
    }
  };

  if (!isActive) {
    return <div id="homePage" className="tab-page hidden" />;
  }

  if (!isAdmin) {
    return (
      <div id="homePage" className="tab-page active">
        <div className="section card home-tasks">
          <div className="home-card-head">
            <div>
              <div className="eyebrow">My Work</div>
              <h3>Assigned Tasks</h3>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className={`prj-time-btn btn-tone-purple${taskIncludeDone ? ' active' : ''}`} onClick={() => setTaskIncludeDone((prev) => !prev)}>
                {taskIncludeDone ? 'Hide Done' : 'Include Done'}
              </button>
              <div className="pill">{homeTasks.length}</div>
            </div>
          </div>
          {error ? <div className="muted">{error}</div> : null}
          {!error && !homeTasks.length ? <div className="task-empty">No assigned tasks.</div> : null}
          <div className="task-list">
            {homeTasks.map((task) => (
              <div key={task.id} className={`task-row ${statusClass(task.status)}`}>
                <span className={`task-status-chip task-status-corner ${normalizeTaskStatus(task.status)}`}>{formatTaskStatus(task.status)}</span>
                <div className="task-title">{task.title || 'Untitled task'}</div>
                <div className="task-location">{task.description || 'No description'}</div>
                <div className="task-footer">
                  <span className="task-due">{task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date'}</span>
                </div>
                <div className="task-actions">
                  <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => openTaskDetail(task.id)} disabled={taskViewingId === String(task.id)}>
                    {taskViewingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{taskViewingId === String(task.id) ? 'Loading...' : 'View'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!taskLoadBusy && taskCursor ? (
            <button type="button" onClick={() => loadHomeTasks()} disabled={taskLoadMoreBusy} className="btn-tone-neutral btn-with-spinner">
              {taskLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
              <span>{taskLoadMoreBusy ? 'Loading...' : 'Load more tasks'}</span>
            </button>
          ) : null}
        </div>

        {renderTaskDetailModal()}
      </div>
    );
  }

  return (
    <div id="homePage" className="tab-page active">
      <div id="homeSummaryCard" className={`section card home-dashboard${openEntriesExpanded ? '' : ' pulse-collapsed'}`}>
        <div className="home-board-head">
          <div>
            <div className="eyebrow">Today</div>
            <h3>{today?.dateKey || '-'}</h3>
          </div>
          <div className="home-gross">{money(today?.laborEarningsToday)}</div>
        </div>
        {error ? <div className="muted">{error}</div> : null}

        <div className="home-stat-grid home-top-stats">
          <div className="home-metric home-metric-open-entries">
            <div className="home-metric-icon"><FiUser /></div>
            <div className="home-metric-label">Open Entries</div>
            <button
              type="button"
              className="home-metric-value home-open-count-btn"
              onClick={openOpenEntriesModal}
              title="Open checked-in users"
            >
              {num(today?.openEntriesCount)}
            </button>
          </div>
          <div className="home-metric">
            <div className="home-metric-icon"><FiActivity /></div>
            <div className="home-metric-label">Check-ins</div>
            <div className="home-metric-value">{num(today?.checkInsTodayCount)}</div>
          </div>
          <div className="home-metric">
            <div className="home-metric-icon"><FiClock /></div>
            <div className="home-metric-label">Check-outs</div>
            <div className="home-metric-value">{num(today?.checkOutsTodayCount)}</div>
          </div>
        </div>

        <div className="home-personal-list">
          <div className="entry">
            <div>Labor Minutes</div>
            <div>{num(today?.laborMinutesToday)}</div>
          </div>
          <div className="entry">
            <div>Labor Earnings</div>
            <div>{money(today?.laborEarningsToday)}</div>
          </div>
          <div className="entry">
            <div>Tasks Due Today</div>
            <div>{num(today?.tasksDueTodayCount)}</div>
          </div>
        </div>

        <button
          type="button"
          className={`pulse-toggle pulse-toggle-wide${openEntriesExpanded ? '' : ' collapsed'}`}
          aria-expanded={openEntriesExpanded}
          onClick={() => setOpenEntriesExpanded((prev) => !prev)}
          title={openEntriesExpanded ? 'Hide dashboard panels' : 'Show dashboard panels'}
        >
          <FiChevronDown style={{ transform: openEntriesExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .22s ease' }} />
        </button>

        <div id="homePanelCarousel" className="home-panel-carousel">
          <div className="home-panel-slide">
            <section id="homeClockedPanel" className="home-panel">
              <div className="home-panel-head">
                <strong>Open Entries Monitor</strong>
                <button type="button" className="ghost btn-tone-info" onClick={openOpenEntriesModal}>
                  <FiClock />
                  Open List
                </button>
              </div>
              {!openEntries.length ? <div className="muted">No open entries.</div> : null}
              <ul id="homeClockedList" className="home-mini-list">
                {openEntries.map((entry) => (
                  <li key={entry.id} style={{ cursor: 'pointer' }} onClick={() => {
                    openOpenEntriesModal();
                    selectForcedEntry(entry);
                  }}>
                    <div>
                      <strong>{getOpenEntryUserLabelResolved(entry)}</strong>
                      <small>{getOpenEntryProjectLabelResolved(entry)}</small>
                    </div>
                    <div>{fmtDateTime(entry.clockInAt)}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <div className="home-panel-slide">
            <section className="home-panel">
              <div className="home-panel-head">
                <strong>Project Labor Breakdown</strong>
                <FiTrendingUp />
              </div>
              {!projectBreakdown.length ? <div className="muted">No project data for selected range.</div> : null}
              <ul id="homeStartedList" className="home-mini-list">
                {projectBreakdown.slice(0, 8).map((row) => (
                  <li key={row.projectId}>
                    <div>
                      <strong>{row.projectDescription || row.projectId}</strong>
                      <small>Labor Hours: {num(row.laborHours).toFixed(2)}</small>
                    </div>
                    <div>{money(row.laborEarnings)}</div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </div>

        <div id="homePanelDots" className="home-panel-dots" aria-hidden="true">
          <span className="home-panel-dot active" />
          <span className="home-panel-dot" />
        </div>
      </div>

      <div className="section card home-task-board">
          <div className="home-card-head">
            <div>
              <div className="eyebrow">Task Board</div>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="ghost btn-tone-primary" onClick={() => {
                setTaskEditId('');
                setTaskForm({ title: '', description: '', projectId: '', status: 'created' });
                setTaskModalOpen(true);
              }}>
                <FiFilePlus />
                New Task
              </button>
            </div>
          </div>
          <div className="prj-filter-group prj-time-filter home-task-status-row">
            <button type="button" className={`prj-time-btn${taskStatusFilter === '' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('')}>All</button>
            <button type="button" className={`prj-time-btn${taskStatusFilter === 'created' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('created')}>Created</button>
            <button type="button" className={`prj-time-btn${taskStatusFilter === 'progress' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('progress')}>Progress</button>
            <button type="button" className={`prj-time-btn${taskStatusFilter === 'done' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('done')}>Done</button>
          </div>
          {!homeTasks.length ? <div className="task-empty">No tasks yet.</div> : null}
          <div className="task-list">
          {homeTasks.slice(0, 20).map((task) => (
            <div key={task.id} className={`task-row ${statusClass(task.status)}`}>
              <span className={`task-status-chip task-status-corner ${normalizeTaskStatus(task.status)}`}>{formatTaskStatus(task.status)}</span>
              <div className="task-title">{task.title || 'Untitled task'}</div>
              <div className="task-location">{task.description || 'No description'}</div>
              <div className="task-footer">
                <span className="task-due">{task.projectId || 'No project'}</span>
              </div>
              <div className="task-actions">
                <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => openTaskDetail(task.id)} disabled={taskViewingId === String(task.id)}>
                  {taskViewingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                  <span>{taskViewingId === String(task.id) ? 'Loading...' : 'View'}</span>
                </button>
                <button
                  type="button"
                  className="ghost btn-tone-success btn-with-spinner"
                  onClick={() => changeTaskStatus(task)}
                  disabled={taskUpdatingId === String(task.id)}
                >
                    {taskUpdatingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{taskUpdatingId === String(task.id) ? 'Updating...' : `Set ${formatTaskStatus(nextTaskStatus(task.status))}`}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
        {!taskLoadBusy && taskCursor ? (
          <button type="button" onClick={() => loadHomeTasks()} disabled={taskLoadMoreBusy} className="btn-tone-neutral btn-with-spinner">
            {taskLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
            <span>{taskLoadMoreBusy ? 'Loading...' : 'Load more tasks'}</span>
          </button>
        ) : null}
      </div>

      <SimpleModal open={taskModalOpen} onClose={() => setTaskModalOpen(false)} title={taskEditId ? 'Edit Task' : 'Create Task'} size="sm">
        <div className="modal-form-grid">
          <input className="full" placeholder="title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          <input className="full" placeholder="description" value={taskForm.description} onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })} />
          <div className="full">
            <div className="task-hint" style={{ marginBottom: 6 }}>Project (optional): latest 5 first, scroll to load more.</div>
            <button
              type="button"
              className={`ghost btn-tone-purple ${taskForm.projectId ? '' : 'active'}`}
              onClick={() => setTaskForm({ ...taskForm, projectId: '' })}
              style={{ marginBottom: 8 }}
            >
              No project
            </button>
            <div
              className="task-project-scroll task-project-picker"
              onScroll={(event) => {
                const el = event.currentTarget;
                const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 24;
                if (nearBottom && taskProjectsCursor && !taskProjectsLoading) {
                  loadTaskProjects();
                }
              }}
            >
              {taskProjects.map((project) => {
                const selected = String(taskForm.projectId || '') === String(project.id);
                return (
                  <button
                    key={project.id}
                    type="button"
                    className={`task-project-item${selected ? ' selected' : ''}`}
                    onClick={() => setTaskForm({ ...taskForm, projectId: project.id })}
                  >
                    <span className="task-project-title">{project.description || project.id}</span>
                    <small className="task-project-meta">{project.status || 'unknown'} | {project.locationKey || '-'}</small>
                  </button>
                );
              })}
              {!taskProjectsLoading && taskProjectsCursor ? (
                <button
                  type="button"
                  className="ghost btn-tone-neutral"
                  onClick={() => loadTaskProjects()}
                >
                  Load more projects
                </button>
              ) : null}
              {!taskProjects.length && !taskProjectsLoading ? <div className="muted">No projects found.</div> : null}
              {taskProjectsLoading ? <div className="muted">Loading projects...</div> : null}
            </div>
          </div>
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setTaskModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveTask} disabled={taskSaving} className="btn-tone-primary btn-with-spinner">
              {taskSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{taskSaving ? (taskEditId ? 'Updating...' : 'Creating...') : (taskEditId ? 'Update' : 'Create')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      {renderTaskDetailModal()}

      <SimpleModal open={openEntriesModalOpen} onClose={() => setOpenEntriesModalOpen(false)} title="Checked-In Users" size="md">
        <div className="modal-form-grid">
          <div className="full muted">Click a user row to force checkout.</div>
          <div className="full task-project-scroll" style={{ maxHeight: 260 }}>
            {!openEntries.length ? <div className="muted">No open entries.</div> : null}
            {openEntries.map((entry) => {
              const selected = String(forcedEntry?.id || '') === String(entry.id || '');
              return (
                <button
                  key={entry.id}
                  type="button"
                  className={`task-project-item${selected ? ' selected' : ''}`}
                  onClick={() => selectForcedEntry(entry)}
                >
                  <span>{getOpenEntryUserLabelResolved(entry)}</span>
                  <small>{fmtDateTime(entry.clockInAt)} | {getOpenEntryProjectLabelResolved(entry)}</small>
                </button>
              );
            })}
          </div>

          {forcedEntry ? (
            <>
              <input
                className="full"
                type="datetime-local"
                value={forcedClockOutAt}
                onChange={(event) => setForcedClockOutAt(event.target.value)}
              />
              <button
                type="button"
                className="ghost btn-tone-info"
                onClick={() => setForcedClockOutAt(toLocalDateTimeInputValue(new Date()))}
              >
                Now
              </button>
              <input
                className="full"
                placeholder="Notes (optional)"
                value={forcedNotes}
                onChange={(event) => setForcedNotes(event.target.value)}
              />
            </>
          ) : null}

          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setOpenEntriesModalOpen(false)}>Close</button>
            <button
              type="button"
              className="btn-tone-danger btn-with-spinner"
              onClick={confirmForcedCheckout}
              disabled={!forcedEntry || forcedCheckoutBusy}
            >
              {forcedCheckoutBusy ? <FiLoader className="btn-spinner" /> : null}
              <span>{forcedCheckoutBusy ? 'Submitting...' : 'Force Checkout'}</span>
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
