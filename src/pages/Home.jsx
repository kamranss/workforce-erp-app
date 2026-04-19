import { useEffect, useMemo, useRef, useState } from 'react';
import { FiActivity, FiCheckCircle, FiChevronDown, FiCircle, FiClock, FiFilePlus, FiFolder, FiLoader, FiNavigation, FiTrendingUp, FiUser } from 'react-icons/fi';
import { dashboardOpenEntries, dashboardToday } from '../api/dashboardApi.js';
import { listProjects } from '../api/projectsApi.js';
import { projectUserBreakdown } from '../api/reportsApi.js';
import { createTask, deleteTask, getTask, listTasks, myTasks, toggleTaskTodo, updateTask } from '../api/tasksApi.js';
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

function buildDirectionsHref(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(raw)}`;
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

function taskStatusTone(value) {
  const key = normalizeTaskStatus(value);
  if (key === 'done') return 'Completed';
  if (key === 'progress') return 'Started';
  return 'Waiting';
}

function normalizeTaskStatus(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'ongoing') return 'progress';
  if (key === 'progress' || key === 'done' || key === 'created') return key;
  return 'created';
}

function isActiveProject(project) {
  const statusKey = String(project?.status || '').trim().toLowerCase();
  if (project?.isActive === false) return false;
  if (project?.deletedAt) return false;
  if (statusKey === 'canceled') return false;
  return true;
}

function parseTaskDescriptionItems(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => String(line || '').trim())
    .filter(Boolean)
    .map((line) => line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^\u2022\s+/, '')
      .trim())
    .filter(Boolean);
}

function normalizeTaskTodoItems(value) {
  const source = Array.isArray(value) ? value : [];
  return source.map((item, index) => ({
    id: String(item?.id || '').trim(),
    text: String(item?.text || '').trim(),
    isDone: Boolean(item?.isDone),
    doneAt: item?.doneAt || null,
    doneBy: item?.doneBy || null,
    localKey: String(item?.id || `todo-${index}-${String(item?.text || '').trim() || 'item'}`)
  })).filter((item) => item.text);
}

function createEmptyTaskTodoItem() {
  return {
    id: '',
    text: '',
    isDone: false,
    doneAt: null,
    doneBy: null,
    localKey: `todo-new-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  };
}

function summarizeTaskTodos(task) {
  const todoItems = normalizeTaskTodoItems(task?.todoItems);
  const totalCount = Number((task?.todoTotalCount ?? todoItems.length) || 0);
  const doneCount = Number((task?.todoDoneCount ?? todoItems.filter((item) => item.isDone).length) || 0);
  const safeTotal = Math.max(totalCount, todoItems.length, 0);
  const safeDone = Math.min(Math.max(doneCount, 0), safeTotal || doneCount);
  const progressPercent = Number(
    task?.todoProgressPercent
    ?? (safeTotal > 0 ? ((safeDone / safeTotal) * 100) : 0)
  );
  return {
    todoItems,
    totalCount: safeTotal,
    doneCount: safeDone,
    progressPercent: Math.max(0, Math.min(100, progressPercent))
  };
}

function isDueTomorrow(dueDate) {
  if (!dueDate) return false;
  const due = new Date(dueDate);
  if (Number.isNaN(due.getTime())) return false;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((dueStart.getTime() - todayStart.getTime()) / dayMs);
  return diffDays === 1;
}

function shouldShowTaskDueSoonBlink(task) {
  return normalizeTaskPriority(task?.priority) === 'high';
}

const TASK_STATUS_OPTIONS = [
  { value: 'created', label: 'Created' },
  { value: 'progress', label: 'Progress' },
  { value: 'done', label: 'Done' }
];

const TASK_PRIORITY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' }
];

function normalizeTaskPriority(value) {
  const key = String(value || '').trim().toLowerCase();
  if (key === 'low' || key === 'high') return key;
  return 'medium';
}

function formatTaskPriority(value) {
  const key = normalizeTaskPriority(value);
  if (key === 'high') return 'High';
  if (key === 'low') return 'Low';
  return 'Medium';
}

export default function Home() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role, userId } = useAuth();
  const [today, setToday] = useState(null);
  const [openEntries, setOpenEntries] = useState([]);
  const [projectBreakdown, setProjectBreakdown] = useState([]);
  const [openUsersById, setOpenUsersById] = useState({});
  const [openProjectsById, setOpenProjectsById] = useState({});
  const [homeTasks, setHomeTasks] = useState([]);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskEditId, setTaskEditId] = useState('');
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    projectId: '',
    assignedToUserIds: [],
    status: 'created',
    priority: 'medium',
    startDate: toLocalDateTimeInputValue(new Date()),
    dueDate: '',
    address: ''
  });
  const [taskTodoItems, setTaskTodoItems] = useState([createEmptyTaskTodoItem()]);
  const [taskUserOptions, setTaskUserOptions] = useState([]);
  const [taskProjects, setTaskProjects] = useState([]);
  const [taskProjectsCursor, setTaskProjectsCursor] = useState(null);
  const [taskProjectsLoading, setTaskProjectsLoading] = useState(false);
  const [taskUsersPickerOpen, setTaskUsersPickerOpen] = useState(false);
  const [taskProjectsPickerOpen, setTaskProjectsPickerOpen] = useState(false);
  const [taskUsersSearch, setTaskUsersSearch] = useState('');
  const [taskProjectsSearch, setTaskProjectsSearch] = useState('');
  const [taskCursor, setTaskCursor] = useState(null);
  const [taskStatusFilter, setTaskStatusFilter] = useState('');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState('');
  const [userTaskFilter, setUserTaskFilter] = useState('all');
  const [taskLoadBusy, setTaskLoadBusy] = useState(false);
  const [taskLoadMoreBusy, setTaskLoadMoreBusy] = useState(false);
  const [taskDetailOpen, setTaskDetailOpen] = useState(false);
  const [taskDetail, setTaskDetail] = useState(null);
  const [taskViewingId, setTaskViewingId] = useState('');
  const [taskStatusModalOpen, setTaskStatusModalOpen] = useState(false);
  const [taskStatusTarget, setTaskStatusTarget] = useState(null);
  const [taskStatusValue, setTaskStatusValue] = useState('created');
  const [openEntriesExpanded, setOpenEntriesExpanded] = useState(false);
  const [openEntriesModalOpen, setOpenEntriesModalOpen] = useState(false);
  const [forcedEntry, setForcedEntry] = useState(null);
  const [forcedClockOutAt, setForcedClockOutAt] = useState('');
  const [forcedNotes, setForcedNotes] = useState('');
  const [forcedCheckoutBusy, setForcedCheckoutBusy] = useState(false);
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskUpdatingId, setTaskUpdatingId] = useState('');
  const [taskTodoUpdatingKey, setTaskTodoUpdatingKey] = useState('');
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
  const isUserRole = roleLower === 'user';
  const canDeleteTasks = roleLower === 'superadmin';
  const allowRawAssigneeIds = String(process.env.NEXT_PUBLIC_DEBUG_RAW_IDS || '').trim() === '1';

  const resetTaskEditorState = () => {
    setTaskForm({
      title: '',
      description: '',
      projectId: '',
      assignedToUserIds: [],
      status: 'created',
      priority: 'medium',
      startDate: toLocalDateTimeInputValue(new Date()),
      dueDate: '',
      address: ''
    });
    setTaskTodoItems([createEmptyTaskTodoItem()]);
    setTaskEditId('');
    setTaskUsersSearch('');
    setTaskProjectsSearch('');
    setTaskUsersPickerOpen(false);
    setTaskProjectsPickerOpen(false);
  };

  const replaceTaskInLocalState = (nextTask) => {
    if (!nextTask?.id) return;
    const taskId = String(nextTask.id);
    setHomeTasks((prev) => prev.map((item) => (String(item?.id || '') === taskId ? { ...item, ...nextTask } : item)));
    setTaskDetail((prev) => (String(prev?.id || '') === taskId ? { ...prev, ...nextTask } : prev));
    setTaskStatusTarget((prev) => (String(prev?.id || '') === taskId ? { ...prev, ...nextTask } : prev));
  };

  const isTaskAssignedToCurrentUser = (task) => {
    const currentUserId = String(userId || '').trim();
    if (!currentUserId) return false;
    if (Array.isArray(task?.assignedToUsers) && task.assignedToUsers.some((user) => String(user?.id || user?._id || '').trim() === currentUserId)) {
      return true;
    }
    if (Array.isArray(task?.assignedToUserIds) && task.assignedToUserIds.some((id) => String(id || '').trim() === currentUserId)) {
      return true;
    }
    return false;
  };

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
          ...(taskStatusFilter
            ? { status: taskStatusFilter }
            : { includeDone: false })
        }, { cache: fresh ? false : undefined })
        : await myTasks({
          limit: 20,
          cursor: reset ? undefined : taskCursor,
          includeDone: userTaskFilter === 'done' ? true : false
        }, { cache: fresh ? false : undefined });
      const nextItemsRaw = Array.isArray(res?.items) ? res.items : [];
      const nextItems = isAdmin
        ? nextItemsRaw
        : nextItemsRaw.filter((task) => {
          const status = normalizeTaskStatus(task?.status);
          if (userTaskFilter === 'created') return status === 'created';
          if (userTaskFilter === 'progress') return status === 'progress';
          if (userTaskFilter === 'done') return status === 'done';
          if (userTaskFilter === 'all') return status === 'created' || status === 'progress';
          return status === 'created' || status === 'progress';
        });
      setHomeTasks((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setTaskCursor(res?.nextCursor || null);
    } catch (err) {
      const statusCode = Number(err?.status || err?.response?.status || 0);
      if (!isAdmin && (statusCode === 401 || statusCode === 403)) {
        setError('Session/permission issue while loading assigned tasks. Please login again.');
      }
      throw err;
    } finally {
      taskLoadLockRef.current = false;
      setTaskLoadBusy(false);
      setTaskLoadMoreBusy(false);
    }
  };

  const loadTaskProjects = async ({ reset = false, queryOverride } = {}) => {
    if (taskProjectsLoading || taskProjectsLoadLockRef.current) return;
    if (!reset && !taskProjectsCursor) return;
    taskProjectsLoadLockRef.current = true;
    setTaskProjectsLoading(true);
    try {
      const q = String((queryOverride ?? taskProjectsSearch) || '').trim();
      const res = await listProjects({
        limit: reset ? 5 : 20,
        cursor: reset ? undefined : taskProjectsCursor,
        q: q || undefined
      });
      const items = (Array.isArray(res?.items) ? res.items : []).filter(isActiveProject);
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

  const loadTaskUsers = async (queryOverride) => {
    if (!isAdmin) return;
    try {
      const q = String(queryOverride ?? taskUsersSearch).trim();
      const res = await listUsers({ limit: 100, q: q || undefined });
      const rows = Array.isArray(res?.items) ? res.items : [];
      const filtered = rows.filter((u) => {
        const roleKey = String(u?.role || '').toLowerCase();
        return (roleKey === 'user' || roleKey === 'employee') && u?.isActive !== false;
      });
      setTaskUserOptions(filtered);
    } catch (err) {
      showToast(err?.message || 'Failed to load users for task assignment.');
    }
  };

  const ensureTaskUsersLoaded = async () => {
    if (taskUserOptions.length) return;
    await loadTaskUsers('');
  };

  const ensureTaskProjectsLoaded = async () => {
    if (taskProjects.length) return;
    await loadTaskProjects({ reset: true, queryOverride: '' });
  };

  useEffect(() => {
    if (!taskModalOpen || !taskUsersPickerOpen || !isAdmin) return;
    const handle = setTimeout(() => {
      loadTaskUsers(taskUsersSearch);
    }, 250);
    return () => clearTimeout(handle);
  }, [taskModalOpen, taskUsersPickerOpen, taskUsersSearch, isAdmin]);

  useEffect(() => {
    if (!taskModalOpen || !taskProjectsPickerOpen || !isAdmin) return;
    const handle = setTimeout(() => {
      loadTaskProjects({ reset: true, queryOverride: taskProjectsSearch });
    }, 250);
    return () => clearTimeout(handle);
  }, [taskModalOpen, taskProjectsPickerOpen, taskProjectsSearch, isAdmin]);

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
  }, [hasLoaded, isAdmin, userTaskFilter, taskStatusFilter]);

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

  const saveTask = async () => {
    setTaskSaving(true);
    try {
      const title = String(taskForm.title || '').trim();
      if (!title) {
        showToast('Title is required.');
        return;
      }
      const startDateIso = taskForm.startDate ? new Date(taskForm.startDate).toISOString() : new Date().toISOString();
      if (!startDateIso || Number.isNaN(new Date(startDateIso).getTime())) {
        showToast('Valid start date is required.');
        return;
      }
      const dueDateIso = taskForm.dueDate ? new Date(taskForm.dueDate).toISOString() : null;
      if (dueDateIso && Number.isNaN(new Date(dueDateIso).getTime())) {
        showToast('Due date is invalid.');
        return;
      }
      if (dueDateIso && new Date(dueDateIso).getTime() < new Date(startDateIso).getTime()) {
        showToast('Due date must be after start date.');
        return;
      }
      const assignedIds = Array.isArray(taskForm.assignedToUserIds)
        ? taskForm.assignedToUserIds.map((id) => String(id || '').trim()).filter(Boolean)
        : [];
      const descriptionValue = String(taskForm.description || '').trim();
      const todoItemsPayload = (Array.isArray(taskTodoItems) ? taskTodoItems : [])
        .map((item) => ({
          ...(item?.id ? { id: item.id } : {}),
          text: String(item?.text || '').trim(),
          isDone: Boolean(item?.isDone)
        }))
        .filter((item) => item.text);
      const priority = normalizeTaskPriority(taskForm.priority);
      const address = String(taskForm.address || '').trim();
      const payload = {
        title,
        description: descriptionValue || undefined,
        projectId: taskForm.projectId || undefined,
        assignedToUserIds: assignedIds,
        status: taskForm.status || 'created',
        priority,
        startDate: startDateIso,
        dueDate: dueDateIso,
        address: address || undefined,
        ...(todoItemsPayload.length ? { todoItems: todoItemsPayload } : { todoItems: [] })
      };
      if (taskEditId) {
        await updateTask(taskEditId, payload);
      } else {
        await createTask(payload);
      }
      resetTaskEditorState();
      setTaskModalOpen(false);
      await loadHomeTasks({ reset: true, fresh: true, force: true });
      showToast(taskEditId ? 'Task updated.' : 'Task created.');
    } catch (err) {
      showToast(err?.message || (taskEditId ? 'Task update failed.' : 'Task create failed.'));
    } finally {
      setTaskSaving(false);
    }
  };

  const openTaskStatusModal = (task) => {
    const taskId = String(task?.id || '');
    if (!taskId) return;
    setTaskStatusTarget(task);
    setTaskStatusValue(normalizeTaskStatus(task?.status));
    setTaskStatusModalOpen(true);
  };

  const changeTaskStatus = async () => {
    const taskId = String(taskStatusTarget?.id || '');
    if (!taskId || !taskStatusValue) return;
    setTaskUpdatingId(String(taskId || ''));
    try {
      await updateTask(taskId, { status: taskStatusValue });
      await loadHomeTasks({ reset: true, fresh: true, force: true });
      if (String(taskDetail?.id || '') === String(taskId)) {
        setTaskDetail((prev) => (prev ? { ...prev, status: taskStatusValue } : prev));
      }
      setTaskStatusModalOpen(false);
      setTaskStatusTarget(null);
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
    const assignedIdsFromArray = Array.isArray(task?.assignedToUserIds)
      ? task.assignedToUserIds
      : [];
    const assignedIdsFromObjects = Array.isArray(task?.assignedToUsers)
      ? task.assignedToUsers.map((u) => u?.id || u?._id)
      : [];
    const assignedToUserIds = [...assignedIdsFromArray, ...assignedIdsFromObjects]
      .map((id) => String(id || '').trim())
      .filter(Boolean)
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
    const todoItems = normalizeTaskTodoItems(task?.todoItems);
    setTaskEditId(String(task?.id || ''));
    setTaskForm({
      title: task?.title || '',
      description: String(task?.description || '').trim(),
      projectId: task?.projectId || '',
      assignedToUserIds,
      status: task?.status || 'created',
      priority: normalizeTaskPriority(task?.priority),
      startDate: task?.startDate ? toLocalDateTimeInputValue(task.startDate) : toLocalDateTimeInputValue(new Date()),
      dueDate: task?.dueDate ? toLocalDateTimeInputValue(task.dueDate) : '',
      address: String(task?.address || '').trim()
    });
    setTaskTodoItems(todoItems.length ? todoItems : [createEmptyTaskTodoItem()]);
    setTaskUsersSearch('');
    setTaskProjectsSearch('');
    setTaskUsersPickerOpen(false);
    setTaskProjectsPickerOpen(false);
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
  const resolveTaskProjectMeta = (task) => {
    const projectId = String(task?.projectId || '').trim();
    const linkedProject = projectId
      ? taskProjects.find((project) => String(project?.id || '') === projectId)
      : null;
    const projectDescription = String(
      task?.project?.description
      || task?.projectDescription
      || linkedProject?.description
      || ''
    ).trim() || 'No project';
    const customerFullName = String(
      task?.project?.customer?.fullName
      || task?.project?.customerName
      || linkedProject?.customer?.fullName
      || linkedProject?.clientFullName
      || ''
    ).trim() || '-';
    const projectAddress = String(
      task?.project?.address?.raw
      || task?.project?.address?.normalized
      || task?.projectAddressRaw
      || linkedProject?.address?.raw
      || linkedProject?.address?.normalized
      || ''
    ).trim() || '-';
    return { projectDescription, customerFullName, projectAddress };
  };
  const resolveTaskAssignees = (task, options = {}) => {
    const forUser = Boolean(options?.forUser);
    const assignedUsers = Array.isArray(task?.assignedToUsers) ? task.assignedToUsers : [];
    if (forUser && userId && assignedUsers.some((u) => String(u?.id || u?._id || '').trim() === String(userId).trim())) {
      return 'You';
    }
    const namesFromObjects = assignedUsers
      .map((u) => `${u?.name || ''} ${u?.surname || ''}`.trim())
      .filter(Boolean);
    if (namesFromObjects.length) return namesFromObjects.join(', ');
    const ids = Array.isArray(task?.assignedToUserIds)
      ? task.assignedToUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!ids.length) return '-';
    const namesFromLookup = ids.map((id) => {
      const found = taskUserOptions.find((u) => String(u?.id || '') === id);
      return found ? `${found?.name || ''} ${found?.surname || ''}`.trim() : '';
    }).filter(Boolean);
    if (namesFromLookup.length) return namesFromLookup.join(', ');
    return allowRawAssigneeIds ? ids.join(', ') : '-';
  };
  const selectedAssigneesLabel = (() => {
    const ids = Array.isArray(taskForm.assignedToUserIds)
      ? taskForm.assignedToUserIds.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    if (!ids.length) return '';
    const names = ids.map((id) => {
      const found = taskUserOptions.find((u) => String(u?.id || '') === id);
      return found ? `${found?.name || ''} ${found?.surname || ''}`.trim() : '';
    }).filter(Boolean);
    if (names.length) return names.join(', ');
    return allowRawAssigneeIds ? ids.join(', ') : '';
  })();
  const selectedProjectLabel = (() => {
    const projectId = String(taskForm.projectId || '').trim();
    if (!projectId) return '';
    const found = taskProjects.find((project) => String(project?.id || '') === projectId);
    return found ? (found.description || found.id || '') : projectId;
  })();
  const adminFilteredTasks = useMemo(() => {
    if (!isAdmin) return homeTasks;
    return homeTasks.filter((task) => {
      const statusMatches = !taskStatusFilter || normalizeTaskStatus(task?.status) === taskStatusFilter;
      const priorityMatches = !taskPriorityFilter || normalizeTaskPriority(task?.priority) === taskPriorityFilter;
      return statusMatches && priorityMatches;
    });
  }, [homeTasks, isAdmin, taskStatusFilter, taskPriorityFilter]);

  const updateTaskTodoItem = (localKey, value) => {
    setTaskTodoItems((prev) => prev.map((item) => (
      item.localKey === localKey
        ? { ...item, text: value }
        : item
    )));
  };

  const toggleTaskTodoItemForEditor = (localKey) => {
    setTaskTodoItems((prev) => prev.map((item) => (
      item.localKey === localKey
        ? {
            ...item,
            isDone: !item.isDone,
            doneAt: item.isDone ? null : item.doneAt,
            doneBy: item.isDone ? null : item.doneBy
          }
        : item
    )));
  };

  const addTaskTodoItem = () => {
    setTaskTodoItems((prev) => [...(Array.isArray(prev) ? prev : []), createEmptyTaskTodoItem()]);
  };

  const removeTaskTodoItem = (localKey) => {
    setTaskTodoItems((prev) => {
      const next = (Array.isArray(prev) ? prev : []).filter((item) => item.localKey !== localKey);
      return next.length ? next : [createEmptyTaskTodoItem()];
    });
  };

  const toggleTaskTodoItem = async (task, todoItem) => {
    const taskId = String(task?.id || '').trim();
    const todoItemId = String(todoItem?.id || '').trim();
    if (!taskId || !todoItemId) return;
    setTaskTodoUpdatingKey(`${taskId}:${todoItemId}`);
    try {
      const updatedTask = await toggleTaskTodo(taskId, {
        todoItemId,
        isDone: !todoItem?.isDone
      });
      replaceTaskInLocalState(updatedTask);
      showToast('Checklist updated.', 'success');
    } catch (err) {
      showToast(err?.message || 'Checklist update failed.', 'error');
    } finally {
      setTaskTodoUpdatingKey('');
    }
  };

  const getUserTaskNextStatus = (task) => {
    const current = normalizeTaskStatus(task?.status);
    if (current === 'created') return 'progress';
    if (current === 'progress') return 'done';
    if (current === 'done') return 'progress';
    return 'progress';
  };

  const getUserTaskActionLabel = (task) => {
    const current = normalizeTaskStatus(task?.status);
    if (current === 'created') return 'Start';
    if (current === 'progress') return 'Mark Done';
    if (current === 'done') return 'Reopen';
    return 'Update';
  };

  const updateUserTaskStatus = async (task) => {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return;
    const nextStatus = getUserTaskNextStatus(task);
    setTaskUpdatingId(taskId);
    const prevTasks = homeTasks;
    setHomeTasks((prev) => prev.map((row) => (String(row?.id || '') === taskId ? { ...row, status: nextStatus } : row)));
    try {
      await updateTask(taskId, { status: nextStatus });
      showToast('Task status updated.', 'success');
      await loadHomeTasks({ reset: true, fresh: true, force: true });
    } catch (err) {
      setHomeTasks(prevTasks);
      const statusCode = Number(err?.status || err?.response?.status || 0);
      if (statusCode === 401 || statusCode === 403) {
        setError('You are not authorized to update this task. Please login again.');
      }
      showToast(err?.message || 'Task status update failed.', 'error');
    } finally {
      setTaskUpdatingId('');
    }
  };

  const renderTaskChecklist = (task, options = {}) => {
    const { compact = false, interactive = false } = options;
    const summary = summarizeTaskTodos(task);
    if (!summary.totalCount) return null;
    return (
      <div className={`task-checklist${compact ? ' compact' : ''}`}>
        <div className="task-checklist-head">
          <div className="task-checklist-title-wrap">
            <span className="task-checklist-label">Checklist</span>
            <strong>{`${summary.doneCount} / ${summary.totalCount} completed`}</strong>
          </div>
          <span className="task-checklist-percent">{`${summary.progressPercent.toFixed(0)}%`}</span>
        </div>
        <div className="task-checklist-progress" aria-hidden="true">
          <span style={{ width: `${summary.progressPercent}%` }} />
        </div>
        <div className="task-checklist-items">
          {summary.todoItems.map((item) => {
            const itemId = String(item.id || item.localKey || '').trim();
            const isAssignedUser = interactive && !isAdmin;
            const isPending = taskTodoUpdatingKey === `${String(task?.id || '').trim()}:${itemId}`;
            const Icon = item.isDone ? FiCheckCircle : FiCircle;
            const doneByName = `${item?.doneBy?.name || ''} ${item?.doneBy?.surname || ''}`.trim()
              || item?.doneBy?.fullName
              || item?.doneBy?.email
              || '';
            return (
              <button
                key={itemId || item.localKey}
                type="button"
                className={`task-checklist-item${item.isDone ? ' done' : ''}${isAssignedUser ? ' interactive' : ''}`}
                onClick={isAssignedUser ? () => toggleTaskTodoItem(task, item) : undefined}
                disabled={!isAssignedUser || isPending}
              >
                <span className="task-checklist-icon">
                  {isPending ? <FiLoader className="btn-spinner" /> : <Icon />}
                </span>
                <span className="task-checklist-copy">
                  <span className="task-checklist-text">{item.text}</span>
                  {item.isDone && (item.doneAt || doneByName) ? (
                    <small className="task-checklist-meta">
                      {[
                        doneByName ? `by ${doneByName}` : '',
                        item.doneAt ? fmtDateTime(item.doneAt) : ''
                      ].filter(Boolean).join(' | ')}
                    </small>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTaskDetailModal = () => (
    <SimpleModal open={taskDetailOpen} onClose={() => setTaskDetailOpen(false)} title="Task Details" size="sm">
      <div className="modal-form-grid task-detail-modal">
        <div className="full task-detail-head">
          <strong>{taskDetail?.title || 'Untitled task'}</strong>
          {(() => {
            const descriptionItems = parseTaskDescriptionItems(taskDetail?.description || '');
            if (!descriptionItems.length) return <div className="muted">No description</div>;
            return (
              <ul className="task-location task-desc-list">
                {descriptionItems.map((item, index) => <li key={`task-detail-desc-${index}`}>{item}</li>)}
              </ul>
            );
          })()}
        </div>
        <div className="full task-detail-grid">
          <div className="task-detail-chip">
            <span>Status</span>
            <strong className={`task-status-pill ${statusClass(taskDetail?.status)}`}>{formatTaskStatus(taskDetail?.status)}</strong>
          </div>
          <div className="task-detail-chip">
            <span>Priority</span>
            <strong className={`task-priority-pill ${normalizeTaskPriority(taskDetail?.priority)}`}>{formatTaskPriority(taskDetail?.priority)}</strong>
          </div>
          <div className="task-detail-chip">
            <span>Start Date</span>
            <strong>{taskDetail?.startDate ? new Date(taskDetail.startDate).toLocaleString() : '-'}</strong>
          </div>
          <div className="task-detail-chip">
            <span>Created At</span>
            <strong>{taskDetail?.createdAt ? new Date(taskDetail.createdAt).toLocaleString() : '-'}</strong>
          </div>
          <div className="task-detail-chip">
            <span>Due Date</span>
            <strong>{taskDetail?.dueDate ? new Date(taskDetail.dueDate).toLocaleString() : '-'}</strong>
          </div>
          <div className="task-detail-chip full">
            <span>Assigned</span>
            <strong>{resolveTaskAssignees(taskDetail)}</strong>
          </div>
          <div className="task-detail-chip full">
            <span>Project</span>
            <strong>{resolveTaskProjectDescription(taskDetail)}</strong>
          </div>
        </div>
        <div className="full">
          {renderTaskChecklist(taskDetail, { interactive: true })}
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
              <h3>My Assigned Tasks</h3>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="pill">{homeTasks.length}</div>
            </div>
          </div>
          {isUserRole ? (
            <div className="prj-filter-group prj-time-filter home-task-status-row">
              <button type="button" className={`prj-time-btn${userTaskFilter === 'all' ? ' active' : ''}`} onClick={() => setUserTaskFilter('all')}>All</button>
              <button type="button" className={`prj-time-btn${userTaskFilter === 'created' ? ' active' : ''}`} onClick={() => setUserTaskFilter('created')}>Created</button>
              <button type="button" className={`prj-time-btn${userTaskFilter === 'progress' ? ' active' : ''}`} onClick={() => setUserTaskFilter('progress')}>In Progress</button>
              <button type="button" className={`prj-time-btn${userTaskFilter === 'done' ? ' active' : ''}`} onClick={() => setUserTaskFilter('done')}>Done</button>
            </div>
          ) : null}
          {error ? (
            <div className="task-empty">
              <div>{error}</div>
              <div style={{ marginTop: 8 }}>
                <button
                  type="button"
                  className="btn-tone-neutral"
                  onClick={() => {
                    loadHomeTasks({ reset: true, fresh: true, force: true }).catch((err) => {
                      setError(err?.message || 'Failed to load tasks.');
                    });
                  }}
                >
                  Retry
                </button>
              </div>
            </div>
          ) : null}
          {!error && !homeTasks.length ? <div className="task-empty">No tasks assigned to you right now.</div> : null}
          <div className="task-list">
            {homeTasks.map((task) => (
              (() => {
                const projectMeta = resolveTaskProjectMeta(task);
                const showDueSoonBlink = shouldShowTaskDueSoonBlink(task);
                const dueDateText = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
                const startDateText = task.startDate ? new Date(task.startDate).toLocaleDateString() : '-';
                const assignedText = resolveTaskAssignees(task, { forUser: true });
                const projectAddress = String(projectMeta.projectAddress || '').trim();
                const projectDirectionsHref = buildDirectionsHref(projectAddress);
              const statusTone = taskStatusTone(task.status);
              const priorityTone = normalizeTaskPriority(task.priority);
              return (
              <div key={task.id} className="prj-item" data-status={statusTone}>
                <div className="prj-row1">
                  <div className="prj-title">{task.title || 'Untitled task'}</div>
                  <div className="prj-status-inline">
                    <span className="task-inline-field">
                      <span className="task-inline-label">Status</span>
                      <span className={`pill ${statusTone}`}>{formatTaskStatus(task.status)}</span>
                    </span>
                    <span className="task-inline-field">
                      <span className="task-inline-label">Priority</span>
                      <span className={`task-priority-pill ${priorityTone}`}>{formatTaskPriority(task.priority)}</span>
                    </span>
                    {showDueSoonBlink ? (
                      <span className="task-due-soon-clock" title="Due tomorrow">
                        <FiClock />
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="address-link">
                  <span className="prj-time-muted address-link-text"><strong>Project:</strong> {projectMeta.projectDescription}</span>
                  <span className="address-link-icon-btn task-inline-icon" aria-hidden="true"><FiFolder /></span>
                </div>
                <div className="address-link">
                  <span className="prj-time-muted address-link-text"><strong>Customer:</strong> {projectMeta.customerFullName}</span>
                  <span className="address-link-icon-btn task-inline-icon" aria-hidden="true"><FiUser /></span>
                </div>
                <div className="address-link">
                  <span className="prj-time-muted address-link-text"><strong>Address:</strong> {projectAddress || '-'}</span>
                  {projectDirectionsHref ? (
                    <a className="address-link-icon-btn" href={projectDirectionsHref} target="_blank" rel="noreferrer" aria-label={`Open directions for ${projectAddress}`} title="Open directions">
                      <FiNavigation />
                    </a>
                  ) : null}
                </div>
                <div className="prj-time-muted"><strong>Assigned:</strong> {assignedText}</div>
                {(() => {
                  const descriptionItems = parseTaskDescriptionItems(task.description || '');
                  if (!descriptionItems.length) return <div className="prj-time-muted">No description</div>;
                  return (
                    <div className="task-desc-minimal">
                      <span className="task-desc-minimal-label">Description</span>
                      <ul className="task-location task-desc-list">
                        {descriptionItems.map((item, idx) => <li key={`${task.id}-desc-${idx}`}>{item}</li>)}
                      </ul>
                    </div>
                  );
                })()}
                {renderTaskChecklist(task, { compact: true, interactive: true })}
                <div className="prj-actions">
                  <div className="prj-amount">{startDateText} → {dueDateText}</div>
                  <div className="prj-action-buttons">
                    <button
                      type="button"
                      className="ghost btn-tone-success btn-with-spinner"
                      onClick={() => updateUserTaskStatus(task)}
                      disabled={taskUpdatingId === String(task.id)}
                    >
                      {taskUpdatingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{taskUpdatingId === String(task.id) ? 'Updating...' : getUserTaskActionLabel(task)}</span>
                    </button>
                    <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => openTaskDetail(task.id)} disabled={taskViewingId === String(task.id)}>
                      {taskViewingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{taskViewingId === String(task.id) ? 'Loading...' : 'View'}</span>
                    </button>
                  </div>
                </div>
              </div>
                );
              })()
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
                resetTaskEditorState();
                setTaskModalOpen(true);
              }}>
                <FiFilePlus />
                New Task
              </button>
            </div>
          </div>
          <div className="home-task-filter-panels">
            <div className="home-task-filter-panel">
              <div className="home-task-filter-label">Status</div>
              <div className="prj-filter-group prj-time-filter home-task-status-row">
                <button type="button" className={`prj-time-btn${taskStatusFilter === '' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('')}>All</button>
                <button type="button" className={`prj-time-btn${taskStatusFilter === 'created' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('created')}>Created</button>
                <button type="button" className={`prj-time-btn${taskStatusFilter === 'progress' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('progress')}>Progress</button>
                <button type="button" className={`prj-time-btn${taskStatusFilter === 'done' ? ' active' : ''}`} onClick={() => setTaskStatusFilter('done')}>Done</button>
              </div>
            </div>
            <div className="home-task-filter-panel">
              <div className="home-task-filter-label">Priority</div>
              <div className="prj-filter-group prj-time-filter home-task-status-row">
                <button type="button" className={`prj-time-btn${taskPriorityFilter === '' ? ' active' : ''}`} onClick={() => setTaskPriorityFilter('')}>All</button>
                <button type="button" className={`prj-time-btn${taskPriorityFilter === 'low' ? ' active' : ''}`} onClick={() => setTaskPriorityFilter('low')}>Low</button>
                <button type="button" className={`prj-time-btn${taskPriorityFilter === 'medium' ? ' active' : ''}`} onClick={() => setTaskPriorityFilter('medium')}>Medium</button>
                <button type="button" className={`prj-time-btn${taskPriorityFilter === 'high' ? ' active' : ''}`} onClick={() => setTaskPriorityFilter('high')}>High</button>
              </div>
            </div>
          </div>
          {!adminFilteredTasks.length ? <div className="task-empty">No tasks yet.</div> : null}
          <div className="task-list">
          {adminFilteredTasks.slice(0, 20).map((task) => (
            (() => {
              const projectMeta = resolveTaskProjectMeta(task);
              const showDueSoonBlink = shouldShowTaskDueSoonBlink(task);
              const dueDateText = task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'No due date';
              const startDateText = task.startDate ? new Date(task.startDate).toLocaleDateString() : '-';
              const assignedText = resolveTaskAssignees(task);
              const projectAddress = String(projectMeta.projectAddress || '').trim();
              const projectDirectionsHref = buildDirectionsHref(projectAddress);
              const statusTone = taskStatusTone(task.status);
              const priorityTone = normalizeTaskPriority(task.priority);
              return (
            <div key={task.id} className="prj-item" data-status={statusTone}>
              <div className="prj-row1">
                <div className="prj-title">{task.title || 'Untitled task'}</div>
                <div className="prj-status-inline">
                  <span className="task-inline-field">
                    <span className="task-inline-label">Status</span>
                    <span className={`pill ${statusTone}`}>{formatTaskStatus(task.status)}</span>
                  </span>
                  <span className="task-inline-field">
                    <span className="task-inline-label">Priority</span>
                    <span className={`task-priority-pill ${priorityTone}`}>{formatTaskPriority(task.priority)}</span>
                  </span>
                  {showDueSoonBlink ? (
                    <span className="task-due-soon-clock" title="Due tomorrow">
                      <FiClock />
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="address-link">
                <span className="prj-time-muted address-link-text"><strong>Project:</strong> {projectMeta.projectDescription}</span>
                <span className="address-link-icon-btn task-inline-icon" aria-hidden="true"><FiFolder /></span>
              </div>
              <div className="address-link">
                <span className="prj-time-muted address-link-text"><strong>Customer:</strong> {projectMeta.customerFullName}</span>
                <span className="address-link-icon-btn task-inline-icon" aria-hidden="true"><FiUser /></span>
              </div>
              <div className="address-link">
                <span className="prj-time-muted address-link-text"><strong>Address:</strong> {projectAddress || '-'}</span>
                {projectDirectionsHref ? (
                  <a className="address-link-icon-btn" href={projectDirectionsHref} target="_blank" rel="noreferrer" aria-label={`Open directions for ${projectAddress}`} title="Open directions">
                    <FiNavigation />
                  </a>
                ) : null}
              </div>
              <div className="prj-time-muted"><strong>Assigned:</strong> {assignedText}</div>
              {(() => {
                const descriptionItems = parseTaskDescriptionItems(task.description || '');
                if (!descriptionItems.length) return <div className="prj-time-muted">No description</div>;
                return (
                  <div className="task-desc-minimal">
                    <span className="task-desc-minimal-label">Description</span>
                    <ul className="task-location task-desc-list">
                      {descriptionItems.map((item, idx) => <li key={`${task.id}-desc-admin-${idx}`}>{item}</li>)}
                    </ul>
                  </div>
                );
              })()}
              {renderTaskChecklist(task, { compact: true })}
              <div className="prj-actions">
                <div className="prj-amount">{startDateText} → {dueDateText}</div>
                <div className="prj-action-buttons">
                  <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => openTaskDetail(task.id)} disabled={taskViewingId === String(task.id)}>
                    {taskViewingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{taskViewingId === String(task.id) ? 'Loading...' : 'View'}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost btn-tone-success btn-with-spinner"
                    onClick={() => openTaskStatusModal(task)}
                    disabled={taskUpdatingId === String(task.id)}
                  >
                      {taskUpdatingId === String(task.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{taskUpdatingId === String(task.id) ? 'Updating...' : 'Status'}</span>
                  </button>
                </div>
              </div>
            </div>
              );
            })()
          ))}
        </div>
        {!taskLoadBusy && taskCursor ? (
          <button type="button" onClick={() => loadHomeTasks()} disabled={taskLoadMoreBusy} className="btn-tone-neutral btn-with-spinner">
            {taskLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
            <span>{taskLoadMoreBusy ? 'Loading...' : 'Load more tasks'}</span>
          </button>
        ) : null}
      </div>

      <SimpleModal open={taskModalOpen} onClose={() => {
        resetTaskEditorState();
        setTaskModalOpen(false);
      }} title={taskEditId ? 'Edit Task' : 'Create Task'} size="sm">
        <div className="modal-form-grid">
          <input className="full" placeholder="title" value={taskForm.title} onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })} />
          <div className="full task-desc-editor">
            <div className="task-hint" style={{ marginBottom: 6 }}>Description (optional)</div>
            <textarea
              className="full"
              rows={4}
              placeholder="Add task notes or context"
              value={taskForm.description}
              onChange={(e) => setTaskForm({ ...taskForm, description: e.target.value })}
            />
          </div>
          <div className="full task-desc-editor">
            <div className="task-hint" style={{ marginBottom: 6 }}>Checklist Items (optional)</div>
            {taskTodoItems.map((item, idx) => (
              <div key={item.localKey} className="task-desc-row">
                <span className={`task-desc-bullet${item.isDone ? ' done' : ''}`}>{item.isDone ? <FiCheckCircle /> : <FiCircle />}</span>
                <input
                  className="full"
                  placeholder={`Checklist item ${idx + 1}`}
                  value={item.text}
                  onChange={(e) => updateTaskTodoItem(item.localKey, e.target.value)}
                />
                <button
                  type="button"
                  className={`ghost ${item.isDone ? 'btn-tone-success' : 'btn-tone-warning'}`}
                  onClick={() => toggleTaskTodoItemForEditor(item.localKey)}
                >
                  {item.isDone ? 'Done' : 'Pending'}
                </button>
                <button
                  type="button"
                  className="ghost btn-tone-neutral"
                  onClick={() => removeTaskTodoItem(item.localKey)}
                  disabled={taskTodoItems.length <= 1}
                >
                  Remove
                </button>
              </div>
            ))}
            <button type="button" className="ghost btn-tone-info" onClick={addTaskTodoItem}>+ Add Checklist Item</button>
          </div>
          <select
            className="full"
            value={normalizeTaskPriority(taskForm.priority)}
            onChange={(e) => setTaskForm({ ...taskForm, priority: e.target.value })}
          >
            {TASK_PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label} Priority</option>
            ))}
          </select>
          <div className="full">
            <div className="task-hint" style={{ marginBottom: 6 }}>Start Date</div>
            <input
              className="full"
              type="datetime-local"
              placeholder="Start date"
              value={taskForm.startDate}
              onChange={(e) => setTaskForm({ ...taskForm, startDate: e.target.value })}
            />
          </div>
          <div className="full">
            <div className="task-hint" style={{ marginBottom: 6 }}>Due Date (Optional)</div>
            <input
              className="full"
              type="datetime-local"
              placeholder="Due date (optional)"
              value={taskForm.dueDate}
              onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
            />
          </div>
          <input
            className="full"
            placeholder="Address (optional)"
            value={taskForm.address}
            onChange={(e) => setTaskForm({ ...taskForm, address: e.target.value })}
          />
          <div className="full">
            <div className="task-hint" style={{ marginBottom: 6 }}>Assign Users (optional)</div>
            <input
              className="full"
              placeholder="Search users to assign"
              value={taskUsersPickerOpen ? taskUsersSearch : selectedAssigneesLabel}
              onFocus={async () => {
                if (!taskUsersPickerOpen) setTaskUsersSearch('');
                setTaskProjectsPickerOpen(false);
                setTaskUsersPickerOpen(true);
                await ensureTaskUsersLoaded().catch(() => {});
              }}
              onClick={async () => {
                if (!taskUsersPickerOpen) setTaskUsersSearch('');
                setTaskProjectsPickerOpen(false);
                setTaskUsersPickerOpen((prev) => !prev);
                await ensureTaskUsersLoaded().catch(() => {});
              }}
              onChange={(e) => {
                setTaskProjectsPickerOpen(false);
                setTaskUsersPickerOpen(true);
                setTaskUsersSearch(e.target.value);
              }}
              style={{ marginBottom: 8 }}
            />
            {taskUsersPickerOpen ? (
            <div className="task-project-scroll task-project-picker" style={{ maxHeight: 160 }}>
              {taskUserOptions.map((user) => {
                const userId = String(user?.id || '');
                const selected = Array.isArray(taskForm.assignedToUserIds) && taskForm.assignedToUserIds.includes(userId);
                return (
                  <button
                    key={userId}
                    type="button"
                    className={`task-project-item${selected ? ' selected' : ''}`}
                    onClick={() => {
                      const prevIds = Array.isArray(taskForm.assignedToUserIds) ? taskForm.assignedToUserIds : [];
                      const nextIds = selected
                        ? prevIds.filter((id) => id !== userId)
                        : [...prevIds, userId];
                      setTaskForm({ ...taskForm, assignedToUserIds: nextIds });
                      setTaskUsersPickerOpen(false);
                    }}
                  >
                    <span className="task-project-title">{`${user?.name || ''} ${user?.surname || ''}`.trim() || user?.email || userId}</span>
                    <small className="task-project-meta">{user?.email || '-'}</small>
                  </button>
                );
              })}
              {!taskUserOptions.length ? <div className="muted">No users found.</div> : null}
            </div>
            ) : null}
          </div>
          <div className="full">
            <div className="task-hint" style={{ marginBottom: 6 }}>Project (optional): latest 5 first, scroll to load more.</div>
            <input
              className="full"
              placeholder="Search project"
              value={taskProjectsPickerOpen ? taskProjectsSearch : selectedProjectLabel}
              onFocus={async () => {
                if (!taskProjectsPickerOpen) setTaskProjectsSearch('');
                setTaskUsersPickerOpen(false);
                setTaskProjectsPickerOpen(true);
                await ensureTaskProjectsLoaded().catch(() => {});
              }}
              onClick={async () => {
                if (!taskProjectsPickerOpen) setTaskProjectsSearch('');
                setTaskUsersPickerOpen(false);
                setTaskProjectsPickerOpen((prev) => !prev);
                await ensureTaskProjectsLoaded().catch(() => {});
              }}
              onChange={(e) => {
                setTaskUsersPickerOpen(false);
                setTaskProjectsPickerOpen(true);
                setTaskProjectsSearch(e.target.value);
              }}
              style={{ marginBottom: 8 }}
            />
            {taskProjectsPickerOpen ? (
            <>
            <button
              type="button"
              className={`ghost btn-tone-purple ${taskForm.projectId ? '' : 'active'}`}
              onClick={() => {
                setTaskForm({ ...taskForm, projectId: '' });
                setTaskProjectsPickerOpen(false);
              }}
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
                    onClick={() => {
                      setTaskForm({ ...taskForm, projectId: project.id });
                      setTaskProjectsPickerOpen(false);
                    }}
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
            </>
            ) : null}
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
              onClick={() => { setTaskStatusModalOpen(false); setTaskStatusTarget(null); }}
              disabled={Boolean(taskUpdatingId)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-tone-success btn-with-spinner"
              onClick={changeTaskStatus}
              disabled={Boolean(taskUpdatingId)}
            >
              {taskUpdatingId ? <FiLoader className="btn-spinner" /> : null}
              <span>{taskUpdatingId ? 'Updating...' : 'Update Status'}</span>
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
