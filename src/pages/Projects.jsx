
import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCheckCircle, FiChevronDown, FiClock, FiEdit2, FiLoader, FiMessageCircle, FiNavigation, FiPhone, FiPlusCircle, FiSlash, FiTrendingUp, FiUserPlus } from 'react-icons/fi';
import { createCustomer, listCustomers, searchCustomersForProjectPicker, updateCustomer } from '../api/customersApi.js';
import { createProject, listProjects, projectStatusCounts, updateProject } from '../api/projectsApi.js';
import { projectSummary } from '../api/reportsApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

const EMPTY_PROJECT_FORM = {
  description: '',
  addressRaw: '',
  estimatedStartAt: '',
  quoteAmount: '',
  referralEnabled: false,
  referralPercent: '',
  customerId: '',
  materials: '',
  advancedOpen: false,
  locationKey: '',
  geoLat: '',
  geoLng: '',
  geoRadiusMeters: '1000'
};

const EMPTY_CUSTOMER_FORM = {
  fullName: '',
  address: '',
  email: '',
  phone: ''
};

const PROJECT_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'created', label: 'Waiting' },
  { value: 'progress', label: 'Progress' },
  { value: 'review', label: 'Review' },
  { value: 'done', label: 'Done' },
  { value: 'deactive', label: 'Deactive' }
];

const PROJECT_STATUS_UPDATE_OPTIONS = [
  { value: 'waiting', label: 'Waiting' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'review', label: 'Review' },
  { value: 'finished', label: 'Finished' },
  { value: 'canceled', label: 'Canceled' }
];

const STATUS_ORDER = ['waiting', 'ongoing', 'review', 'finished', 'canceled'];

function normalizeStatusKey(status) {
  return String(status || '').trim().toLowerCase();
}

function toStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'ongoing') return 'Ongoing';
  if (key === 'review') return 'Review';
  if (key === 'finished') return 'Finished';
  if (key === 'canceled') return 'Canceled';
  if (key === 'waiting') return 'Waiting';
  if (!key) return 'Unknown';
  return key
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function toStatusTone(status) {
  const key = normalizeStatusKey(status);
  if (key === 'waiting') return 'Waiting';
  if (key === 'ongoing') return 'Started';
  if (key === 'review') return 'Review';
  if (key === 'finished') return 'Completed';
  if (key === 'canceled') return 'Rejected';
  return 'Unknown';
}

function statusMetricClass(status) {
  const key = normalizeStatusKey(status);
  if (key === 'waiting') return 'projects-waiting-metric';
  if (key === 'ongoing') return 'projects-ongoing-metric';
  if (key === 'review') return 'projects-review-metric';
  if (key === 'finished') return 'projects-finished-metric';
  if (key === 'canceled') return 'projects-canceled-metric';
  return '';
}

function isProjectDeactive(project) {
  const statusKey = normalizeStatusKey(project?.status);
  if (project?.isActive === false) return true;
  if (project?.deletedAt) return true;
  if (statusKey === 'canceled') return true;
  return false;
}

function projectFilterBucket(project) {
  if (isProjectDeactive(project)) return 'deactive';
  const statusKey = normalizeStatusKey(project?.status);
  if (statusKey === 'waiting') return 'created';
  if (statusKey === 'ongoing') return 'progress';
  if (statusKey === 'review') return 'review';
  if (statusKey === 'finished') return 'done';
  return 'created';
}

function matchesProjectFilter(project, filterStatus) {
  const key = String(filterStatus || '').trim().toLowerCase();
  if (!key) return !isProjectDeactive(project);
  return projectFilterBucket(project) === key;
}

function buildDirectionsHref(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(raw)}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function moneyOrDash(value) {
  if (value === null || value === undefined || value === '') return '--';
  const amount = Number(value);
  if (Number.isNaN(amount)) return '--';
  return money(amount);
}

function hoursFromMinutes(minutes) {
  return (Number(minutes || 0) / 60).toFixed(2);
}

function formatDateOrDash(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString();
}

function formatDurationDaysOrDash(value) {
  if (value === null || value === undefined || value === '') return '--';
  const days = Number(value);
  if (Number.isNaN(days) || days < 0) return '--';
  return `${days.toFixed(2)} days`;
}

function round2(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function normalizeNumberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isNaN(number) ? null : number;
}

function projectFinanceBreakdown(project) {
  const quote = normalizeNumberOrNull(project?.quoteAmount);
  if (quote === null) {
    return {
      quote: null,
      referralAmount: null,
      netQuoteAfterReferral: null,
      usedFallback: false
    };
  }

  const referralAmountFromApi = normalizeNumberOrNull(project?.referralAmount);
  const netAfterReferralFromApi = normalizeNumberOrNull(project?.netQuoteAfterReferral);
  if (referralAmountFromApi !== null && netAfterReferralFromApi !== null) {
    return {
      quote,
      referralAmount: referralAmountFromApi,
      netQuoteAfterReferral: netAfterReferralFromApi,
      usedFallback: false
    };
  }

  const referralPercent = normalizeNumberOrNull(project?.referralPercent) ?? 0;
  const referralAmount = round2(quote * (referralPercent / 100));
  const netQuoteAfterReferral = round2(quote - referralAmount);
  return {
    quote,
    referralAmount,
    netQuoteAfterReferral,
    usedFallback: true
  };
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
    laborMinutes: pickNumber(root, ['laborMinutes', 'totalLaborMinutes'], 0)
      || pickNumber(summary, ['laborMinutes', 'totalLaborMinutes'], 0),
    laborEarnings: pickNumber(root, ['laborEarnings', 'totalLaborEarnings'], 0)
      || pickNumber(summary, ['laborEarnings', 'totalLaborEarnings'], 0),
    projectExpenseTotal: pickNumber(root, ['projectExpenseTotal', 'expenseTotal', 'totalExpenses'], 0)
      || pickNumber(summary, ['projectExpenseTotal', 'expenseTotal', 'totalExpenses'], 0),
    companyProjectRelatedExpenseTotal: pickNumber(root, ['companyProjectRelatedExpenseTotal'], 0)
      || pickNumber(summary, ['companyProjectRelatedExpenseTotal'], 0),
    materialPaidAmount: pickNumber(root, ['materialPaidAmount'], 0)
      || pickNumber(summary, ['materialPaidAmount'], 0),
    projectMaterialExpenseNetAfterCustomerPayments: pickNumber(
      root,
      ['projectMaterialExpenseNetAfterCustomerPayments'],
      pickNumber(summary, ['projectMaterialExpenseNetAfterCustomerPayments'], 0)
    ),
    workersCount: pickNumber(root, ['workersCount'], pickNumber(summary, ['workersCount'], 0))
  };
}

function donutSegmentMarkers(segments, minPct = 5) {
  const source = Array.isArray(segments) ? segments : [];
  let cursorPct = 0;
  const out = [];
  for (const segment of source) {
    const pct = Math.max(0, Number(segment?.pct || 0));
    const label = String(segment?.label || '').trim();
    if (pct > 0) {
      const midPct = cursorPct + (pct / 2);
      const angleRad = ((midPct / 100) * Math.PI * 2) - (Math.PI / 2);
      if (pct >= minPct && label) {
        out.push({
          key: label,
          pct,
          label,
          x: Math.cos(angleRad),
          y: Math.sin(angleRad)
        });
      }
    }
    cursorPct += pct;
  }
  return out;
}

function projectStatusTone(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'ongoing') return 'ongoing';
  if (key === 'review') return 'review';
  if (key === 'finished') return 'finished';
  if (key === 'canceled') return 'canceled';
  if (key === 'waiting') return 'waiting';
  return 'unknown';
}

export default function Projects() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();

  const [pageTab, setPageTab] = useState('projects');

  const [projects, setProjects] = useState([]);
  const [projectsCursor, setProjectsCursor] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [counts, setCounts] = useState({
    waiting: 0,
    ongoing: 0,
    review: 0,
    finished: 0,
    canceled: 0
  });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [customers, setCustomers] = useState([]);
  const [customersCursor, setCustomersCursor] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);
  const [projectFormError, setProjectFormError] = useState('');
  const [projectCustomerSearch, setProjectCustomerSearch] = useState('');
  const [projectCustomerPickerOpen, setProjectCustomerPickerOpen] = useState(false);
  const [projectCustomerOptions, setProjectCustomerOptions] = useState([]);
  const [projectCustomerCursor, setProjectCustomerCursor] = useState(null);
  const [projectCustomerHasMore, setProjectCustomerHasMore] = useState(false);
  const [projectCustomerLoading, setProjectCustomerLoading] = useState(false);
  const [projectCustomerLoadMoreBusy, setProjectCustomerLoadMoreBusy] = useState(false);
  const [editProjectId, setEditProjectId] = useState('');
  const [editProjectIsActive, setEditProjectIsActive] = useState(true);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const [projectDeleteBusy, setProjectDeleteBusy] = useState(false);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [editCustomerId, setEditCustomerId] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusTargetProject, setStatusTargetProject] = useState(null);
  const [statusValue, setStatusValue] = useState('waiting');
  const [projectSummaryModalOpen, setProjectSummaryModalOpen] = useState(false);
  const [projectSummaryLoading, setProjectSummaryLoading] = useState(false);
  const [projectSummaryBusyId, setProjectSummaryBusyId] = useState('');
  const [selectedProjectSummary, setSelectedProjectSummary] = useState(null);

  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [addressSearchToken, setAddressSearchToken] = useState(0);
  const [customerAddressSuggestions, setCustomerAddressSuggestions] = useState([]);
  const [customerAddressLoading, setCustomerAddressLoading] = useState(false);
  const [customerAddressSearchToken, setCustomerAddressSearchToken] = useState(0);

  const [hasLoaded, setHasLoaded] = useState(false);

  const sentinelRef = useRef(null);
  const lastRefreshRef = useRef(0);
  const skipNextProjectsFilterReloadRef = useRef(false);
  const skipNextCustomersFilterReloadRef = useRef(false);
  const projectsRequestLockRef = useRef(false);
  const countsRequestLockRef = useRef(false);
  const customersRequestLockRef = useRef(false);
  const skipNextProjectCustomerSearchRef = useRef(false);

  const isActive = activeTab === 'projects';
  const roleLower = String(role || '').toLowerCase();
  const canManage = roleLower === 'admin' || roleLower === 'superadmin';
  const canDelete = roleLower === 'superadmin';

  useEffect(() => {
    if (!projectModalOpen) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const q = String(projectForm.addressRaw || '').trim();
    if (q.length < 3) {
      setAddressSuggestions([]);
      setAddressLoading(false);
      return;
    }

    const token = addressSearchToken + 1;
    setAddressSearchToken(token);
    setAddressLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('Address suggestions unavailable.');
        const data = await response.json();
        if (!Array.isArray(data)) {
          setAddressSuggestions([]);
          return;
        }
        setAddressSuggestions(data.map((item) => ({
          label: item.display_name || '',
          value: item.display_name || ''
        })).filter((item) => item.value));
      } catch {
        setAddressSuggestions([]);
      } finally {
        setAddressLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [projectForm.addressRaw, projectModalOpen]);

  useEffect(() => {
    if (!customerModalOpen) {
      setCustomerAddressSuggestions([]);
      setCustomerAddressLoading(false);
      return;
    }

    const q = String(customerForm.address || '').trim();
    if (q.length < 3) {
      setCustomerAddressSuggestions([]);
      setCustomerAddressLoading(false);
      return;
    }

    const token = customerAddressSearchToken + 1;
    setCustomerAddressSearchToken(token);
    setCustomerAddressLoading(true);

    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`, {
          headers: { Accept: 'application/json' }
        });
        if (!response.ok) throw new Error('Address suggestions unavailable.');
        const data = await response.json();
        if (!Array.isArray(data)) {
          setCustomerAddressSuggestions([]);
          return;
        }
        setCustomerAddressSuggestions(
          data
            .map((item) => ({ label: item.display_name || '', value: item.display_name || '' }))
            .filter((item) => item.value)
        );
      } catch {
        setCustomerAddressSuggestions([]);
      } finally {
        setCustomerAddressLoading(false);
      }
    }, 260);

    return () => clearTimeout(timer);
  }, [customerForm.address, customerModalOpen]);

  const loadProjects = async ({ reset = false } = {}) => {
    if (!canManage || projectsLoading || projectsRequestLockRef.current) return;
    if (!reset && !projectsCursor) return;
    projectsRequestLockRef.current = true;
    setProjectsLoading(true);
    try {
      const data = await listProjects({
        limit: 10,
        cursor: reset ? undefined : projectsCursor,
        customerId: filterCustomerId || undefined,
        q: String(query || '').trim() || undefined
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setProjects((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setProjectsCursor(data?.nextCursor || null);
    } catch (err) {
      showToast(err?.message || 'Failed to load projects.');
    } finally {
      projectsRequestLockRef.current = false;
      setProjectsLoading(false);
    }
  };

  const loadCounts = async () => {
    if (!canManage || countsRequestLockRef.current) return;
    countsRequestLockRef.current = true;
    try {
      const data = await projectStatusCounts();
      const nextCounts = STATUS_ORDER.reduce((acc, key) => {
        acc[key] = Number(data?.[key] || 0);
        return acc;
      }, {});
      const keys = Object.keys(data || {});
      for (const key of keys) {
        if (Object.prototype.hasOwnProperty.call(nextCounts, key)) continue;
        const value = Number(data?.[key]);
        if (!Number.isNaN(value)) nextCounts[key] = value;
      }
      setCounts(nextCounts);
    } catch (err) {
      showToast(err?.message || 'Failed to load project counts.');
    } finally {
      countsRequestLockRef.current = false;
    }
  };

  const loadCustomers = async ({ reset = false } = {}) => {
    if (!canManage || customersLoading || customersRequestLockRef.current) return;
    if (!reset && !customersCursor) return;
    customersRequestLockRef.current = true;
    setCustomersLoading(true);
    try {
      const data = await listCustomers({
        limit: 50,
        q: String(customerQuery || '').trim() || undefined,
        cursor: reset ? undefined : customersCursor
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setCustomers((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setCustomersCursor(data?.nextCursor || null);
    } catch (err) {
      showToast(err?.message || 'Failed to load customers.');
    } finally {
      customersRequestLockRef.current = false;
      setCustomersLoading(false);
    }
  };

  const loadProjectCustomerOptions = async ({ reset = false, queryOverride } = {}) => {
    if (!projectModalOpen) return [];
    if (reset) {
      setProjectCustomerLoading(true);
    } else {
      if (!projectCustomerHasMore || !projectCustomerCursor || projectCustomerLoadMoreBusy) return [];
      setProjectCustomerLoadMoreBusy(true);
    }
    try {
      const q = String((queryOverride ?? projectCustomerSearch) || '').trim();
      const data = await searchCustomersForProjectPicker({
        limit: 6,
        cursor: reset ? undefined : projectCustomerCursor,
        q: q || undefined
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      const nextCursor = data?.nextCursor || null;
      setProjectCustomerCursor(nextCursor);
      setProjectCustomerHasMore(Boolean(nextCursor));
      setProjectCustomerOptions((prev) => {
        const merged = reset ? nextItems : [...prev, ...nextItems];
        const deduped = [];
        const seen = new Set();
        for (const item of merged) {
          const key = String(item?.id || '');
          if (!key || seen.has(key)) continue;
          seen.add(key);
          deduped.push(item);
        }
        return deduped;
      });
      return nextItems;
    } catch (err) {
      showToast(err?.message || 'Failed to load customers for project picker.');
      return [];
    } finally {
      if (reset) setProjectCustomerLoading(false);
      else setProjectCustomerLoadMoreBusy(false);
    }
  };

  useEffect(() => {
    if (!isActive || !canManage || hasLoaded) return;
    const stop = showGlobalLoader ? showGlobalLoader('Loading projects...', { center: true }) : () => {};
    Promise.all([loadCounts(), loadProjects({ reset: true }), loadCustomers({ reset: true })])
      .finally(() => {
        skipNextProjectsFilterReloadRef.current = true;
        skipNextCustomersFilterReloadRef.current = true;
        setHasLoaded(true);
        stop();
      })
      .catch(() => {});
  }, [isActive, canManage, hasLoaded]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded || pageTab !== 'projects') return;
    if (skipNextProjectsFilterReloadRef.current) {
      skipNextProjectsFilterReloadRef.current = false;
      return;
    }
    Promise.all([loadCounts(), loadProjects({ reset: true })]).catch(() => {});
  }, [canManage, hasLoaded, pageTab, filterStatus, filterCustomerId, query]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded || pageTab !== 'customers') return;
    if (skipNextCustomersFilterReloadRef.current) {
      skipNextCustomersFilterReloadRef.current = false;
      return;
    }
    loadCustomers({ reset: true }).catch(() => {});
  }, [canManage, hasLoaded, pageTab, customerQuery]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    if (pageTab === 'projects') {
      Promise.all([loadCounts(), loadProjects({ reset: true })]).catch(() => {});
    } else {
      loadCustomers({ reset: true }).catch(() => {});
    }
  }, [isActive, canManage, hasLoaded, refreshTick, pageTab]);

  useEffect(() => {
    if (!projectModalOpen || !projectCustomerPickerOpen) return;
    if (skipNextProjectCustomerSearchRef.current) {
      skipNextProjectCustomerSearchRef.current = false;
      return;
    }
    const q = String(projectCustomerSearch || '').trim();
    if (!q) {
      loadProjectCustomerOptions({ reset: true }).catch(() => {});
      return undefined;
    }
    const handle = setTimeout(() => {
      loadProjectCustomerOptions({ reset: true }).catch(() => {});
    }, 250);
    return () => clearTimeout(handle);
  }, [projectModalOpen, projectCustomerPickerOpen, projectCustomerSearch]);

  useEffect(() => {
    if (!isActive || !canManage || pageTab !== 'projects') return;
    const node = sentinelRef.current;
    if (!node) return;

    const observer = new IntersectionObserver((entries) => {
      if (!entries[0]?.isIntersecting) return;
      if (!projectsCursor || projectsLoading) return;
      loadProjects();
    }, { rootMargin: '200px' });

    observer.observe(node);
    return () => observer.disconnect();
  }, [projectsCursor, isActive, canManage, pageTab, projectsLoading]);

  const openNewProjectModal = () => {
    setEditProjectId('');
    setEditProjectIsActive(true);
    setProjectForm(EMPTY_PROJECT_FORM);
    setProjectFormError('');
    setProjectCustomerSearch('');
    setProjectCustomerPickerOpen(false);
    setProjectCustomerOptions([]);
    setProjectCustomerCursor(null);
    setProjectCustomerHasMore(false);
    setProjectModalOpen(true);
  };

  const startEditProject = (project) => {
    const rawReferralPercent = project?.referralPercent;
    const hasReferralPercent = rawReferralPercent !== null && rawReferralPercent !== undefined && rawReferralPercent !== '';
    const referralPercent = hasReferralPercent ? Number(rawReferralPercent) : NaN;
    setEditProjectId(project.id);
    setEditProjectIsActive(project?.isActive !== false);
    setProjectForm({
      description: project.description || '',
      addressRaw: project.address?.raw || '',
      estimatedStartAt: project.estimatedStartAt ? String(project.estimatedStartAt).slice(0, 10) : '',
      quoteAmount: project.quoteAmount ?? '',
      referralEnabled: hasReferralPercent && !Number.isNaN(referralPercent) && referralPercent > 0,
      referralPercent: hasReferralPercent && !Number.isNaN(referralPercent) ? String(referralPercent) : '',
      customerId: project.customer?.id || project.customerId || '',
      materials: project.materials || '',
      locationKey: project.locationKey || '',
      geoLat: project.geo?.lat ?? '',
      geoLng: project.geo?.lng ?? '',
      geoRadiusMeters: project.geoRadiusMeters ?? 1000,
      advancedOpen: false
    });
    setProjectFormError('');
    setProjectCustomerSearch('');
    setProjectCustomerPickerOpen(false);
    setProjectCustomerOptions([]);
    setProjectCustomerCursor(null);
    setProjectCustomerHasMore(false);
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (projectSaving) return;
    const description = String(projectForm.description || '').trim();
    const addressRaw = String(projectForm.addressRaw || '').trim();
    const quoteAmount = projectForm.quoteAmount === '' ? undefined : Number(projectForm.quoteAmount);
    const referralPercent = projectForm.referralEnabled ? Number(projectForm.referralPercent) : null;
    const materials = String(projectForm.materials || '').trim();

    setProjectFormError('');

    if (!description) {
      setProjectFormError('Description is required.');
      return;
    }
    if (!addressRaw) {
      setProjectFormError('Address is required.');
      return;
    }
    if (typeof quoteAmount !== 'undefined' && (Number.isNaN(quoteAmount) || quoteAmount < 0)) {
      setProjectFormError('Quote amount must be greater than or equal to 0.');
      return;
    }
    if (projectForm.referralEnabled && (projectForm.referralPercent === '' || Number.isNaN(referralPercent) || referralPercent < 0 || referralPercent > 100)) {
      setProjectFormError('Referral percent must be a number between 0 and 100.');
      return;
    }

    const body = {
      description,
      address: { raw: addressRaw },
      estimatedStartAt: projectForm.estimatedStartAt ? new Date(projectForm.estimatedStartAt).toISOString() : undefined,
      quoteAmount,
      referralPercent: projectForm.referralEnabled ? referralPercent : null,
      customerId: projectForm.customerId || (editProjectId ? null : undefined),
      materials: materials || (editProjectId ? null : undefined)
    };

    if (projectForm.advancedOpen) {
      if (String(projectForm.locationKey || '').trim()) body.locationKey = String(projectForm.locationKey).trim();
      if (projectForm.geoLat !== '' || projectForm.geoLng !== '') {
        body.geo = {
          lat: projectForm.geoLat === '' ? undefined : Number(projectForm.geoLat),
          lng: projectForm.geoLng === '' ? undefined : Number(projectForm.geoLng)
        };
      }
      if (projectForm.geoRadiusMeters !== '') body.geoRadiusMeters = Number(projectForm.geoRadiusMeters);
    }

    setProjectSaving(true);
    try {
      if (editProjectId) await updateProject(editProjectId, body);
      else await createProject(body);
      showToast(editProjectId ? 'Project updated.' : 'Project created.');
      setProjectModalOpen(false);
      setProjectForm(EMPTY_PROJECT_FORM);
      setEditProjectId('');
      await Promise.all([loadProjects({ reset: true }), loadCounts()]);
    } catch (err) {
      const message = err?.message || 'Could not save project.';
      setProjectFormError(message);
      showToast(message);
    } finally {
      setProjectSaving(false);
    }
  };

  const onToggleProjectActive = async (id, { fromModal = false } = {}) => {
    if (!canDelete) return;
    if (projectDeleteBusy) return;
    const nextIsActive = !editProjectIsActive;
    if (!confirm(nextIsActive ? 'Activate this project?' : 'Deactivate this project?')) return;
    setProjectDeleteBusy(true);
    try {
      await updateProject(id, { isActive: nextIsActive });
      if (fromModal) {
        setProjectModalOpen(false);
        setProjectForm(EMPTY_PROJECT_FORM);
        setEditProjectId('');
        setEditProjectIsActive(true);
      }
      await Promise.all([loadProjects({ reset: true }), loadCounts()]);
      showToast(nextIsActive ? 'Project activated.' : 'Project deactivated.');
    } catch (err) {
      showToast(err?.message || 'Project status update failed.');
    } finally {
      setProjectDeleteBusy(false);
    }
  };

  const openStatusModal = (project) => {
    if (!project?.id) return;
    setStatusTargetProject(project);
    setStatusValue(String(project.status || 'waiting').toLowerCase());
    setStatusModalOpen(true);
  };

  const saveStatus = async () => {
    if (statusSaving || !statusTargetProject?.id || !statusValue) return;
    setStatusSaving(true);
    try {
      await updateProject(statusTargetProject.id, { status: statusValue });
      showToast('Project status updated.');
      setStatusModalOpen(false);
      setStatusTargetProject(null);
      await Promise.all([loadProjects({ reset: true }), loadCounts()]);
    } catch (err) {
      showToast(err?.message || 'Status update failed.');
    } finally {
      setStatusSaving(false);
    }
  };

  const openNewCustomerModal = () => {
    setEditCustomerId('');
    setCustomerForm(EMPTY_CUSTOMER_FORM);
    setCustomerModalOpen(true);
  };

  const openEditCustomerModal = (customer) => {
    setEditCustomerId(String(customer?.id || ''));
    setCustomerForm({
      fullName: customer?.fullName || '',
      address: customer?.address || '',
      email: customer?.email || '',
      phone: customer?.phone || ''
    });
    setCustomerModalOpen(true);
  };

  const saveCustomer = async () => {
    if (customerSaving) return;
    const fullName = String(customerForm.fullName || '').trim();
    const address = String(customerForm.address || '').trim();
    const email = String(customerForm.email || '').trim();
    const phone = String(customerForm.phone || '').trim();

    if (!fullName) {
      showToast('Customer full name is required.');
      return;
    }
    if (email && !isValidEmail(email)) {
      showToast('Customer email format is invalid.');
      return;
    }

    setCustomerSaving(true);
    try {
      const body = {
        fullName,
        address: address || undefined,
        email: email || undefined,
        phone: phone || undefined
      };
      if (editCustomerId) {
        await updateCustomer(editCustomerId, body);
        showToast('Customer updated.');
        await loadCustomers({ reset: true });
      } else {
        const created = await createCustomer(body);
        showToast('Customer created.');
        await loadCustomers({ reset: true });
        const createdId = String(created?.id || created?._id || '');
        if (projectModalOpen && createdId) {
          setProjectForm((prev) => ({
            ...prev,
            customerId: createdId,
            addressRaw: address || prev.addressRaw
          }));
        }
      }
      setCustomerModalOpen(false);
      setEditCustomerId('');
      setCustomerForm(EMPTY_CUSTOMER_FORM);
    } catch (err) {
      showToast(err?.message || 'Failed to save customer.');
    } finally {
      setCustomerSaving(false);
    }
  };

  const loadProjectSummary = async (projectId) => {
    const id = String(projectId || '').trim();
    if (!id) return;
    setProjectSummaryLoading(true);
    setProjectSummaryBusyId(id);
    try {
      const data = await projectSummary({ projectId: id });
      setSelectedProjectSummary(normalizeProjectSummary(data));
      setProjectSummaryModalOpen(true);
    } catch (err) {
      showToast(err?.message || 'Failed to load project summary.');
    } finally {
      setProjectSummaryLoading(false);
      setProjectSummaryBusyId('');
    }
  };

  const selectedProjectCustomer = [...projectCustomerOptions, ...customers]
    .find((customer) => String(customer?.id || '') === String(projectForm.customerId || ''));
  const selectedProjectCustomerLabel = selectedProjectCustomer
    ? (selectedProjectCustomer.fullName || selectedProjectCustomer.id || '')
    : '';
  const editingProject = editProjectId
    ? projects.find((project) => String(project?.id || '') === String(editProjectId))
    : null;
  const visibleProjects = useMemo(() => projects.filter((project) => matchesProjectFilter(project, filterStatus)), [projects, filterStatus]);
  const projectQuoteAmount = Number(selectedProjectSummary?.projectQuoteAmount || 0);
  const projectLaborEarned = Number(selectedProjectSummary?.laborEarnings || 0);
  const projectExpenses = Number(selectedProjectSummary?.projectExpenseTotal || 0);
  const projectMaterialPaidByCustomer = Number(selectedProjectSummary?.materialPaidAmount || 0);
  const projectMaterialExpenseNet = Number(selectedProjectSummary?.projectMaterialExpenseNetAfterCustomerPayments || 0);
  const projectCompanyProjectRelatedExpenses = Number(selectedProjectSummary?.companyProjectRelatedExpenseTotal || 0);
  const projectConsumedTotal = projectLaborEarned + projectCompanyProjectRelatedExpenses;
  const projectLaborPct = projectQuoteAmount > 0 ? Math.max(0, Math.min(100, (projectLaborEarned / projectQuoteAmount) * 100)) : 0;
  const projectCompanyProjectRelatedPct = projectQuoteAmount > 0 ? Math.max(0, Math.min(100 - projectLaborPct, (projectCompanyProjectRelatedExpenses / projectQuoteAmount) * 100)) : 0;
  const projectRemainingPct = projectQuoteAmount > 0
    ? Math.max(0, 100 - projectLaborPct - projectCompanyProjectRelatedPct)
    : 100;
  const projectChartSpentPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectConsumedTotal / projectQuoteAmount) * 100))
    : 0;
  const projectChartStyle = {
    background: `conic-gradient(var(--fin-chart-labor) 0 ${projectLaborPct}%, var(--fin-chart-company) ${projectLaborPct}% ${projectLaborPct + projectCompanyProjectRelatedPct}%, var(--fin-chart-remaining) ${projectLaborPct + projectCompanyProjectRelatedPct}% 100%)`
  };
  const projectStatusToneClass = projectStatusTone(selectedProjectSummary?.projectStatus);
  const projectQuoteInput = Number(projectForm.quoteAmount || 0);
  const projectReferralInput = Number(projectForm.referralPercent || 0);
  const projectReferralPreviewAmount = projectForm.referralEnabled
    && !Number.isNaN(projectQuoteInput)
    && !Number.isNaN(projectReferralInput)
    ? (projectQuoteInput * projectReferralInput) / 100
    : 0;
  const groupedCounts = useMemo(() => {
    const base = { all: 0, created: 0, progress: 0, review: 0, done: 0, deactive: 0 };
    for (const project of projects) {
      const bucket = projectFilterBucket(project);
      if (bucket === 'deactive') {
        base.deactive += 1;
        continue;
      }
      base.all += 1;
      if (bucket === 'created') base.created += 1;
      else if (bucket === 'progress') base.progress += 1;
      else if (bucket === 'review') base.review += 1;
      else if (bucket === 'done') base.done += 1;
    }
    return base;
  }, [projects]);

  if (!isActive) return <div id="projectsPage" className="tab-page hidden" />;
  if (!canManage) return <div id="projectsPage" className="tab-page active section card">Projects management is admin only.</div>;

  return (
    <div id="projectsPage" className="tab-page active">
      <div className="section card">
        <div className="fin-tabs finance-main-tabs" style={{ marginBottom: 12 }}>
          <button type="button" className={`fin-tab${pageTab === 'projects' ? ' active' : ''}`} data-mode="projects" onClick={() => setPageTab('projects')}>Projects</button>
          <button type="button" className={`fin-tab${pageTab === 'customers' ? ' active' : ''}`} data-mode="employees" onClick={() => setPageTab('customers')}>Customers</button>
        </div>

        {pageTab === 'projects' ? (
          <>
            <div className="prj-filters">
              <div className="prj-summary-header">
                <h3>Projects</h3>
                <div className="row" style={{ gap: 10, alignItems: 'center' }}>
                  <button
                    type="button"
                    className={`prj-summary-total projects-total-metric projects-filter-card${filterStatus === '' ? ' is-active' : ''}`}
                    onClick={() => setFilterStatus('')}
                    aria-pressed={filterStatus === ''}
                  >
                    <div className="prj-total-label">All Active Projects</div>
                    <div className="prj-total-value">{groupedCounts.all}</div>
                  </button>
                  <button type="button" className="ghost btn-tone-primary" onClick={openNewProjectModal}><FiPlusCircle />New Project</button>
                </div>
              </div>
              <div className="projects-status-board" style={{ marginBottom: 10 }}>
                <div className="projects-status-row projects-status-row-main">
                  <button
                    type="button"
                    className={`metric projects-filter-card ${statusMetricClass('waiting')}${filterStatus === 'created' ? ' is-active' : ''}`.trim()}
                    onClick={() => setFilterStatus('created')}
                    aria-pressed={filterStatus === 'created'}
                  >
                    <span className="metric-label"><FiClock className="projects-status-icon" />Waiting</span>
                    <span className="metric-value">{groupedCounts.created}</span>
                  </button>
                  <button
                    type="button"
                    className={`metric projects-filter-card ${statusMetricClass('ongoing')}${filterStatus === 'progress' ? ' is-active' : ''}`.trim()}
                    onClick={() => setFilterStatus('progress')}
                    aria-pressed={filterStatus === 'progress'}
                  >
                    <span className="metric-label"><FiLoader className="projects-status-icon" />Progress</span>
                    <span className="metric-value">{groupedCounts.progress}</span>
                  </button>
                </div>
                <div className="projects-status-row projects-status-row-secondary">
                  <button
                    type="button"
                    className={`metric projects-filter-card ${statusMetricClass('review')}${filterStatus === 'review' ? ' is-active' : ''}`.trim()}
                    onClick={() => setFilterStatus('review')}
                    aria-pressed={filterStatus === 'review'}
                  >
                    <span className="metric-label"><FiMessageCircle className="projects-status-icon" />Review</span>
                    <span className="metric-value">{groupedCounts.review}</span>
                  </button>
                  <button
                    type="button"
                    className={`metric projects-filter-card ${statusMetricClass('finished')}${filterStatus === 'done' ? ' is-active' : ''}`.trim()}
                    onClick={() => setFilterStatus('done')}
                    aria-pressed={filterStatus === 'done'}
                  >
                    <span className="metric-label"><FiCheckCircle className="projects-status-icon" />Done</span>
                    <span className="metric-value">{groupedCounts.done}</span>
                  </button>
                  <button
                    type="button"
                    className={`metric projects-filter-card ${statusMetricClass('canceled')}${filterStatus === 'deactive' ? ' is-active' : ''}`.trim()}
                    onClick={() => setFilterStatus('deactive')}
                    aria-pressed={filterStatus === 'deactive'}
                  >
                    <span className="metric-label"><FiSlash className="projects-status-icon" />Deactive</span>
                    <span className="metric-value">{groupedCounts.deactive}</span>
                  </button>
                </div>
              </div>
              <div className="prj-filters-panel">
                <div className="row" style={{ justifyContent: 'flex-end', marginBottom: filtersOpen ? 10 : 0 }}>
                  <button
                    type="button"
                    className="ghost btn-tone-neutral"
                    onClick={() => setFiltersOpen((prev) => !prev)}
                    aria-expanded={filtersOpen}
                    aria-controls="projectsFiltersPanel"
                  >
                    <FiChevronDown style={{ transform: filtersOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform .2s ease' }} />
                    Filters
                  </button>
                </div>
                {filtersOpen ? (
                  <div id="projectsFiltersPanel" className="prj-filter-group prj-filter-group-compact">
                    <input id="prjFilter" className="prj-search" placeholder="Search by project description or address" value={query} onChange={(e) => setQuery(e.target.value)} />
                    <select id="prjStatus" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Project status filter">
                      {PROJECT_FILTER_OPTIONS.map((opt) => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
                    </select>
                    <select value={filterCustomerId} onChange={(e) => setFilterCustomerId(e.target.value)} aria-label="Customer filter">
                      <option value="">All customers</option>
                      {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName || customer.id}</option>)}
                    </select>
                    <button type="button" className="btn-tone-neutral" onClick={() => { setFilterStatus(''); setFilterCustomerId(''); setQuery(''); }}>Clear</button>
                  </div>
                ) : null}
              </div>
            </div>

            <div id="prjList" style={{ marginTop: 14 }}>
              {visibleProjects.map((project) => {
                const statusKey = normalizeStatusKey(project.status);
                const statusLabel = toStatusLabel(project.status);
                const statusTone = toStatusTone(statusKey);
                const finance = projectFinanceBreakdown(project);
                const addressRaw = String(project.address?.raw || '').trim();
                const directionsHref = buildDirectionsHref(addressRaw);
                const customer = project.customer || {};
                const customerPhone = String(customer.phone || project.clientPhone || '').trim();
                const customerPhoneHref = customerPhone ? `tel:${customerPhone.replace(/\s+/g, '')}` : '';
                const customerSmsHref = customerPhone ? `sms:${customerPhone.replace(/\s+/g, '')}` : '';
                return (
                  <div key={project.id} className="prj-item" data-status={statusTone}>
                    <div className="prj-row1">
                      <div className="prj-title">{project.description || 'Untitled project'}</div>
                      <div className="prj-status-inline">
                        <span className={`pill ${statusTone}`}>{statusLabel}</span>
                        {statusKey === 'ongoing' ? (
                          <span className="prj-ongoing-clock" title="Ongoing project">
                            <FiClock />
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="prj-time">
                      {directionsHref ? (
                        <div className="address-link">
                          <span className="prj-time-muted address-link-text">{addressRaw}</span>
                          <a className="address-link-icon-btn" href={directionsHref} target="_blank" rel="noreferrer" aria-label={`Open directions for ${addressRaw}`} title="Open directions"><FiNavigation /></a>
                        </div>
                      ) : <span className="prj-time-muted">-</span>}
                    </div>
                    {(customer.fullName || customer.phone || customer.email || customer.address || project.clientFullName || project.clientPhone || project.clientEmail) ? (
                      <div className="prj-client-block">
                        <div className="prj-client-line"><strong>Customer:</strong> {customer.fullName || project.clientFullName || '-'}</div>
                        {customerPhone ? (
                          <div className="prj-client-line">
                            <strong>Phone:</strong>
                            <span className="address-link" style={{ display: 'inline-flex', marginLeft: 6 }}>
                              {customerPhoneHref ? (
                                <a
                                  className="address-link-icon-btn"
                                  href={customerPhoneHref}
                                  aria-label={`Call ${customer.fullName || project.clientFullName || 'customer'}`}
                                  title="Call"
                                >
                                  <FiPhone />
                                </a>
                              ) : null}
                              {customerSmsHref ? (
                                <a
                                  className="address-link-icon-btn"
                                  href={customerSmsHref}
                                  aria-label={`Message ${customer.fullName || project.clientFullName || 'customer'}`}
                                  title="Message"
                                >
                                  <FiMessageCircle />
                                </a>
                              ) : null}
                              <span className="address-link-text">{customerPhone}</span>
                            </span>
                          </div>
                        ) : null}
                        {(customer.email || project.clientEmail) ? <div className="prj-client-line"><strong>Email:</strong> <a href={`mailto:${customer.email || project.clientEmail}`}>{customer.email || project.clientEmail}</a></div> : null}
                        {customer.address ? <div className="prj-client-line"><strong>Address:</strong> {customer.address}</div> : null}
                      </div>
                    ) : null}
                    <div className="prj-client-block prj-date-grid">
                      <div className="prj-date-col prj-date-col-actual">
                        <div className="prj-date-chip prj-date-chip-actual">
                          <span className="prj-date-label">Actual Start</span>
                          <strong>{formatDateOrDash(project.actualStartAt)}</strong>
                        </div>
                        <div className="prj-date-chip prj-date-chip-actual">
                          <span className="prj-date-label">Actual End</span>
                          <strong>{formatDateOrDash(project.actualEndAt)}</strong>
                        </div>
                      </div>
                      <div className="prj-date-col prj-date-col-summary">
                        <div className="prj-date-chip prj-date-chip-planned">
                          <span className="prj-date-label">Planned Start</span>
                          <strong>{formatDateOrDash(project.estimatedStartAt)}</strong>
                        </div>
                        <div className="prj-date-chip prj-date-chip-duration">
                          <span className="prj-date-label">Total Duration</span>
                          <strong>{formatDurationDaysOrDash(project.actualDurationDays)}</strong>
                        </div>
                      </div>
                    </div>
                    {project.materials ? <div className="prj-client-block"><div className="prj-client-line"><strong>Materials:</strong> {project.materials}</div></div> : null}
                    <div className="prj-actions">
                      <div className="prj-amount prj-finance-block" data-fallback={finance.usedFallback ? '1' : '0'}>
                        <div className="prj-finance-row is-quote">
                          <span>Total Quote</span>
                          <strong>{moneyOrDash(finance.quote)}</strong>
                        </div>
                        <div className="prj-finance-row is-referral">
                          <span>Referral</span>
                          <strong>{moneyOrDash(finance.referralAmount)}</strong>
                        </div>
                        <div className="prj-finance-row is-net">
                          <span>Net</span>
                          <strong>{moneyOrDash(finance.netQuoteAfterReferral)}</strong>
                        </div>
                      </div>
                      <div className="prj-action-buttons">
                        <button type="button" className="ghost btn-tone-warning" onClick={() => startEditProject(project)}>Edit</button>
                        <button type="button" className="ghost btn-tone-success" onClick={() => openStatusModal(project)}>Status</button>
                        <button
                          type="button"
                          className="ghost btn-tone-info btn-with-spinner"
                          onClick={() => loadProjectSummary(project.id)}
                          disabled={projectSummaryBusyId === String(project.id)}
                        >
                          {projectSummaryBusyId === String(project.id) ? <FiLoader className="btn-spinner" /> : null}
                          <span>{projectSummaryBusyId === String(project.id) ? 'Loading...' : 'View Summary'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!visibleProjects.length && !projectsLoading ? <div className="muted">No projects found.</div> : null}
            {projectsLoading && !visibleProjects.length ? <div className="muted">Loading...</div> : null}
            {!projectsLoading && projectsCursor ? <button type="button" className="btn-tone-neutral" onClick={() => loadProjects()}>Load more</button> : null}
            <div ref={sentinelRef} />
          </>
        ) : null}

        {pageTab === 'customers' ? (
          <>
            <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginBottom: 10 }}>
              <button type="button" className="ghost btn-tone-primary" onClick={openNewCustomerModal}><FiPlusCircle />New Customer</button>
            </div>
            <div className="prj-filter-group prj-filter-group-compact" style={{ marginBottom: 10 }}>
              <input className="prj-search" placeholder="Search customers by name" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} />
              <button type="button" className="btn-tone-neutral" onClick={() => setCustomerQuery('')}>Clear</button>
            </div>
            <div className="fin-tx-list">
              {customers.map((customer) => {
                const customerAddress = String(customer.address || '').trim();
                const customerDirectionsHref = buildDirectionsHref(customerAddress);
                const customerPhone = String(customer.phone || '').trim();
                const customerPhoneHref = customerPhone ? `tel:${customerPhone.replace(/\s+/g, '')}` : '';
                return (
                  <div key={customer.id} className="fin-tx-item">
                    <div className="fin-tx-main">
                      <span className="fin-tx-label">{customer.fullName || '-'}</span>
                      <span className="fin-tx-meta">{customer.email || '-'}</span>
                      {customerPhoneHref ? (
                        <div className="address-link">
                          <span className="fin-tx-meta address-link-text">{customerPhone}</span>
                          <a
                            className="address-link-icon-btn"
                            href={customerPhoneHref}
                            aria-label={`Call ${customer.fullName || 'customer'}`}
                            title="Call customer"
                          >
                            <FiPhone />
                          </a>
                        </div>
                      ) : null}
                      {customerDirectionsHref ? (
                        <div className="address-link">
                          <span className="fin-tx-meta address-link-text">{customerAddress}</span>
                          <a
                            className="address-link-icon-btn"
                            href={customerDirectionsHref}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`Open directions for ${customerAddress}`}
                            title="Open directions"
                          >
                            <FiNavigation />
                          </a>
                        </div>
                      ) : null}
                    </div>
                    <button type="button" className="ghost btn-tone-warning" onClick={() => openEditCustomerModal(customer)}><FiEdit2 />Edit</button>
                  </div>
                );
              })}
            </div>
            {!customers.length && !customersLoading ? <div className="muted">No customers found.</div> : null}
            {customersLoading && !customers.length ? <div className="muted">Loading customers...</div> : null}
            {!customersLoading && customersCursor ? <button type="button" className="btn-tone-neutral" onClick={() => loadCustomers()}>Load more customers</button> : null}
          </>
        ) : null}
      </div>

      <SimpleModal
        open={projectSummaryModalOpen}
        onClose={() => setProjectSummaryModalOpen(false)}
        title={selectedProjectSummary?.projectDescription || 'Project Summary'}
        size="md"
      >
        <div className="modal-form-grid">
          <div className="full fin-project-summary-chart-card">
            <div className="fin-project-summary-donut-wrap">
              <div className="fin-project-summary-donut" style={projectChartStyle}>
                {donutSegmentMarkers([
                  { label: 'Labor', pct: projectLaborPct },
                  { label: 'Company', pct: projectCompanyProjectRelatedPct },
                  { label: 'Remain', pct: projectRemainingPct }
                ]).map((marker) => (
                  <span
                    key={`projects-summary-${marker.key}`}
                    className="fin-donut-marker is-sm"
                    style={{
                      left: `${50 + (marker.x * 46)}%`,
                      top: `${50 + (marker.y * 46)}%`
                    }}
                    title={`${marker.label}: ${marker.pct.toFixed(1)}%`}
                  >
                    {marker.pct.toFixed(1)}%
                  </span>
                ))}
                <div className="fin-project-summary-donut-center">
                  {projectSummaryLoading ? <FiLoader className="btn-spinner" /> : <strong>{projectChartSpentPct.toFixed(1)}%</strong>}
                  <small>{projectSummaryLoading ? 'Loading' : 'Spent'}</small>
                </div>
              </div>
            </div>
            <div className="fin-project-summary-chart-meta">
              <div className="fin-project-summary-group">
                <div className="fin-project-summary-row">
                  <span className="dot labor" />
                  <span>{`Labor (${projectLaborPct.toFixed(1)}%)`}</span>
                  <strong>{money(projectLaborEarned)}</strong>
                </div>
                <div className="fin-project-summary-row">
                  <span className="dot agreed" />
                  <span>{`Company Expenses (Project-Related) (${projectCompanyProjectRelatedPct.toFixed(1)}%)`}</span>
                  <strong>{money(projectCompanyProjectRelatedExpenses)}</strong>
                </div>
                <div className="fin-project-summary-row">
                  <span className="dot remaining" />
                  <span>{`Remaining (${projectRemainingPct.toFixed(1)}%)`}</span>
                  <strong>{money(Math.max(0, projectQuoteAmount - projectConsumedTotal))}</strong>
                </div>
              </div>
              <div className="fin-project-summary-group fin-project-summary-group-extra">
                <div className="fin-project-summary-row">
                  <span className="row-icon consumed" aria-hidden="true"><FiTrendingUp /></span>
                  <span className="with-icon-label">Consumed</span>
                  <strong>{money(projectConsumedTotal)}</strong>
                </div>
                <div className="fin-project-summary-row-group material-group">
                  <div className="fin-project-summary-row">
                    <span className="row-icon material" aria-hidden="true"><FiPlusCircle /></span>
                    <span className="with-icon-label">Project Material Expenses</span>
                    <strong>{money(projectExpenses)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot material-paid" />
                    <span>Material Paid by Customer</span>
                    <strong>{money(projectMaterialPaidByCustomer)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot material-net" />
                    <span>Net Material Expense</span>
                    <strong>{money(projectMaterialExpenseNet)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="full fin-project-summary-top">
            <div className="fin-project-top-card status-card">
              <span className="home-metric-label">Status</span>
              <span className={`home-metric-value fin-status-badge ${projectStatusToneClass}`}>{selectedProjectSummary?.projectStatus || '-'}</span>
            </div>
            <div className="fin-project-top-card agreed-card">
              <span className="home-metric-label">Agreed Amount</span>
              <span className="home-metric-value">{money(selectedProjectSummary?.projectQuoteAmount)}</span>
            </div>
            <div className="fin-project-top-card total-cost">
              <span className="home-metric-label">Consumed</span>
              <span className="home-metric-value">{money(projectConsumedTotal)}</span>
            </div>
          </div>
          <div className="full home-stat-grid fin-project-metrics">
            <div className="home-metric metric-workers">
              <div className="prj-metric-head"><span className="prj-metric-icon workers"><FiUserPlus /></span><span className="home-metric-label">Workers Count</span></div>
              <span className="home-metric-value">{Number(selectedProjectSummary?.workersCount || 0)}</span>
            </div>
            <div className="home-metric metric-hours">
              <div className="prj-metric-head"><span className="prj-metric-icon hours"><FiClock /></span><span className="home-metric-label">Labor Hours Worked</span></div>
              <span className="home-metric-value">{hoursFromMinutes(selectedProjectSummary?.laborMinutes)}</span>
            </div>
            <div className="home-metric metric-labor">
              <div className="prj-metric-head"><span className="prj-metric-icon labor"><FiTrendingUp /></span><span className="home-metric-label">Labor Earned</span></div>
              <span className="home-metric-value">{money(selectedProjectSummary?.laborEarnings)}</span>
            </div>
            <div className="home-metric metric-material">
              <div className="prj-metric-head"><span className="prj-metric-icon material"><FiPlusCircle /></span><span className="home-metric-label">Project Material Expenses</span></div>
              <span className="home-metric-value">{money(selectedProjectSummary?.projectExpenseTotal)}</span>
            </div>
            <div className="home-metric metric-company-expense">
              <div className="prj-metric-head"><span className="prj-metric-icon company"><FiTrendingUp /></span><span className="home-metric-label">Company Expenses (Project-Related)</span></div>
              <span className="home-metric-value">{money(selectedProjectSummary?.companyProjectRelatedExpenseTotal)}</span>
            </div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal open={projectModalOpen} onClose={() => { if (!projectSaving && !projectDeleteBusy) { setProjectModalOpen(false); setProjectCustomerSearch(''); setProjectCustomerPickerOpen(false); setProjectCustomerOptions([]); setProjectCustomerCursor(null); setProjectCustomerHasMore(false); } }} title={editProjectId ? 'Edit Project' : 'New Project'}>
        <div className="modal-form-grid" style={{ position: 'relative' }}>
          {projectSaving ? <div className="modal-saving-overlay" aria-live="polite" aria-busy="true"><FiLoader className="btn-spinner" style={{ width: 26, height: 26 }} /><div>Saving project...</div></div> : null}
          <input className="full" placeholder="Description" value={projectForm.description} onChange={(e) => setProjectForm((prev) => ({ ...prev, description: e.target.value }))} />
          <div className="full" style={{ position: 'relative' }}>
            <input className="full" placeholder="Address" value={projectForm.addressRaw} onChange={(e) => setProjectForm((prev) => ({ ...prev, addressRaw: e.target.value }))} disabled={projectSaving} />
            {(addressLoading || addressSuggestions.length > 0) ? (
              <div style={{ marginTop: 6, border: '1px solid var(--glass-5)', borderRadius: 12, background: 'var(--card)', maxHeight: 180, overflow: 'auto', padding: 6 }}>
                {addressLoading ? <div className="muted" style={{ padding: 8 }}>Searching address...</div> : null}
                {!addressLoading && addressSuggestions.map((item) => (
                  <button key={`${item.value}`} type="button" className="ghost btn-tone-info" style={{ width: '100%', textAlign: 'left', marginBottom: 6 }} onClick={() => { setProjectForm((prev) => ({ ...prev, addressRaw: item.value })); setAddressSuggestions([]); }} disabled={projectSaving}>{item.label}</button>
                ))}
              </div>
            ) : null}
          </div>
          <input type="date" placeholder="Estimated start date" value={projectForm.estimatedStartAt} onChange={(e) => setProjectForm((prev) => ({ ...prev, estimatedStartAt: e.target.value }))} disabled={projectSaving} />
          <input type="number" min="0" step="0.01" placeholder="Quote amount" value={projectForm.quoteAmount} onChange={(e) => setProjectForm((prev) => ({ ...prev, quoteAmount: e.target.value }))} disabled={projectSaving} />
          <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Referral</span>
            <button
              type="button"
              className={`ghost ${projectForm.referralEnabled ? 'btn-tone-success' : 'btn-tone-neutral'}`}
              onClick={() => setProjectForm((prev) => ({
                ...prev,
                referralEnabled: !prev.referralEnabled,
                referralPercent: !prev.referralEnabled ? (prev.referralPercent || '20') : prev.referralPercent
              }))}
              disabled={projectSaving}
            >
              {projectForm.referralEnabled ? 'Enabled' : 'Disabled'}
            </button>
          </div>
          {projectForm.referralEnabled ? (
            <>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                placeholder="Referral percent"
                value={projectForm.referralPercent}
                onChange={(e) => setProjectForm((prev) => ({ ...prev, referralPercent: e.target.value }))}
                disabled={projectSaving}
              />
              <div className="full muted">Estimated referral expense (preview): {money(projectReferralPreviewAmount)}</div>
            </>
          ) : null}
          <div className="full prj-client-block" style={{ margin: 0 }}>
            <div className="prj-client-line"><strong>Planned Start:</strong> {projectForm.estimatedStartAt ? formatDateOrDash(projectForm.estimatedStartAt) : '--'}</div>
            <div className="prj-client-line"><strong>Actual Start (system):</strong> {formatDateOrDash(editingProject?.actualStartAt)}</div>
            <div className="prj-client-line"><strong>Actual End (system):</strong> {formatDateOrDash(editingProject?.actualEndAt)}</div>
            <div className="prj-client-line"><strong>Actual Duration (system):</strong> {formatDurationDaysOrDash(editingProject?.actualDurationDays)}</div>
          </div>
          <input
            className="full"
            placeholder="Search customer for project"
            value={projectCustomerPickerOpen ? projectCustomerSearch : selectedProjectCustomerLabel}
            onFocus={async () => {
              setProjectCustomerPickerOpen(true);
              if (!projectCustomerPickerOpen) setProjectCustomerSearch('');
              await loadProjectCustomerOptions({ reset: true, queryOverride: '' });
            }}
            onClick={async () => {
              setProjectCustomerPickerOpen((prev) => !prev);
              if (!projectCustomerPickerOpen) setProjectCustomerSearch('');
              if (!projectCustomerPickerOpen) await loadProjectCustomerOptions({ reset: true, queryOverride: '' });
            }}
            onChange={(e) => {
              setProjectCustomerPickerOpen(true);
              setProjectCustomerSearch(e.target.value);
            }}
            disabled={projectSaving}
          />
          {projectCustomerPickerOpen ? (
          <div
            className="full fin-expense-project-picker"
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
              if (!nearBottom) return;
              loadProjectCustomerOptions({ reset: false }).catch(() => {});
            }}
          >
            <button
              type="button"
              className={`fin-expense-project-item${projectForm.customerId ? '' : ' active'}`}
              onClick={() => {
                setProjectForm((prev) => ({ ...prev, customerId: '' }));
                skipNextProjectCustomerSearchRef.current = true;
                setProjectCustomerSearch('');
                setProjectCustomerPickerOpen(false);
              }}
              disabled={projectSaving}
            >
              <span className="fin-expense-status none">NONE</span>
              <span className="fin-expense-project-label">No customer</span>
            </button>
            {projectCustomerOptions.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={`fin-expense-project-item${String(projectForm.customerId || '') === String(customer.id) ? ' active' : ''}`}
                onClick={() => {
                  setProjectForm((prev) => ({
                    ...prev,
                    customerId: String(customer.id),
                    addressRaw: customer?.address ? customer.address : prev.addressRaw
                  }));
                  skipNextProjectCustomerSearchRef.current = true;
                  setProjectCustomerSearch(customer.fullName || customer.id || '');
                  setProjectCustomerPickerOpen(false);
                }}
                disabled={projectSaving}
              >
                <span className="fin-expense-status none">CUST</span>
                <span className="fin-expense-project-label">{customer.fullName || customer.id || '-'}</span>
              </button>
            ))}
            {!projectCustomerLoading && !projectCustomerOptions.length ? (
              <div className="muted fin-expense-project-empty">No customers found.</div>
            ) : null}
          </div>
          ) : null}
          {projectCustomerPickerOpen && projectCustomerLoading ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading customers...</span>
            </div>
          ) : null}
          {projectCustomerPickerOpen && projectCustomerLoadMoreBusy ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading more customers...</span>
            </div>
          ) : null}
          {projectCustomerPickerOpen && !projectCustomerLoading && projectCustomerHasMore ? (
            <button
              type="button"
              className="ghost btn-tone-neutral"
              onClick={() => loadProjectCustomerOptions({ reset: false })}
              disabled={projectCustomerLoadMoreBusy || projectSaving}
            >
              {projectCustomerLoadMoreBusy ? 'Loading...' : 'Load more customers'}
            </button>
          ) : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}><button type="button" className="ghost btn-tone-info" onClick={openNewCustomerModal}>+ New Customer</button></div>
          <textarea className="full" rows={3} placeholder="Materials (optional)" value={projectForm.materials} onChange={(e) => setProjectForm((prev) => ({ ...prev, materials: e.target.value }))} disabled={projectSaving} />
          <div className="full"><button type="button" className="ghost btn-tone-purple" onClick={() => setProjectForm((prev) => ({ ...prev, advancedOpen: !prev.advancedOpen }))} disabled={projectSaving}>{projectForm.advancedOpen ? 'Hide advanced' : 'Show advanced'}</button></div>
          {projectForm.advancedOpen ? (
            <>
              <input placeholder="Location key (override)" value={projectForm.locationKey} onChange={(e) => setProjectForm((prev) => ({ ...prev, locationKey: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo lat (override)" value={projectForm.geoLat} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoLat: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo lng (override)" value={projectForm.geoLng} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoLng: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo radius m (default 1000, override)" value={projectForm.geoRadiusMeters} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoRadiusMeters: e.target.value }))} disabled={projectSaving} />
            </>
          ) : null}
          {projectFormError ? <div className="full muted">{projectFormError}</div> : null}
          <div className="full row" style={{ justifyContent: editProjectId ? 'space-between' : 'flex-end' }}>
            {editProjectId && canDelete ? (
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={() => onToggleProjectActive(editProjectId, { fromModal: true })}
                disabled={projectSaving || projectDeleteBusy}
              >
                {projectDeleteBusy ? <FiLoader className="btn-spinner" /> : null}
                <span>
                  {projectDeleteBusy
                    ? (editProjectIsActive ? 'Deactivating...' : 'Activating...')
                    : (editProjectIsActive ? 'Deactivate Project' : 'Activate Project')}
                </span>
              </button>
            ) : null}
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="ghost btn-tone-neutral" onClick={() => setProjectModalOpen(false)} disabled={projectSaving || projectDeleteBusy}>Cancel</button>
              <button type="button" className="btn-tone-primary btn-with-spinner" onClick={saveProject} disabled={projectSaving || projectDeleteBusy}>{projectSaving ? <FiLoader className="btn-spinner" /> : null}<span>{projectSaving ? 'Saving...' : (editProjectId ? 'Update' : 'Create')}</span></button>
            </div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal open={customerModalOpen} onClose={() => { if (!customerSaving) setCustomerModalOpen(false); }} title={editCustomerId ? 'Edit Customer' : 'New Customer'} size="sm">
        <div className="modal-form-grid">
          <input className="full" placeholder="Full Name" value={customerForm.fullName} onChange={(e) => setCustomerForm((prev) => ({ ...prev, fullName: e.target.value }))} />
          <div className="full" style={{ position: 'relative' }}>
            <input className="full" placeholder="Address" value={customerForm.address} onChange={(e) => setCustomerForm((prev) => ({ ...prev, address: e.target.value }))} />
            {(customerAddressLoading || customerAddressSuggestions.length > 0) ? (
              <div style={{ marginTop: 6, border: '1px solid var(--glass-5)', borderRadius: 12, background: 'var(--card)', maxHeight: 180, overflow: 'auto', padding: 6 }}>
                {customerAddressLoading ? <div className="muted" style={{ padding: 8 }}>Searching address...</div> : null}
                {!customerAddressLoading && customerAddressSuggestions.map((item) => (
                  <button
                    key={`${item.value}`}
                    type="button"
                    className="ghost btn-tone-info"
                    style={{ width: '100%', textAlign: 'left', marginBottom: 6 }}
                    onClick={() => {
                      setCustomerForm((prev) => ({ ...prev, address: item.value }));
                      setCustomerAddressSuggestions([]);
                    }}
                    disabled={customerSaving}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <input type="email" placeholder="Email" value={customerForm.email} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))} />
          <input placeholder="Phone" value={customerForm.phone} onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))} />
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setCustomerModalOpen(false)} disabled={customerSaving}>Cancel</button>
            <button type="button" className="btn-tone-primary btn-with-spinner" onClick={saveCustomer} disabled={customerSaving}>{customerSaving ? <FiLoader className="btn-spinner" /> : null}<span>{customerSaving ? 'Saving...' : (editCustomerId ? 'Update Customer' : 'Create Customer')}</span></button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal open={statusModalOpen} onClose={() => { if (!statusSaving) { setStatusModalOpen(false); setStatusTargetProject(null); } }} title="Change Project Status" size="sm">
        <div className="modal-form-grid" style={{ position: 'relative' }}>
          {statusSaving ? <div className="modal-saving-overlay" aria-live="polite" aria-busy="true"><FiLoader className="btn-spinner" style={{ width: 26, height: 26 }} /><div>Updating status...</div></div> : null}
          <div className="full muted">{statusTargetProject?.description || 'Project'}</div>
          <select className="full" value={statusValue} onChange={(e) => setStatusValue(e.target.value)} disabled={statusSaving}>
            {PROJECT_STATUS_UPDATE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setStatusModalOpen(false)} disabled={statusSaving}>Cancel</button>
            <button type="button" className="btn-tone-success btn-with-spinner" onClick={saveStatus} disabled={statusSaving}>{statusSaving ? <FiLoader className="btn-spinner" /> : null}<span>{statusSaving ? 'Saving...' : 'Update Status'}</span></button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
