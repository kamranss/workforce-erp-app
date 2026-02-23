import { useEffect, useRef, useState } from 'react';
import { FiLoader, FiPlusCircle, FiUserPlus } from 'react-icons/fi';
import { createBonus, deleteBonus, listBonuses, updateBonus } from '../api/bonusAndPenaltiesApi.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../api/expensesApi.js';
import { createPayment, deletePayment, listPayments, updatePayment } from '../api/paymentsApi.js';
import { listProjects } from '../api/projectsApi.js';
import { projectSummary, projectsFinanceOverview, userLiability } from '../api/reportsApi.js';
import { createUser, deactivateUser, listUsers, updateUser } from '../api/usersApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

const EMPTY_USER = {
  name: '',
  surname: '',
  email: '',
  passCode: '',
  role: 'user',
  paymentOption: 'hourly',
  paymentAmount: '',
  isActive: true
};

const DATE_PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: 'last15', label: 'Last 15 Days' },
  { value: 'previous15', label: 'Previous 15 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'custom', label: 'Custom' }
];

function toIsoStart(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T00:00:00.000`).toISOString();
}

function toIsoEnd(dateStr) {
  if (!dateStr) return undefined;
  return new Date(`${dateStr}T23:59:59.999`).toISOString();
}

function toInputDateTime(isoDate) {
  if (!isoDate) return '';
  const dt = new Date(isoDate);
  if (Number.isNaN(dt.getTime())) return '';
  const tzOffset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 16);
}

function resolvePresetRange(preset, customFrom, customTo) {
  if (preset === 'all' || !preset) {
    return { from: undefined, to: undefined };
  }
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (preset === 'custom') {
    return {
      from: toIsoStart(customFrom),
      to: toIsoEnd(customTo)
    };
  }

  if (preset === 'thisMonth') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const to = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      from: toIsoStart(from.toISOString().slice(0, 10)),
      to: toIsoEnd(to.toISOString().slice(0, 10))
    };
  }

  if (preset === 'previousMonth') {
    const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const to = new Date(today.getFullYear(), today.getMonth(), 0);
    return {
      from: toIsoStart(from.toISOString().slice(0, 10)),
      to: toIsoEnd(to.toISOString().slice(0, 10))
    };
  }

  if (preset === 'previous15') {
    const end = new Date(today);
    end.setDate(end.getDate() - 15);
    const start = new Date(end);
    start.setDate(start.getDate() - 14);
    return {
      from: toIsoStart(start.toISOString().slice(0, 10)),
      to: toIsoEnd(end.toISOString().slice(0, 10))
    };
  }

  const start = new Date(today);
  start.setDate(start.getDate() - 14);
  return {
    from: toIsoStart(start.toISOString().slice(0, 10)),
    to: toIsoEnd(today.toISOString().slice(0, 10))
  };
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function hoursFromMinutes(minutes) {
  return (Number(minutes || 0) / 60).toFixed(2);
}

function buildFinanceOverviewChart(quoteAmount, laborUsed, expensesUsed, remainingFromQuote) {
  const quote = Math.max(0, Number(quoteAmount || 0));
  const labor = Math.max(0, Number(laborUsed || 0));
  const expenses = Math.max(0, Number(expensesUsed || 0));
  const remainingRaw = Number(remainingFromQuote || 0);
  const remaining = Math.max(0, remainingRaw);
  const fallbackBase = labor + expenses + remaining;
  const base = quote > 0 ? quote : Math.max(fallbackBase, 1);

  const laborPct = Math.max(0, Math.min(100, (labor / base) * 100));
  const expensePct = Math.max(0, Math.min(100 - laborPct, (expenses / base) * 100));
  const remainingPct = Math.max(0, 100 - laborPct - expensePct);
  const consumedPct = Math.max(0, Math.min(100, ((labor + expenses) / base) * 100));
  const overrun = remainingRaw < 0 ? Math.abs(remainingRaw) : Math.max(0, (labor + expenses) - quote);

  const chartStyle = {
    background: `conic-gradient(#ef4444 0 ${laborPct}%, #f59e0b ${laborPct}% ${laborPct + expensePct}%, #22c55e ${laborPct + expensePct}% ${laborPct + expensePct + remainingPct}%, var(--fin-project-ring) ${laborPct + expensePct + remainingPct}% 100%)`
  };

  const tone = consumedPct >= 75 ? 'danger' : consumedPct >= 50 ? 'warn' : 'good';
  return { chartStyle, consumedPct, overrun, tone };
}

function pickNumber(source, keys, fallback = 0) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return fallback;
}

function pickText(source, keys, fallback = '') {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return fallback;
}

function projectStatusTone(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'ongoing') return 'ongoing';
  if (key === 'finished') return 'finished';
  if (key === 'canceled') return 'canceled';
  if (key === 'waiting') return 'waiting';
  return 'unknown';
}

function normalizeProjectSummary(raw) {
  const root = raw || {};
  const summary = root.summary || root.totals || {};
  const project = root.project || root.projectInfo || {};

  return {
    projectDescription: pickText(root, ['projectDescription'], '')
      || pickText(project, ['description', 'name'], '')
      || pickText(root, ['description'], ''),
    projectStatus: pickText(root, ['projectStatus', 'status'], '')
      || pickText(project, ['status'], ''),
    projectQuoteAmount: pickNumber(root, ['projectQuoteAmount', 'quoteAmount'], 0)
      || pickNumber(project, ['quoteAmount'], 0)
      || pickNumber(summary, ['projectQuoteAmount', 'quoteAmount'], 0),
    projectQuoteNumber: pickText(root, ['projectQuoteNumber', 'quoteNumber'], '')
      || pickText(project, ['quoteNumber'], ''),
    laborMinutes: pickNumber(root, ['laborMinutes', 'totalLaborMinutes'], 0)
      || pickNumber(summary, ['laborMinutes', 'totalLaborMinutes'], 0),
    laborEarnings: pickNumber(root, ['laborEarnings', 'totalLaborEarnings'], 0)
      || pickNumber(summary, ['laborEarnings', 'totalLaborEarnings'], 0),
    expenseTotal: pickNumber(root, ['expenseTotal', 'totalExpenses'], 0)
      || pickNumber(summary, ['expenseTotal', 'totalExpenses'], 0),
    netCost: pickNumber(root, ['netCost', 'totalCost'], 0)
      || pickNumber(summary, ['netCost', 'totalCost'], 0)
  };
}

function normalizeUserFinancialSummary(raw) {
  const source = raw?.summary || raw?.totals || raw?.data?.summary || raw?.data?.totals || raw?.data || raw || {};
  const laborMinutes = Number(source?.laborMinutes || 0);
  const laborEarnings = Number(source?.laborEarnings || 0);
  const paymentsTotal = Number(source?.paymentsTotal || 0);
  const pendingTotal = Number(source?.pendingTotal || 0);
  const bonusPenaltyTotal = Number(source?.bonusPenaltyTotal || 0);
  return {
    laborMinutes,
    totalHours: laborMinutes / 60,
    totalEarned: laborEarnings,
    paidTotal: paymentsTotal,
    pendingTotal,
    bonusPenaltyTotal
  };
}

export default function Finance() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();
  const [users, setUsers] = useState([]);
  const [usersCursor, setUsersCursor] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoadMoreBusy, setUsersLoadMoreBusy] = useState(false);
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [paymentForm, setPaymentForm] = useState({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
  const [paymentEditId, setPaymentEditId] = useState('');
  const [paymentEditBusyId, setPaymentEditBusyId] = useState('');
  const [paymentCursor, setPaymentCursor] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentLoadMoreBusy, setPaymentLoadMoreBusy] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState({ userId: '', method: '', from: '', to: '' });
  const [expenseForm, setExpenseForm] = useState({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
  const [expenseEditId, setExpenseEditId] = useState('');
  const [expenseEditBusyId, setExpenseEditBusyId] = useState('');
  const [expenseCursor, setExpenseCursor] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseLoadMoreBusy, setExpenseLoadMoreBusy] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState({ scope: '', type: '', projectId: '', rangePreset: 'all', customFrom: '', customTo: '' });
  const [bonusForm, setBonusForm] = useState({ userId: '', amount: '', description: '', effectiveAt: '' });
  const [bonusEditId, setBonusEditId] = useState('');
  const [bonusEditBusyId, setBonusEditBusyId] = useState('');
  const [bonusCursor, setBonusCursor] = useState(null);
  const [bonusLoading, setBonusLoading] = useState(false);
  const [bonusLoadMoreBusy, setBonusLoadMoreBusy] = useState(false);
  const [bonusFilter, setBonusFilter] = useState({ userId: '', rangePreset: 'all', customFrom: '', customTo: '' });
  const [reportProjects, setReportProjects] = useState([]);
  const [reportProjectsCursor, setReportProjectsCursor] = useState(null);
  const [reportProjectsLoading, setReportProjectsLoading] = useState(false);
  const [reportProjectsLoadMoreBusy, setReportProjectsLoadMoreBusy] = useState(false);
  const [reportStatusFilter, setReportStatusFilter] = useState('ongoing');
  const [reportSearch, setReportSearch] = useState('');
  const [reportDateFrom, setReportDateFrom] = useState('');
  const [reportDateTo, setReportDateTo] = useState('');
  const [reportOverview, setReportOverview] = useState(null);
  const [reportOverviewLoading, setReportOverviewLoading] = useState(false);
  const [selectedReportProjectId, setSelectedReportProjectId] = useState('');
  const [selectedProjectSummary, setSelectedProjectSummary] = useState(null);
  const [reportProjectModalOpen, setReportProjectModalOpen] = useState(false);
  const [reportDetailsModalOpen, setReportDetailsModalOpen] = useState(false);
  const [reportDetailsTab, setReportDetailsTab] = useState('ongoing');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userToggleBusyId, setUserToggleBusyId] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [paymentDeleteBusyId, setPaymentDeleteBusyId] = useState('');
  const [expenseDeleteBusyId, setExpenseDeleteBusyId] = useState('');
  const [bonusDeleteBusyId, setBonusDeleteBusyId] = useState('');
  const [userEditId, setUserEditId] = useState('');
  const [userEditBusyId, setUserEditBusyId] = useState('');
  const [userEditMeta, setUserEditMeta] = useState({ id: '', role: '', isActive: true });
  const [userSummaryModalOpen, setUserSummaryModalOpen] = useState(false);
  const [userSummaryBusyId, setUserSummaryBusyId] = useState('');
  const [userSummaryLoading, setUserSummaryLoading] = useState(false);
  const [selectedUserSummaryUser, setSelectedUserSummaryUser] = useState(null);
  const [selectedUserSummaryData, setSelectedUserSummaryData] = useState(null);
  const [financeTab, setFinanceTab] = useState('reports');
  const [expenditureTab, setExpenditureTab] = useState('expenses');
  const [hasLoaded, setHasLoaded] = useState(false);
  const [paymentsTabLoaded, setPaymentsTabLoaded] = useState(false);
  const [expensesTabLoaded, setExpensesTabLoaded] = useState(false);
  const [bonusesTabLoaded, setBonusesTabLoaded] = useState(false);
  const lastRefreshRef = useRef(0);

  const isActive = activeTab === 'finance';
  const roleLower = String(role || '').toLowerCase();
  const canManage = roleLower === 'admin' || roleLower === 'superadmin';
  const canDelete = roleLower === 'superadmin';
  const canManageTargetUser = (targetRole) => roleLower === 'superadmin' || String(targetRole || '').toLowerCase() === 'user';

  const loadPaymentsData = async ({ reset = false } = {}) => {
    if (paymentLoading && !reset) return;
    if (!reset && !paymentCursor) {
      showToast('No more payments to load.');
      return [];
    }
    if (reset) setPaymentLoading(true);
    else setPaymentLoadMoreBusy(true);
    try {
      const p = await listPayments({
        limit: 5,
        cursor: reset ? undefined : paymentCursor,
        userId: paymentFilter.userId || undefined,
        method: paymentFilter.method || undefined,
        from: toIsoStart(paymentFilter.from),
        to: toIsoEnd(paymentFilter.to)
      });
      const nextPayments = Array.isArray(p?.items) ? p.items : [];
      setPayments((prev) => (reset ? nextPayments : [...prev, ...nextPayments]));
      setPaymentCursor(p?.nextCursor || null);
      return nextPayments;
    } catch (err) {
      showToast(err?.message || 'Failed to load payments.');
      return [];
    } finally {
      setPaymentLoading(false);
      setPaymentLoadMoreBusy(false);
    }
  };

  const loadBonusesData = async ({ reset = false } = {}) => {
    if (bonusLoading && !reset) return;
    if (!reset && !bonusCursor) {
      showToast('No more bonuses to load.');
      return [];
    }
    const range = resolvePresetRange(bonusFilter.rangePreset, bonusFilter.customFrom, bonusFilter.customTo);
    if (bonusFilter.rangePreset === 'custom' && (!bonusFilter.customFrom || !bonusFilter.customTo)) {
      showToast('Pick both custom dates for bonuses filter.');
      return [];
    }
    if (reset) setBonusLoading(true);
    else setBonusLoadMoreBusy(true);
    try {
      const b = await listBonuses({
        limit: 5,
        cursor: reset ? undefined : bonusCursor,
        userId: bonusFilter.userId || undefined,
        from: range.from,
        to: range.to
      });
      const nextBonuses = Array.isArray(b?.items) ? b.items : [];
      setBonuses((prev) => (reset ? nextBonuses : [...prev, ...nextBonuses]));
      setBonusCursor(b?.nextCursor || null);
      return nextBonuses;
    } catch (err) {
      showToast(err?.message || 'Failed to load bonuses.');
      return [];
    } finally {
      setBonusLoading(false);
      setBonusLoadMoreBusy(false);
    }
  };

  const loadExpensesData = async ({ reset = false } = {}) => {
    if (expenseLoading && !reset) return;
    if (!reset && !expenseCursor) {
      showToast('No more expenses to load.');
      return [];
    }
    const range = resolvePresetRange(expenseFilter.rangePreset, expenseFilter.customFrom, expenseFilter.customTo);
    if (expenseFilter.rangePreset === 'custom' && (!expenseFilter.customFrom || !expenseFilter.customTo)) {
      showToast('Pick both custom dates for expenses filter.');
      return [];
    }
    if (reset) setExpenseLoading(true);
    else setExpenseLoadMoreBusy(true);
    try {
      const e = await listExpenses({
        limit: 5,
        cursor: reset ? undefined : expenseCursor,
        scope: expenseFilter.scope || undefined,
        type: expenseFilter.type || undefined,
        projectId: expenseFilter.projectId || undefined,
        from: range.from,
        to: range.to
      });
      const nextExpenses = Array.isArray(e?.items) ? e.items : [];
      setExpenses((prev) => (reset ? nextExpenses : [...prev, ...nextExpenses]));
      setExpenseCursor(e?.nextCursor || null);
      return nextExpenses;
    } catch (err) {
      showToast(err?.message || 'Failed to load expenses.');
      return [];
    } finally {
      setExpenseLoading(false);
      setExpenseLoadMoreBusy(false);
    }
  };

  const loadUsers = async ({ reset = false } = {}) => {
    if (usersLoading && !reset) return;
    if (!reset && !usersCursor) return;
    if (reset) setUsersLoading(true);
    else setUsersLoadMoreBusy(true);
    try {
      const u = await listUsers({ limit: 20, cursor: reset ? undefined : usersCursor });
      const nextUsers = Array.isArray(u?.items) ? u.items : [];
      setUsers((prev) => (reset ? nextUsers : [...prev, ...nextUsers]));
      setUsersCursor(u?.nextCursor || null);
      return nextUsers;
    } finally {
      setUsersLoading(false);
      setUsersLoadMoreBusy(false);
    }
  };

  const loadAll = async () => {
    try {
      const [usersOut, prj] = await Promise.all([
        loadUsers({ reset: true }),
        listProjects({ limit: 20 })
      ]);
      const nextUsers = usersOut || [];
      const nextProjects = prj?.items || [];
      setProjects(nextProjects);
      setPaymentForm((prev) => ({ ...prev, userId: prev.userId || nextUsers[0]?.id || '' }));
      setBonusForm((prev) => ({ ...prev, userId: prev.userId || nextUsers[0]?.id || '' }));
      setExpenseForm((prev) => ({ ...prev, projectId: prev.projectId || nextProjects[0]?.id || '' }));
    } catch (err) {
      showToast(err?.message || 'Failed to load admin data.');
    }
  };

  const loadProjectsOverview = async () => {
    setReportOverviewLoading(true);
    try {
      const data = await projectsFinanceOverview({
        from: toIsoStart(reportDateFrom),
        to: toIsoEnd(reportDateTo)
      });
      setReportOverview(data?.totals || null);
    } catch (err) {
      showToast(err?.message || 'Failed to load finance overview.');
    } finally {
      setReportOverviewLoading(false);
    }
  };

  const loadReportProjects = async ({ reset = false } = {}) => {
    if (reportProjectsLoading && !reset) return;
    if (!reset && !reportProjectsCursor) return;
    if (reset) setReportProjectsLoading(true);
    else setReportProjectsLoadMoreBusy(true);
    try {
      const data = await listProjects({
        limit: 10,
        cursor: reset ? undefined : reportProjectsCursor,
        status: reportStatusFilter || undefined,
        q: String(reportSearch || '').trim() || undefined
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setReportProjects((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setReportProjectsCursor(data?.nextCursor || null);
    } catch (err) {
      showToast(err?.message || 'Failed to load projects list.');
    } finally {
      setReportProjectsLoading(false);
      setReportProjectsLoadMoreBusy(false);
    }
  };

  const loadProjectSummary = async (projectId) => {
    if (!projectId) return;
    setReportBusy(true);
    setSelectedReportProjectId(String(projectId));
    try {
      const data = await projectSummary({
        projectId,
        from: toIsoStart(reportDateFrom),
        to: toIsoEnd(reportDateTo)
      });
      setSelectedProjectSummary(normalizeProjectSummary(data));
    } catch (err) {
      showToast(err?.message || 'Failed to load project summary.');
    } finally {
      setReportBusy(false);
    }
  };

  const openProjectSummaryModal = (projectId) => {
    setSelectedProjectSummary(null);
    setReportProjectModalOpen(true);
    loadProjectSummary(projectId).catch(() => {});
  };

  useEffect(() => {
    if (!isActive || !canManage || hasLoaded) return;
    const stop = showGlobalLoader ? showGlobalLoader('Loading finance...', { center: true }) : () => {};
    loadAll()
      .finally(() => {
        setHasLoaded(true);
        stop();
      })
      .catch(() => {});
  }, [isActive, canManage, hasLoaded]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded) return;
    if (financeTab === 'reports') {
      const stop = showGlobalLoader ? showGlobalLoader('Loading reports...') : () => {};
      Promise.all([loadProjectsOverview(), loadReportProjects({ reset: true })]).finally(stop).catch(() => {});
      return;
    }
    if (financeTab !== 'expenditure') return;
    if (expenditureTab === 'payments' && !paymentsTabLoaded) {
      const stop = showGlobalLoader ? showGlobalLoader('Loading payments...', { center: true }) : () => {};
      loadPaymentsData({ reset: true }).finally(() => {
        setPaymentsTabLoaded(true);
        stop();
      }).catch(() => {});
      return;
    }
    if (expenditureTab === 'expenses' && !expensesTabLoaded) {
      const stop = showGlobalLoader ? showGlobalLoader('Loading expenses...', { center: true }) : () => {};
      loadExpensesData({ reset: true }).finally(() => {
        setExpensesTabLoaded(true);
        stop();
      }).catch(() => {});
      return;
    }
    if (expenditureTab === 'bonuses' && !bonusesTabLoaded) {
      const stop = showGlobalLoader ? showGlobalLoader('Loading bonuses...', { center: true }) : () => {};
      loadBonusesData({ reset: true }).finally(() => {
        setBonusesTabLoaded(true);
        stop();
      }).catch(() => {});
    }
  }, [canManage, hasLoaded, financeTab, expenditureTab, paymentsTabLoaded, expensesTabLoaded, bonusesTabLoaded]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded) return;
    if (financeTab !== 'reports') return;
    loadProjectsOverview().catch(() => {});
    loadReportProjects({ reset: true }).catch(() => {});
  }, [canManage, hasLoaded, financeTab, reportStatusFilter, reportSearch]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    if (financeTab === 'users') {
      loadUsers({ reset: true }).catch(() => {});
      return;
    }
    if (financeTab === 'reports') {
      Promise.all([loadProjectsOverview(), loadReportProjects({ reset: true })]).catch(() => {});
      return;
    }
    if (financeTab === 'expenditure') {
      if (expenditureTab === 'payments') {
        loadPaymentsData({ reset: true }).catch(() => {});
      } else if (expenditureTab === 'expenses') {
        loadExpensesData({ reset: true }).catch(() => {});
      } else if (expenditureTab === 'bonuses') {
        loadBonusesData({ reset: true }).catch(() => {});
      }
    }
  }, [isActive, hasLoaded, refreshTick, financeTab, expenditureTab]);

  const saveUser = async () => {
    setUserSaving(true);
    try {
      const payload = {
        ...userForm,
        paymentAmount: Number(userForm.paymentAmount || 0),
        passCode: String(userForm.passCode || '').trim() || undefined
      };
      if (!payload.passCode) delete payload.passCode;

      if (userEditId) {
        await updateUser(userEditId, payload);
      } else {
        await createUser(payload);
      }
      setUserForm(EMPTY_USER);
      setUserEditId('');
      setUserEditMeta({ id: '', role: '', isActive: true });
      setUserModalOpen(false);
      await loadAll();
      showToast(userEditId ? 'User updated.' : 'User created.');
    } catch (err) {
      showToast(err?.message || (userEditId ? 'Update user failed.' : 'Create user failed.'));
    } finally {
      setUserSaving(false);
    }
  };

  const startEditUser = async (user) => {
    if (!user?.id) return;
    if (!canManageTargetUser(user.role)) {
      showToast('You cannot manage this user role.');
      return;
    }
    setUserEditBusyId(String(user.id));
    try {
      setUserEditId(String(user.id));
      setUserForm({
        name: user?.name || '',
        surname: user?.surname || '',
        email: user?.email || '',
        passCode: '',
        role: user?.role || 'user',
        paymentOption: user?.paymentOption || 'hourly',
        paymentAmount: user?.paymentAmount ?? '',
        isActive: user?.isActive !== false
      });
      setUserEditMeta({ id: String(user.id), role: user?.role || 'user', isActive: user?.isActive !== false });
      setUserModalOpen(true);
    } finally {
      setUserEditBusyId('');
    }
  };

  const deactivateFromEditModal = async () => {
    if (!userEditId) return;
    if (!canManageTargetUser(userEditMeta.role)) {
      showToast('You cannot manage this user role.');
      return;
    }
    setUserToggleBusyId(String(userEditId));
    try {
      await deactivateUser(userEditId);
      setUserEditMeta((prev) => ({ ...prev, isActive: false }));
      setUserForm((prev) => ({ ...prev, isActive: false }));
      await loadAll();
      showToast('User deactivated.');
    } catch (err) {
      showToast(err?.message || 'Deactivate failed.');
    } finally {
      setUserToggleBusyId('');
    }
  };

  const activateFromEditModal = async () => {
    if (!userEditId) return;
    if (!canManageTargetUser(userEditMeta.role)) {
      showToast('You cannot manage this user role.');
      return;
    }
    setUserToggleBusyId(String(userEditId));
    try {
      await updateUser(userEditId, { isActive: true });
      setUserEditMeta((prev) => ({ ...prev, isActive: true }));
      setUserForm((prev) => ({ ...prev, isActive: true }));
      await loadAll();
      showToast('User activated.');
    } catch (err) {
      showToast(err?.message || 'Activate failed.');
    } finally {
      setUserToggleBusyId('');
    }
  };

  const savePayment = async () => {
    setPaymentSaving(true);
    try {
      const body = {
        userId: paymentForm.userId,
        amount: Number(paymentForm.amount || 0),
        paidAt: paymentForm.paidAt ? new Date(paymentForm.paidAt).toISOString() : undefined,
        method: paymentForm.method,
        notes: paymentForm.notes
      };
      if (paymentEditId) {
        await updatePayment(paymentEditId, body);
      } else {
        await createPayment(body);
      }
      setPaymentForm({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
      setPaymentEditId('');
      setPaymentModalOpen(false);
      await loadPaymentsData({ reset: true });
      showToast(paymentEditId ? 'Payment updated.' : 'Payment saved.');
    } catch (err) {
      showToast(err?.message || (paymentEditId ? 'Payment update failed.' : 'Payment failed.'));
    } finally {
      setPaymentSaving(false);
    }
  };

  const startEditPayment = async (item) => {
    if (!item?.id) return;
    setPaymentEditBusyId(String(item.id));
    try {
      setPaymentEditId(String(item.id));
      setPaymentForm({
        userId: item?.userId || '',
        amount: item?.amount ?? '',
        method: item?.method || 'cash',
        notes: item?.notes || item?.description || '',
        paidAt: toInputDateTime(item?.paidAt || item?.createdAt)
      });
      setPaymentModalOpen(true);
    } finally {
      setPaymentEditBusyId('');
    }
  };

  const saveExpense = async () => {
    setExpenseSaving(true);
    try {
      const scope = expenseForm.scope || 'project';
      if (scope === 'project' && !expenseForm.projectId) {
        showToast('Project is required for project scope expense.');
        return;
      }
      const body = {
        scope,
        projectId: scope === 'company' ? null : expenseForm.projectId,
        type: expenseForm.type,
        amount: Number(expenseForm.amount || 0),
        notes: expenseForm.notes,
        spentAt: expenseForm.spentAt ? new Date(expenseForm.spentAt).toISOString() : undefined
      };
      if (expenseEditId) {
        await updateExpense(expenseEditId, body);
      } else {
        await createExpense(body);
      }
      setExpenseForm({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
      setExpenseEditId('');
      setExpenseModalOpen(false);
      await loadExpensesData({ reset: true });
      showToast(expenseEditId ? 'Expense updated.' : 'Expense saved.');
    } catch (err) {
      showToast(err?.message || (expenseEditId ? 'Expense update failed.' : 'Expense failed.'));
    } finally {
      setExpenseSaving(false);
    }
  };

  const startEditExpense = async (item) => {
    if (!item?.id) return;
    setExpenseEditBusyId(String(item.id));
    try {
      setExpenseEditId(String(item.id));
      setExpenseForm({
        scope: item?.scope || (item?.projectId ? 'project' : 'company'),
        projectId: item?.projectId || '',
        type: item?.type || 'material',
        amount: item?.amount ?? '',
        notes: item?.notes || '',
        spentAt: toInputDateTime(item?.spentAt || item?.createdAt)
      });
      setExpenseModalOpen(true);
    } finally {
      setExpenseEditBusyId('');
    }
  };

  const saveBonus = async () => {
    setBonusSaving(true);
    try {
      const body = {
        userId: bonusForm.userId,
        amount: Number(bonusForm.amount || 0),
        description: bonusForm.description,
        effectiveAt: bonusForm.effectiveAt ? new Date(bonusForm.effectiveAt).toISOString() : undefined
      };
      if (bonusEditId) {
        await updateBonus(bonusEditId, body);
      } else {
        await createBonus(body);
      }
      setBonusForm({ userId: '', amount: '', description: '', effectiveAt: '' });
      setBonusEditId('');
      setBonusModalOpen(false);
      await loadBonusesData({ reset: true });
      showToast(bonusEditId ? 'Bonus/Penalty updated.' : 'Bonus/Penalty saved.');
    } catch (err) {
      showToast(err?.message || (bonusEditId ? 'Bonus/Penalty update failed.' : 'Bonus/Penalty failed.'));
    } finally {
      setBonusSaving(false);
    }
  };

  const startEditBonus = async (item) => {
    if (!item?.id) return;
    setBonusEditBusyId(String(item.id));
    try {
      setBonusEditId(String(item.id));
      setBonusForm({
        userId: item?.userId || '',
        amount: item?.amount ?? '',
        description: item?.description || '',
        effectiveAt: toInputDateTime(item?.effectiveAt || item?.createdAt)
      });
      setBonusModalOpen(true);
    } finally {
      setBonusEditBusyId('');
    }
  };

  const onDeletePayment = async (id) => {
    setPaymentDeleteBusyId(String(id || ''));
    try {
      await deletePayment(id);
      await loadPaymentsData({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Delete payment failed.');
    } finally {
      setPaymentDeleteBusyId('');
    }
  };

  const onDeleteExpense = async (id) => {
    setExpenseDeleteBusyId(String(id || ''));
    try {
      await deleteExpense(id);
      await loadExpensesData({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Delete expense failed.');
    } finally {
      setExpenseDeleteBusyId('');
    }
  };

  const onDeleteBonus = async (id) => {
    setBonusDeleteBusyId(String(id || ''));
    try {
      await deleteBonus(id);
      await loadBonusesData({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Delete bonus failed.');
    } finally {
      setBonusDeleteBusyId('');
    }
  };

  if (!isActive) return <div id="financePage" className="tab-page hidden" />;
  if (!canManage) return <div id="financePage" className="tab-page active section card">Admin endpoints are not available for this role.</div>;

  const totalProjectsCount = Number(reportOverview?.totalProjects || 0);
  const ongoingProjectsCount = Number(reportOverview?.ongoingProjectsCount || 0);
  const totalQuoteAmount = Number(reportOverview?.totalQuoteAmount || 0);
  const ongoingQuoteAmount = Number(reportOverview?.ongoingQuoteAmount || 0);
  const totalLaborEarnings = Number(reportOverview?.totalLaborEarnings || 0);
  const ongoingLaborEarnings = Number(reportOverview?.ongoingLaborEarnings || 0);
  const totalExpenses = Number(reportOverview?.totalExpenses || 0);
  const ongoingExpenses = Number(reportOverview?.ongoingExpenses || 0);
  const totalConsumed = Number(reportOverview?.totalConsumed || 0);
  const ongoingConsumed = Number(reportOverview?.ongoingConsumed || 0);
  const totalRemainingFromQuote = Number(reportOverview?.totalRemainingFromQuote || 0);
  const ongoingRemainingFromQuote = Number(reportOverview?.ongoingRemainingFromQuote || 0);
  const totalOverviewChart = buildFinanceOverviewChart(totalQuoteAmount, totalLaborEarnings, totalExpenses, totalRemainingFromQuote);

  const openUserSummaryModal = async (user) => {
    if (!user?.id) return;
    const id = String(user.id);
    setUserSummaryBusyId(id);
    setSelectedUserSummaryUser(user);
    setSelectedUserSummaryData(null);
    setUserSummaryModalOpen(true);
    setUserSummaryLoading(true);
    try {
      const summaryData = await userLiability({ userId: id });
      setSelectedUserSummaryData(normalizeUserFinancialSummary(summaryData));
    } catch (err) {
      showToast(err?.message || 'Failed to load user liability.');
    } finally {
      setUserSummaryLoading(false);
      setUserSummaryBusyId('');
    }
  };
  const projectQuoteAmount = Number(selectedProjectSummary?.projectQuoteAmount || 0);
  const projectLaborEarned = Number(selectedProjectSummary?.laborEarnings || 0);
  const projectExpenses = Number(selectedProjectSummary?.expenseTotal || 0);
  const projectSpentTotal = projectLaborEarned + projectExpenses;
  const projectSpentPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectSpentTotal / projectQuoteAmount) * 100))
    : 0;
  const projectLaborPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectLaborEarned / projectQuoteAmount) * 100))
    : 0;
  const projectExpensesPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectExpenses / projectQuoteAmount) * 100))
    : 0;
  const projectChartStyle = {
    background: `conic-gradient(#ef4444 0 ${projectLaborPct}%, #f59e0b ${projectLaborPct}% ${Math.min(100, projectLaborPct + projectExpensesPct)}%, #22c55e ${Math.min(100, projectLaborPct + projectExpensesPct)}% 100%)`
  };
  const projectStatusToneClass = projectStatusTone(selectedProjectSummary?.projectStatus);

  return (
    <div id="financePage" className="tab-page active">
      <div className="section card">
        <div className="fin-tabs finance-main-tabs">
          <button
            type="button"
            className={`fin-tab${financeTab === 'reports' ? ' active' : ''}`}
            data-mode="company"
            onClick={() => setFinanceTab('reports')}
          >
            Reports
          </button>
          <button
            type="button"
            className={`fin-tab${financeTab === 'expenditure' ? ' active' : ''}`}
            data-mode="projects"
            onClick={() => setFinanceTab('expenditure')}
          >
            Expenditure
          </button>
          <button
            type="button"
            className={`fin-tab${financeTab === 'users' ? ' active' : ''}`}
            data-mode="employees"
            onClick={() => setFinanceTab('users')}
          >
            Users
          </button>
        </div>
      </div>

      {financeTab === 'users' ? (
        <div className="section card">
          <div className="home-card-head">
            <div>
              <div className="eyebrow">Admin</div>
              <h3>Users</h3>
            </div>
          </div>
          <div className="page-actions">
            <button
              type="button"
              className="ghost finance-create-cta finance-create-cta-user"
              onClick={() => {
                setUserEditId('');
                setUserEditMeta({ id: '', role: '', isActive: true });
                setUserForm(EMPTY_USER);
                setUserModalOpen(true);
              }}
            >
              <FiUserPlus />
              <span className="finance-create-cta-text">
                <strong>Add User</strong>
                <small>Tap here to create a new user account</small>
              </span>
            </button>
          </div>
          <div className="fin-tx-list fin-users-admin-list">
            {users.map((user) => (
              <div className={`fin-tx-item fin-user-admin-item${user.isActive ? '' : ' inactive'}`} key={user.id}>
                <div className="fin-tx-main">
                  <span className={`fin-tx-label${user.isActive ? '' : ' inactive'}`}><strong>{user.name} {user.surname}</strong></span>
                  <span className={`fin-tx-meta${user.isActive ? '' : ' inactive'}`}>{user.email} | {user.role} | {user.isActive ? 'active' : 'inactive'}</span>
                </div>
                {canManageTargetUser(user.role) ? null : <span className="pill">restricted</span>}
                <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="ghost btn-tone-primary btn-with-spinner"
                    onClick={() => openUserSummaryModal(user)}
                    disabled={userSummaryBusyId === String(user.id)}
                  >
                    {userSummaryBusyId === String(user.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{userSummaryBusyId === String(user.id) ? 'Loading...' : 'Overview'}</span>
                  </button>
                  <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => startEditUser(user)} disabled={userEditBusyId === String(user.id) || !canManageTargetUser(user.role)}>
                    {userEditBusyId === String(user.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{userEditBusyId === String(user.id) ? 'Loading...' : 'Edit'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!usersLoading && usersCursor ? (
            <button type="button" className="btn-tone-neutral btn-with-spinner" onClick={() => loadUsers()} disabled={usersLoadMoreBusy}>
              {usersLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
              <span>{usersLoadMoreBusy ? 'Loading...' : 'Load more users'}</span>
            </button>
          ) : null}
        </div>
      ) : null}

      {financeTab === 'reports' ? (
        <div className="section card">
          <div className="home-card-head" style={{ marginBottom: 10 }}>
            <div>
              <div className="eyebrow">Overview</div>
              <h3>Project Finance Overview</h3>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <div className="pill">All: {totalProjectsCount}</div>
              <div className="pill">Ongoing: {ongoingProjectsCount}</div>
              <button
                type="button"
                className="ghost btn-tone-info"
                onClick={() => {
                  setReportDetailsTab('ongoing');
                  setReportDetailsModalOpen(true);
                }}
              >
                Detailed Information
              </button>
            </div>
          </div>

          <div className="fin-report-overview-card">
            <div className="fin-report-donut-wrap">
              <div className="fin-report-donut" style={totalOverviewChart.chartStyle}>
                <div className="fin-report-donut-center">
                  <strong>{totalOverviewChart.consumedPct.toFixed(1)}%</strong>
                  <small>Consumed</small>
                </div>
              </div>
            </div>
            <div className="fin-report-overview-meta">
              <div className="fin-project-summary-row">
                <span className="dot labor" />
                <span>Labor Used</span>
                <strong>{money(totalLaborEarnings)}</strong>
              </div>
              <div className="fin-project-summary-row">
                <span className="dot expense" />
                <span>Expenses Used</span>
                <strong>{money(totalExpenses)}</strong>
              </div>
              <div className="fin-project-summary-row">
                <span className="dot remaining" />
                <span>Remaining From Quote</span>
                <strong>{money(ongoingRemainingFromQuote)}</strong>
              </div>
              <div className="fin-project-summary-row">
                <span className="dot agreed" />
                <span>Ongoing Agreed Value</span>
                <strong>{money(ongoingQuoteAmount)}</strong>
              </div>
              <div className={`fin-report-health ${totalOverviewChart.tone}`}>
                {totalOverviewChart.overrun > 0
                  ? `Over quote by ${money(totalOverviewChart.overrun)}`
                  : `Consumed ${totalOverviewChart.consumedPct.toFixed(1)}% of agreed value`}
              </div>
            </div>
          </div>

          <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
            <label className="payments-filter-field">
              <span>Status</span>
              <select value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)}>
                <option value="">All</option>
                <option value="waiting">Waiting</option>
                <option value="ongoing">Ongoing</option>
                <option value="finished">Finished</option>
                <option value="canceled">Canceled</option>
              </select>
            </label>
            <label className="payments-filter-field">
              <span>Search</span>
              <input placeholder="Project search" value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} />
            </label>
            <label className="payments-filter-field">
              <span>From</span>
              <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
            </label>
            <label className="payments-filter-field">
              <span>To</span>
              <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
            </label>
          </div>

          <div className="page-actions">
            <button
              type="button"
              className="ghost btn-tone-primary btn-with-spinner"
              onClick={async () => {
                await Promise.all([loadProjectsOverview(), loadReportProjects({ reset: true })]);
                if (selectedReportProjectId) {
                  await loadProjectSummary(selectedReportProjectId);
                }
              }}
              disabled={reportOverviewLoading || reportProjectsLoading || reportBusy}
            >
              {(reportOverviewLoading || reportProjectsLoading || reportBusy) ? <FiLoader className="btn-spinner" /> : null}
              <span>{(reportOverviewLoading || reportProjectsLoading || reportBusy) ? 'Applying...' : 'Apply Filters'}</span>
            </button>
            <button
              type="button"
              className="ghost btn-tone-neutral"
              onClick={() => {
                setReportStatusFilter('ongoing');
                setReportSearch('');
                setReportDateFrom('');
                setReportDateTo('');
              }}
            >
              Reset
            </button>
          </div>

          <div className="fin-tx-list" style={{ marginTop: 12 }}>
            {reportProjects.map((project) => (
              <div
                key={project.id}
                className={`fin-tx-item${selectedReportProjectId === String(project.id) ? ' active' : ''}`}
              >
                <div className="fin-tx-main">
                  <span className="fin-tx-label">{project.description || project.address?.raw || project.id}</span>
                  <span className="fin-tx-meta">{project.status || '-'} | Quote {money(project.quoteAmount)}</span>
                </div>
                <button
                  type="button"
                  className="ghost btn-tone-info btn-with-spinner"
                  onClick={() => openProjectSummaryModal(project.id)}
                  disabled={reportBusy && selectedReportProjectId === String(project.id)}
                >
                  {reportBusy && selectedReportProjectId === String(project.id) ? <FiLoader className="btn-spinner" /> : null}
                  <span>{reportBusy && selectedReportProjectId === String(project.id) ? 'Loading...' : 'View Summary'}</span>
                </button>
              </div>
            ))}
            {!reportProjectsLoading && !reportProjects.length ? <div className="muted">No projects found.</div> : null}
          </div>

          {!reportProjectsLoading && reportProjectsCursor ? (
            <button
              type="button"
              className="btn-tone-neutral btn-with-spinner"
              onClick={() => loadReportProjects()}
              disabled={reportProjectsLoadMoreBusy}
            >
              {reportProjectsLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
              <span>{reportProjectsLoadMoreBusy ? 'Loading...' : 'Load more projects'}</span>
            </button>
          ) : null}

        </div>
      ) : null}

      {financeTab === 'expenditure' ? (
        <>
          <div className="section card">
            <div className="eyebrow" style={{ marginBottom: 8 }}>Expenditure Sub-Tabs</div>
            <div className="fin-tabs finance-sub-tabs">
              <button
                type="button"
                className={`fin-tab${expenditureTab === 'expenses' ? ' active' : ''}`}
                data-mode="company"
                onClick={() => setExpenditureTab('expenses')}
              >
                Expenses
              </button>
              <button
                type="button"
                className={`fin-tab${expenditureTab === 'bonuses' ? ' active' : ''}`}
                data-mode="projects"
                onClick={() => setExpenditureTab('bonuses')}
              >
                Bonuses / Penalties
              </button>
              <button
                type="button"
                className={`fin-tab${expenditureTab === 'payments' ? ' active' : ''}`}
                data-mode="employees"
                onClick={() => setExpenditureTab('payments')}
              >
                Payments
              </button>
            </div>
          </div>

          {expenditureTab === 'payments' ? (
            <div className="section card">
              <h3>Payments</h3>
              <div className="page-actions">
                <button
                  type="button"
                  className="ghost finance-create-cta finance-create-cta-payment"
                  onClick={() => {
                    setPaymentEditId('');
                    setPaymentForm({ userId: users[0]?.id || '', amount: '', method: 'cash', notes: '', paidAt: '' });
                    setPaymentModalOpen(true);
                  }}
                >
                  <FiPlusCircle />
                  <span className="finance-create-cta-text">
                    <strong>Add Payment</strong>
                    <small>Tap here to record a new payment</small>
                  </span>
                </button>
              </div>
              <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
                <label className="payments-filter-field">
                  <span>User</span>
                  <select value={paymentFilter.userId} onChange={(e) => setPaymentFilter((prev) => ({ ...prev, userId: e.target.value }))}>
                    <option value="">All users</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} {user.surname}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Method</span>
                  <select value={paymentFilter.method} onChange={(e) => setPaymentFilter((prev) => ({ ...prev, method: e.target.value }))}>
                    <option value="">All</option>
                    <option value="cash">Cash</option>
                    <option value="zelle">Zelle</option>
                    <option value="bank">Bank</option>
                    <option value="check">Check</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>From</span>
                  <input type="date" value={paymentFilter.from} onChange={(e) => setPaymentFilter((prev) => ({ ...prev, from: e.target.value }))} />
                </label>
                <label className="payments-filter-field">
                  <span>To</span>
                  <input type="date" value={paymentFilter.to} onChange={(e) => setPaymentFilter((prev) => ({ ...prev, to: e.target.value }))} />
                </label>
                <button type="button" className="ghost btn-tone-neutral payments-reset-btn" onClick={() => {
                  setPaymentFilter({ userId: '', method: '', from: '', to: '' });
                }}>Reset</button>
                <button type="button" className="ghost btn-tone-primary" onClick={() => loadPaymentsData({ reset: true })}>Apply</button>
              </div>
              <div className="fin-tx-list">
                {payments.map((item) => (
                  <div key={item.id} className="fin-tx-item">
                    <div className="fin-tx-main">
                      <span className="fin-tx-label">{item?.user?.name ? `${item.user.name} ${item.user?.surname || ''}` : item.userId}</span>
                      <span className="fin-tx-meta">{new Date(item.paidAt || item.createdAt).toLocaleString()} | {item.method || 'method'} | {item.description || item.notes || '-'}</span>
                    </div>
                    <span className="fin-tx-amount fin-payment-amount positive">${Number(item.amount).toFixed(2)}</span>
                    <button
                      type="button"
                      className="ghost btn-tone-info btn-with-spinner"
                      onClick={() => startEditPayment(item)}
                      disabled={paymentEditBusyId === String(item.id)}
                    >
                      {paymentEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{paymentEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                    </button>
                  </div>
                ))}
              </div>
              {!paymentLoading && payments.length ? (
                <div className="fin-list-footer">
                  <button
                    type="button"
                    className="ghost btn-tone-neutral btn-with-spinner fin-list-more-btn"
                    onClick={() => loadPaymentsData()}
                    disabled={paymentLoadMoreBusy}
                  >
                    {paymentLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
                    <span>{paymentLoadMoreBusy ? 'Loading...' : 'Load more'}</span>
                  </button>
                </div>
              ) : null}
              {paymentLoading && !payments.length ? <div className="muted">Loading payments...</div> : null}
            </div>
          ) : null}

          {expenditureTab === 'expenses' ? (
            <div className="section card">
              <h3>Expenses</h3>
              <div className="page-actions">
                <button
                  type="button"
                  className="ghost finance-create-cta finance-create-cta-expense"
                  onClick={() => {
                    setExpenseEditId('');
                    setExpenseForm({ scope: 'project', projectId: projects[0]?.id || '', type: 'material', amount: '', notes: '', spentAt: '' });
                    setExpenseModalOpen(true);
                  }}
                >
                  <FiPlusCircle />
                  <span className="finance-create-cta-text">
                    <strong>Add Expense</strong>
                    <small>Tap here to create a new expense record</small>
                  </span>
                </button>
              </div>
              <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
                <label className="payments-filter-field">
                  <span>Scope</span>
                  <select value={expenseFilter.scope} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, scope: e.target.value }))}>
                    <option value="">All</option>
                    <option value="project">Project</option>
                    <option value="company">Company</option>
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Type</span>
                  <select value={expenseFilter.type} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, type: e.target.value }))}>
                    <option value="">All</option>
                    <option value="material">Material</option>
                    <option value="damage">Damage</option>
                    <option value="unknown">Unknown</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Project</span>
                  <select value={expenseFilter.projectId} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, projectId: e.target.value }))}>
                    <option value="">All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.description || project.id}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Range</span>
                  <select value={expenseFilter.rangePreset} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, rangePreset: e.target.value }))}>
                    {DATE_PRESETS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {expenseFilter.rangePreset === 'custom' ? (
                  <>
                    <label className="payments-filter-field">
                      <span>From</span>
                      <input type="date" value={expenseFilter.customFrom} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, customFrom: e.target.value }))} />
                    </label>
                    <label className="payments-filter-field">
                      <span>To</span>
                      <input type="date" value={expenseFilter.customTo} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, customTo: e.target.value }))} />
                    </label>
                  </>
                ) : null}
                <button type="button" className="ghost btn-tone-neutral payments-reset-btn" onClick={() => {
                  setExpenseFilter({ scope: '', type: '', projectId: '', rangePreset: 'all', customFrom: '', customTo: '' });
                }}>Reset</button>
                <button type="button" className="ghost btn-tone-primary" onClick={() => loadExpensesData({ reset: true })}>Apply</button>
              </div>
              <div className="fin-tx-list">
                {expenses.map((item) => (
                  <div key={item.id} className="fin-tx-item">
                    <div className="fin-tx-main">
                      <span className="fin-tx-label">{item?.scope === 'company' ? 'Company Expense' : (item?.project?.description || item.projectId || '-')}</span>
                      <span className="fin-tx-meta">{new Date(item.spentAt || item.createdAt).toLocaleString()} | {item.type} | {item.notes || '-'}</span>
                    </div>
                    <span className="fin-tx-amount negative">${Number(item.amount).toFixed(2)}</span>
                    <button
                      type="button"
                      className="ghost btn-tone-info btn-with-spinner"
                      onClick={() => startEditExpense(item)}
                      disabled={expenseEditBusyId === String(item.id)}
                    >
                      {expenseEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{expenseEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                    </button>
                  </div>
                ))}
              </div>
              {!expenseLoading && expenses.length ? (
                <div className="fin-list-footer">
                  <button
                    type="button"
                    className="ghost btn-tone-neutral btn-with-spinner fin-list-more-btn"
                    onClick={() => loadExpensesData()}
                    disabled={expenseLoadMoreBusy}
                  >
                    {expenseLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
                    <span>{expenseLoadMoreBusy ? 'Loading...' : 'Load more'}</span>
                  </button>
                </div>
              ) : null}
              {expenseLoading && !expenses.length ? <div className="muted">Loading expenses...</div> : null}
            </div>
          ) : null}

          {expenditureTab === 'bonuses' ? (
            <div className="section card">
              <h3>Bonuses / Penalties</h3>
              <div className="page-actions">
                <button
                  type="button"
                  className="ghost finance-create-cta finance-create-cta-bonus"
                  onClick={() => {
                    setBonusEditId('');
                    setBonusForm({ userId: users[0]?.id || '', amount: '', description: '', effectiveAt: '' });
                    setBonusModalOpen(true);
                  }}
                >
                  <FiPlusCircle />
                  <span className="finance-create-cta-text">
                    <strong>Add Bonus / Penalty</strong>
                    <small>Tap here to create a bonus or penalty item</small>
                  </span>
                </button>
              </div>
              <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
                <label className="payments-filter-field">
                  <span>User</span>
                  <select value={bonusFilter.userId} onChange={(e) => setBonusFilter((prev) => ({ ...prev, userId: e.target.value }))}>
                    <option value="">All users</option>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.name} {user.surname}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Range</span>
                  <select value={bonusFilter.rangePreset} onChange={(e) => setBonusFilter((prev) => ({ ...prev, rangePreset: e.target.value }))}>
                    {DATE_PRESETS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </label>
                {bonusFilter.rangePreset === 'custom' ? (
                  <>
                    <label className="payments-filter-field">
                      <span>From</span>
                      <input type="date" value={bonusFilter.customFrom} onChange={(e) => setBonusFilter((prev) => ({ ...prev, customFrom: e.target.value }))} />
                    </label>
                    <label className="payments-filter-field">
                      <span>To</span>
                      <input type="date" value={bonusFilter.customTo} onChange={(e) => setBonusFilter((prev) => ({ ...prev, customTo: e.target.value }))} />
                    </label>
                  </>
                ) : null}
                <button type="button" className="ghost btn-tone-neutral payments-reset-btn" onClick={() => {
                  setBonusFilter({ userId: '', rangePreset: 'all', customFrom: '', customTo: '' });
                }}>Reset</button>
                <button type="button" className="ghost btn-tone-primary" onClick={() => loadBonusesData({ reset: true })}>Apply</button>
              </div>
              <div className="fin-tx-list">
                {bonuses.map((item) => (
                  <div key={item.id} className="fin-tx-item">
                    <div className="fin-tx-main">
                      <span className="fin-tx-label">{item?.user?.name ? `${item.user.name} ${item.user?.surname || ''}` : item.userId}</span>
                      <span className="fin-tx-meta">{new Date(item.effectiveAt || item.createdAt).toLocaleString()} | {item.description || '-'}</span>
                    </div>
                    <span className={`fin-tx-amount ${Number(item.amount) < 0 ? 'negative' : 'positive'}`}>${Number(item.amount).toFixed(2)}</span>
                    <button
                      type="button"
                      className="ghost btn-tone-info btn-with-spinner"
                      onClick={() => startEditBonus(item)}
                      disabled={bonusEditBusyId === String(item.id)}
                    >
                      {bonusEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{bonusEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                    </button>
                  </div>
                ))}
              </div>
              {!bonusLoading && bonuses.length ? (
                <div className="fin-list-footer">
                  <button
                    type="button"
                    className="ghost btn-tone-neutral btn-with-spinner fin-list-more-btn"
                    onClick={() => loadBonusesData()}
                    disabled={bonusLoadMoreBusy}
                  >
                    {bonusLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
                    <span>{bonusLoadMoreBusy ? 'Loading...' : 'Load more'}</span>
                  </button>
                </div>
              ) : null}
              {bonusLoading && !bonuses.length ? <div className="muted">Loading bonuses...</div> : null}
            </div>
          ) : null}
        </>
      ) : null}

      <SimpleModal open={userModalOpen} onClose={() => setUserModalOpen(false)} title={userEditId ? 'Edit User' : 'Add User'}>
        <div className="modal-form-grid">
          <input placeholder="Name" value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
          <input placeholder="Surname" value={userForm.surname} onChange={(e) => setUserForm({ ...userForm, surname: e.target.value })} />
          <input className="full" placeholder="Email" value={userForm.email} onChange={(e) => setUserForm({ ...userForm, email: e.target.value })} />
          <input placeholder={userEditId ? 'PassCode 6 digits (optional)' : 'PassCode 6 digits'} value={userForm.passCode} onChange={(e) => setUserForm({ ...userForm, passCode: e.target.value })} />
          <select value={userForm.role} onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}>
            <option value="user">user</option>
            {roleLower === 'superadmin' ? <option value="admin">admin</option> : null}
            {roleLower === 'superadmin' ? <option value="superAdmin">superAdmin</option> : null}
          </select>
          <select value={userForm.paymentOption} onChange={(e) => setUserForm({ ...userForm, paymentOption: e.target.value })}>
            <option value="hourly">hourly</option>
            <option value="monthly">monthly</option>
          </select>
          <input placeholder="Payment amount" value={userForm.paymentAmount} onChange={(e) => setUserForm({ ...userForm, paymentAmount: e.target.value })} />
          {userEditId ? (
            <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Status: {userEditMeta.isActive ? 'Active' : 'Inactive'}</span>
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className="ghost btn-with-spinner"
                  onClick={userEditMeta.isActive ? deactivateFromEditModal : activateFromEditModal}
                  disabled={userToggleBusyId === String(userEditId)}
                >
                  {userToggleBusyId === String(userEditId) ? <FiLoader className="btn-spinner" /> : null}
                  <span>{userToggleBusyId === String(userEditId) ? 'Saving...' : (userEditMeta.isActive ? 'Deactivate' : 'Activate')}</span>
                </button>
                <button
                  type="button"
                  className="ghost btn-tone-danger btn-with-spinner"
                  onClick={deactivateFromEditModal}
                  disabled={userToggleBusyId === String(userEditId) || !userEditMeta.isActive}
                  title="Soft delete user"
                >
                  {userToggleBusyId === String(userEditId) ? <FiLoader className="btn-spinner" /> : null}
                  <span>{userToggleBusyId === String(userEditId) ? 'Deleting...' : 'Delete'}</span>
                </button>
              </div>
            </div>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setUserModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveUser} disabled={userSaving} className="btn-with-spinner">
              {userSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{userSaving ? (userEditId ? 'Updating...' : 'Creating...') : (userEditId ? 'Update' : 'Create')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={userSummaryModalOpen}
        onClose={() => setUserSummaryModalOpen(false)}
        title={`${selectedUserSummaryUser?.name || ''} ${selectedUserSummaryUser?.surname || ''}`.trim() || 'User Overview'}
        size="md"
      >
        <div className="modal-form-grid">
          {(() => {
            const earned = Number(selectedUserSummaryData?.totalEarned || 0);
            const paid = Number(selectedUserSummaryData?.paidTotal || 0);
            const pending = Number(selectedUserSummaryData?.pendingTotal || 0);
            const paidPct = earned > 0 ? Math.min(100, Math.max(0, (paid / earned) * 100)) : 0;
            const pendingPct = earned > 0 ? Math.min(100, Math.max(0, (pending / earned) * 100)) : 0;
            const userChartStyle = {
              background: `conic-gradient(#22c55e 0 ${paidPct}%, #f59e0b ${paidPct}% ${Math.min(100, paidPct + pendingPct)}%, rgba(255,255,255,0.14) ${Math.min(100, paidPct + pendingPct)}% 100%)`
            };
            return (
              <div className="full fin-user-summary-chart-card">
                <div className="fin-user-summary-donut-wrap">
                  <div className="fin-user-summary-donut" style={userChartStyle}>
                    <div className="fin-user-summary-donut-center">
                      {userSummaryLoading ? <FiLoader className="btn-spinner" /> : <strong>{paidPct.toFixed(1)}%</strong>}
                      <small>{userSummaryLoading ? 'Loading' : 'Paid'}</small>
                    </div>
                  </div>
                </div>
                <div className="fin-user-summary-chart-meta">
                  <div className="fin-user-summary-row">
                    <span className="dot earned" />
                    <span>Earned</span>
                    <strong>{money(earned)}</strong>
                  </div>
                  <div className="fin-user-summary-row">
                    <span className="dot paid" />
                    <span>Paid</span>
                    <strong>{money(paid)}</strong>
                  </div>
                  <div className="fin-user-summary-row">
                    <span className="dot pending" />
                    <span>Pending</span>
                    <strong>{money(pending)}</strong>
                  </div>
                </div>
              </div>
            );
          })()}
          <div className="full home-stat-grid fin-user-summary-metrics">
            <div className="home-metric"><span className="home-metric-label">Total Hours</span><span className="home-metric-value">{Number(selectedUserSummaryData?.totalHours || 0).toFixed(2)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Total Earned</span><span className="home-metric-value">{money(selectedUserSummaryData?.totalEarned)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Total Paid</span><span className="home-metric-value">{money(selectedUserSummaryData?.paidTotal)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Pending</span><span className="home-metric-value">{money(selectedUserSummaryData?.pendingTotal)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Bonus/Penalty</span><span className="home-metric-value">{money(selectedUserSummaryData?.bonusPenaltyTotal)}</span></div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={reportDetailsModalOpen}
        onClose={() => setReportDetailsModalOpen(false)}
        title="Report Detailed Information"
        size="md"
      >
        <div className="modal-form-grid">
          <div className="fin-tabs finance-sub-tabs">
            <button
              type="button"
              className={`fin-tab${reportDetailsTab === 'ongoing' ? ' active' : ''}`}
              onClick={() => setReportDetailsTab('ongoing')}
            >
              Ongoing
            </button>
            <button
              type="button"
              className={`fin-tab${reportDetailsTab === 'all' ? ' active' : ''}`}
              onClick={() => setReportDetailsTab('all')}
            >
              All Projects
            </button>
          </div>
          {reportDetailsTab === 'ongoing' ? (
            <section className="full fin-report-details-group ongoing">
              <div className="eyebrow">Ongoing Projects</div>
              <div className="home-stat-grid fin-report-overall-metrics">
                <div className="home-metric tone-agreed"><span className="home-metric-label">Ongoing Agreed Value</span><span className="home-metric-value">{money(ongoingQuoteAmount)}</span></div>
                <div className="home-metric tone-labor"><span className="home-metric-label">Ongoing Labor Used</span><span className="home-metric-value">{money(ongoingLaborEarnings)}</span></div>
                <div className="home-metric tone-expense"><span className="home-metric-label">Ongoing Expenses Used</span><span className="home-metric-value">{money(ongoingExpenses)}</span></div>
                <div className="home-metric tone-consumed"><span className="home-metric-label">Ongoing Consumed</span><span className="home-metric-value">{money(ongoingConsumed)}</span></div>
                <div className="home-metric tone-remaining"><span className="home-metric-label">Ongoing Remaining</span><span className="home-metric-value">{money(ongoingRemainingFromQuote)}</span></div>
              </div>
            </section>
          ) : null}
          {reportDetailsTab === 'all' ? (
            <section className="full fin-report-details-group all">
              <div className="eyebrow">All Projects</div>
              <div className="home-stat-grid fin-report-overall-metrics">
                <div className="home-metric tone-agreed"><span className="home-metric-label">Agreed Value</span><span className="home-metric-value">{money(totalQuoteAmount)}</span></div>
                <div className="home-metric tone-labor"><span className="home-metric-label">Labor Used</span><span className="home-metric-value">{money(totalLaborEarnings)}</span></div>
                <div className="home-metric tone-expense"><span className="home-metric-label">Expenses Used</span><span className="home-metric-value">{money(totalExpenses)}</span></div>
                <div className="home-metric tone-consumed"><span className="home-metric-label">Total Consumed</span><span className="home-metric-value">{money(totalConsumed)}</span></div>
                <div className="home-metric tone-remaining"><span className="home-metric-label">Remaining From Quote</span><span className="home-metric-value">{money(totalRemainingFromQuote)}</span></div>
              </div>
            </section>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setReportDetailsModalOpen(false)}>Close</button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={reportProjectModalOpen}
        onClose={() => setReportProjectModalOpen(false)}
        title={selectedProjectSummary?.projectDescription || 'Project Summary'}
        size="md"
      >
        <div className="modal-form-grid">
          <div className="full fin-project-summary-chart-card">
            <div className="fin-project-summary-donut-wrap">
              <div className="fin-project-summary-donut" style={projectChartStyle}>
                <div className="fin-project-summary-donut-center">
                  {reportBusy ? <FiLoader className="btn-spinner" /> : <strong>{projectSpentPct.toFixed(1)}%</strong>}
                  <small>{reportBusy ? 'Loading' : 'Spent'}</small>
                </div>
              </div>
            </div>
            <div className="fin-project-summary-chart-meta">
              <div className="fin-project-summary-row">
                <span className="dot labor" />
                <span>Labor</span>
                <strong>{money(projectLaborEarned)}</strong>
              </div>
              <div className="fin-project-summary-row">
                <span className="dot expense" />
                <span>Expenses</span>
                <strong>{money(projectExpenses)}</strong>
              </div>
              <div className="fin-project-summary-row">
                <span className="dot remaining" />
                <span>Remaining</span>
                <strong>{money(Math.max(0, projectQuoteAmount - projectSpentTotal))}</strong>
              </div>
            </div>
          </div>
          <div className="full fin-project-summary-top">
            <div className="fin-project-top-card">
              <span className="home-metric-label">Status</span>
              <span className={`home-metric-value fin-status-badge ${projectStatusToneClass}`}>{selectedProjectSummary?.projectStatus || '-'}</span>
            </div>
            <div className="fin-project-top-card">
              <span className="home-metric-label">Agreed Amount</span>
              <span className="home-metric-value">{money(selectedProjectSummary?.projectQuoteAmount)}</span>
            </div>
            <div className="fin-project-top-card total-cost">
              <span className="home-metric-label">Total Cost</span>
              <span className="home-metric-value">{money(selectedProjectSummary?.netCost)}</span>
            </div>
          </div>
          <div className="full home-stat-grid fin-project-metrics">
            <div className="home-metric"><span className="home-metric-label">Labor Hours Worked</span><span className="home-metric-value">{hoursFromMinutes(selectedProjectSummary?.laborMinutes)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Labor Earned</span><span className="home-metric-value">{money(selectedProjectSummary?.laborEarnings)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Expenses</span><span className="home-metric-value">{money(selectedProjectSummary?.expenseTotal)}</span></div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentEditId('');
          setPaymentForm({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
        }}
        title={paymentEditId ? 'Edit Payment' : 'Add Payment'}
        size="sm"
      >
        <div className="modal-form-grid">
          <select className="full" value={paymentForm.userId} onChange={(e) => setPaymentForm({ ...paymentForm, userId: e.target.value })}>
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} {user.surname} ({user.email})
              </option>
            ))}
          </select>
          <input placeholder="amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
          <input type="datetime-local" placeholder="Paid at (date & time)" value={paymentForm.paidAt || ''} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} />
          <input placeholder="method" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })} />
          <input className="full" placeholder="notes" value={paymentForm.notes} onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })} />
          {paymentEditId && canDelete ? (
            <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Delete is soft delete.</span>
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={async () => {
                  await onDeletePayment(paymentEditId);
                  setPaymentModalOpen(false);
                  setPaymentEditId('');
                  setPaymentForm({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
                }}
                disabled={paymentDeleteBusyId === String(paymentEditId)}
              >
                {paymentDeleteBusyId === String(paymentEditId) ? <FiLoader className="btn-spinner" /> : null}
                <span>{paymentDeleteBusyId === String(paymentEditId) ? 'Deleting...' : 'Delete Payment'}</span>
              </button>
            </div>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setPaymentModalOpen(false)}>Cancel</button>
            <button type="button" onClick={savePayment} disabled={paymentSaving} className="btn-with-spinner">
              {paymentSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{paymentSaving ? (paymentEditId ? 'Updating...' : 'Saving...') : (paymentEditId ? 'Update' : 'Save')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={expenseModalOpen}
        onClose={() => {
          setExpenseModalOpen(false);
          setExpenseEditId('');
          setExpenseForm({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
        }}
        title={expenseEditId ? 'Edit Expense' : 'Add Expense'}
        size="sm"
      >
        <div className="modal-form-grid">
          <select value={expenseForm.scope} onChange={(e) => setExpenseForm({ ...expenseForm, scope: e.target.value, projectId: e.target.value === 'company' ? '' : expenseForm.projectId })}>
            <option value="project">project</option>
            <option value="company">company</option>
          </select>
          {expenseForm.scope === 'project' ? (
            <select className="full" value={expenseForm.projectId} onChange={(e) => setExpenseForm({ ...expenseForm, projectId: e.target.value })}>
              <option value="">Select project</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.description || project.id}
                </option>
              ))}
            </select>
          ) : (
            <input className="full" value="Company scope (no project)" disabled />
          )}
          <select value={expenseForm.type} onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value })}>
            <option value="material">material</option>
            <option value="damage">damage</option>
            <option value="unknown">unknown</option>
            <option value="other">other</option>
          </select>
          <input placeholder="amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} />
          <input type="datetime-local" placeholder="Spent at (date & time)" value={expenseForm.spentAt || ''} onChange={(e) => setExpenseForm({ ...expenseForm, spentAt: e.target.value })} />
          <input className="full" placeholder="notes" value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} />
          {expenseEditId && canDelete ? (
            <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Delete is soft delete.</span>
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={async () => {
                  await onDeleteExpense(expenseEditId);
                  setExpenseModalOpen(false);
                  setExpenseEditId('');
                  setExpenseForm({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
                }}
                disabled={expenseDeleteBusyId === String(expenseEditId)}
              >
                {expenseDeleteBusyId === String(expenseEditId) ? <FiLoader className="btn-spinner" /> : null}
                <span>{expenseDeleteBusyId === String(expenseEditId) ? 'Deleting...' : 'Delete Expense'}</span>
              </button>
            </div>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveExpense} disabled={expenseSaving} className="btn-with-spinner">
              {expenseSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{expenseSaving ? (expenseEditId ? 'Updating...' : 'Saving...') : (expenseEditId ? 'Update' : 'Save')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={bonusModalOpen}
        onClose={() => {
          setBonusModalOpen(false);
          setBonusEditId('');
          setBonusForm({ userId: '', amount: '', description: '', effectiveAt: '' });
        }}
        title={bonusEditId ? 'Edit Bonus / Penalty' : 'Add Bonus / Penalty'}
        size="sm"
      >
        <div className="modal-form-grid">
          <select className="full" value={bonusForm.userId} onChange={(e) => setBonusForm({ ...bonusForm, userId: e.target.value })}>
            <option value="">Select user</option>
            {users.map((user) => (
              <option key={user.id} value={user.id}>
                {user.name} {user.surname} ({user.email})
              </option>
            ))}
          </select>
          <input placeholder="amount (+/-)" value={bonusForm.amount} onChange={(e) => setBonusForm({ ...bonusForm, amount: e.target.value })} />
          <input placeholder="description" value={bonusForm.description} onChange={(e) => setBonusForm({ ...bonusForm, description: e.target.value })} />
          <input type="datetime-local" placeholder="Effective at (date & time)" value={bonusForm.effectiveAt || ''} onChange={(e) => setBonusForm({ ...bonusForm, effectiveAt: e.target.value })} />
          {bonusEditId && canDelete ? (
            <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Delete is soft delete.</span>
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={async () => {
                  await onDeleteBonus(bonusEditId);
                  setBonusModalOpen(false);
                  setBonusEditId('');
                  setBonusForm({ userId: '', amount: '', description: '', effectiveAt: '' });
                }}
                disabled={bonusDeleteBusyId === String(bonusEditId)}
              >
                {bonusDeleteBusyId === String(bonusEditId) ? <FiLoader className="btn-spinner" /> : null}
                <span>{bonusDeleteBusyId === String(bonusEditId) ? 'Deleting...' : 'Delete Bonus/Penalty'}</span>
              </button>
            </div>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setBonusModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveBonus} disabled={bonusSaving} className="btn-with-spinner">
              {bonusSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{bonusSaving ? (bonusEditId ? 'Updating...' : 'Saving...') : (bonusEditId ? 'Update' : 'Save')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

    </div>
  );
}
