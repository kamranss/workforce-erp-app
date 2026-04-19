import { useEffect, useRef, useState } from 'react';
import { FiAlertTriangle, FiCheckCircle, FiChevronDown, FiDollarSign, FiLoader, FiNavigation, FiPlusCircle, FiTrendingUp, FiUserPlus, FiXCircle } from 'react-icons/fi';
import { createBonus, deleteBonus, listBonuses, updateBonus } from '../api/bonusAndPenaltiesApi.js';
import { createCustomerPayment, deleteCustomerPayment, listCustomerPayments, updateCustomerPayment } from '../api/customerPaymentsApi.js';
import { createExpense, deleteExpense, listExpenses, updateExpense } from '../api/expensesApi.js';
import { createPayment, deletePayment, listPayments, updatePayment } from '../api/paymentsApi.js';
import { listProjects, searchProjectsForExpenses } from '../api/projectsApi.js';
import { companyExpensesOverview, customerPaymentsOverview, projectSummary, projectsFinanceOverview, userLiability } from '../api/reportsApi.js';
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

const EXPENSE_TYPE_OPTIONS = [
  { value: 'gas', label: 'Gas' },
  { value: 'utility', label: 'Utility' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'food', label: 'Food' },
  { value: 'tools', label: 'Tools' },
  { value: 'city_expenses', label: 'City Expenses' },
  { value: 'store', label: 'Store' },
  { value: 'storage', label: 'Storage' },
  { value: 'archcloset', label: 'Archcloset' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'material', label: 'Material' },
  { value: 'referral', label: 'Referral' },
  { value: 'damage', label: 'Damage' },
  { value: 'unknown', label: 'Unknown' },
  { value: 'other', label: 'Other' }
];
const EXPENSE_MUTABLE_TYPE_OPTIONS = EXPENSE_TYPE_OPTIONS.filter((option) => option.value !== 'referral');

const COMPANY_EXPENSES_LABOR_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#10b981', '#0ea5e9', '#6366f1', '#8b5cf6', '#ec4899'];
const COMPANY_EXPENSES_CATEGORY_COLORS = ['#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#14b8a6', '#a855f7', '#64748b', '#94a3b8', '#475569', '#e11d48'];

function isReferralType(value) {
  return String(value || '').trim().toLowerCase() === 'referral';
}

function isReferralManagedErrorMessage(message) {
  const text = String(message || '').toLowerCase();
  return text.includes('referral expenses are managed automatically')
    || text.includes('cannot be created manually')
    || text.includes('cannot be updated manually')
    || text.includes('cannot be deleted manually');
}

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

function formatDateOrDash(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return date.toLocaleDateString();
}

function formatDurationDaysOrDash(value) {
  if (value === null || value === undefined || value === '') return '--';
  const days = Number(value);
  if (Number.isNaN(days)) return '--';
  return `${days.toFixed(2)} days`;
}

function pickNullableNumber(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function buildFinanceOverviewChart(
  quoteAmount,
  laborUsed,
  _projectExpensesUsed,
  companyProjectRelatedExpensesUsed,
  companyOwnedExpensesUsed,
  remainingFromQuote
) {
  const quote = Math.max(0, Number(quoteAmount || 0));
  const labor = Math.max(0, Number(laborUsed || 0));
  const companyProjectRelatedExpenses = Math.max(0, Number(companyProjectRelatedExpensesUsed || 0));
  const companyOwnedExpenses = Math.max(0, Number(companyOwnedExpensesUsed || 0));
  const remainingRaw = Number(remainingFromQuote || 0);
  const remaining = Math.max(0, remainingRaw);
  const fallbackBase = labor + companyProjectRelatedExpenses + companyOwnedExpenses + remaining;
  const base = quote > 0 ? quote : Math.max(fallbackBase, 1);

  const laborPct = Math.max(0, Math.min(100, (labor / base) * 100));
  const companyProjectRelatedPct = Math.max(0, Math.min(100 - laborPct, (companyProjectRelatedExpenses / base) * 100));
  const companyOwnedPct = Math.max(0, Math.min(100 - laborPct - companyProjectRelatedPct, (companyOwnedExpenses / base) * 100));
  const remainingPct = Math.max(0, 100 - laborPct - companyProjectRelatedPct - companyOwnedPct);
  const consumedPct = Math.max(0, Math.min(100, ((labor + companyProjectRelatedExpenses + companyOwnedExpenses) / base) * 100));
  const overrun = remainingRaw < 0
    ? Math.abs(remainingRaw)
    : Math.max(0, (labor + companyProjectRelatedExpenses + companyOwnedExpenses) - quote);

  const companyOwnedStart = laborPct + companyProjectRelatedPct;
  const companyOwnedEnd = companyOwnedStart + companyOwnedPct;

  const chartStyle = {
    background: `conic-gradient(var(--fin-chart-labor) 0 ${laborPct}%, var(--fin-chart-company) ${laborPct}% ${laborPct + companyProjectRelatedPct}%, var(--fin-chart-company-owned-start) ${companyOwnedStart}% ${companyOwnedEnd}%, var(--fin-chart-remaining) ${companyOwnedEnd}% ${companyOwnedEnd + remainingPct}%)`
  };

  const tone = consumedPct >= 75 ? 'danger' : consumedPct >= 50 ? 'warn' : 'good';
  return {
    chartStyle,
    consumedPct,
    overrun,
    tone,
    laborPct,
    companyProjectRelatedPct,
    companyOwnedPct,
    remainingPct
  };
}

function buildPaidPendingChart(paidAmount, pendingAmount) {
  const paid = Math.max(0, Number(paidAmount || 0));
  const pending = Math.max(0, Number(pendingAmount || 0));
  const base = Math.max(1, paid + pending);
  const paidPct = Math.max(0, Math.min(100, (paid / base) * 100));
  const pendingPct = Math.max(0, 100 - paidPct);
  const chartStyle = {
    background: `conic-gradient(var(--fin-chart-paid) 0 ${paidPct}%, var(--fin-chart-pending) ${paidPct}% ${paidPct + pendingPct}%, var(--fin-chart-track) ${paidPct + pendingPct}% 100%)`
  };
  return { chartStyle, paidPct, pendingPct };
}

function buildBreakdownChart(items, colors, emptyColor = 'rgba(148,163,184,0.22)') {
  const source = Array.isArray(items) ? items : [];
  const valid = source
    .map((item, index) => {
      const amount = Math.max(0, Number(item?.amount || 0));
      const percentage = Math.max(0, Number(item?.percentage || 0));
      return {
        ...item,
        amount,
        percentage,
        color: colors[index % colors.length]
      };
    })
    .filter((item) => item.amount > 0 || item.percentage > 0);
  const total = valid.reduce((sum, item) => sum + item.amount, 0);
  if (!valid.length || total <= 0) {
    return {
      chartStyle: { background: `conic-gradient(${emptyColor} 0 100%)` },
      segments: [],
      total: 0
    };
  }
  let cursor = 0;
  const stops = [];
  const segments = valid.map((item) => {
    const pct = item.percentage > 0 ? item.percentage : ((item.amount / total) * 100);
    const start = cursor;
    cursor += pct;
    stops.push(`${item.color} ${start}% ${cursor}%`);
    return { ...item, pct };
  });
  return {
    chartStyle: { background: `conic-gradient(${stops.join(', ')})` },
    segments,
    total
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

function companyDonutMarkerStyle(marker, accentColor) {
  const x = Math.max(-0.74, Math.min(0.74, Number(marker?.x || 0)));
  const y = Math.max(-0.76, Math.min(0.76, Number(marker?.y || 0)));
  return {
    left: `${50 + (x * 74)}%`,
    top: `${50 + (y * 64)}%`,
    '--marker-accent': accentColor
  };
}

function percentageHealth(value, mode = 'consumed') {
  const pct = Number(value || 0);
  if (mode === 'remaining') {
    if (pct < 40) return { tone: 'bad', label: 'Risk', Icon: FiXCircle };
    if (pct < 60) return { tone: 'warn', label: 'Watch', Icon: FiAlertTriangle };
    return { tone: 'good', label: 'Normal', Icon: FiCheckCircle };
  }
  if (pct < 50) return { tone: 'good', label: 'Normal', Icon: FiCheckCircle };
  if (pct < 75) return { tone: 'warn', label: 'Watch', Icon: FiAlertTriangle };
  return { tone: 'bad', label: 'Risk', Icon: FiXCircle };
}

function PctBadge({ value, mode = 'consumed' }) {
  const pct = Number.isFinite(Number(value)) ? Number(value) : 0;
  const health = percentageHealth(pct, mode);
  const Icon = health.Icon;
  return (
    <span className={`fin-pct-badge ${health.tone}`} title={`${pct.toFixed(1)}% - ${health.label}`}>
      <Icon />
      <span>{`${pct.toFixed(1)}%`}</span>
      <small>{health.label}</small>
    </span>
  );
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
  if (key === 'review') return 'review';
  if (key === 'finished') return 'finished';
  if (key === 'canceled') return 'canceled';
  if (key === 'waiting') return 'waiting';
  return 'unknown';
}

function projectStatusLabel(status) {
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

function isActiveProject(project) {
  const statusKey = String(project?.status || '').trim().toLowerCase();
  if (project?.isActive === false) return false;
  if (project?.deletedAt) return false;
  if (statusKey === 'canceled') return false;
  return true;
}

function projectCardTone(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'waiting') return 'Waiting';
  if (key === 'ongoing') return 'Started';
  if (key === 'review') return 'Review';
  if (key === 'finished') return 'Completed';
  if (key === 'canceled') return 'Rejected';
  return 'Unknown';
}

function buildDirectionsHref(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(raw)}`;
}

function normalizeCustomerPaymentsOverview(raw) {
  const readAddressText = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value.trim();
    if (typeof value === 'object') {
      const direct = [
        value.raw,
        value.normalized,
        value.address,
        value.fullAddress,
        value.displayName,
        value.display_name
      ].find((v) => typeof v === 'string' && String(v).trim());
      if (direct) return String(direct).trim();
      const parts = [value.street, value.city, value.state, value.zip, value.postalCode]
        .map((v) => String(v || '').trim())
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    return '';
  };

  const source = raw || {};
  const totals = source?.summary || source?.totals || {};
  const chart = source?.chart || {};
  const rows = source?.projects || source?.ongoingProjects || source?.items || [];
  const projects = Array.isArray(rows) ? rows.map((item) => {
    const customer = item?.customer || {};
    const customerFullName = String(item?.customerName || customer?.fullName || '').trim();
    const customerNameRaw = String(item?.customerFirstName || customer?.name || '').trim();
    const customerSurnameRaw = String(item?.customerSurname || customer?.surname || '').trim();
    const fullNameParts = customerFullName ? customerFullName.split(/\s+/) : [];
    const customerName = customerNameRaw || fullNameParts[0] || '';
    const customerSurname = customerSurnameRaw || fullNameParts.slice(1).join(' ');
    const projectId = String(item?.projectId || item?.id || '').trim();
    const projectDescription = String(item?.projectDescription || item?.project?.description || '').trim();
    const projectAddress = readAddressText(item?.projectAddress)
      || readAddressText(item?.project?.address)
      || readAddressText(item?.address)
      || '';
    const quoteAmount = Number(item?.quoteAmount || 0);
    const mainWorkPaidAmount = Number(item?.mainWorkPaidAmount ?? item?.paidAmount ?? 0);
    const remainingAmount = Number(item?.remainingAmount ?? Math.max(0, quoteAmount - mainWorkPaidAmount));
    const remainingAmountForPie = Number(item?.remainingAmountForPie ?? Math.max(0, remainingAmount));
    const overpaidAmount = Number(item?.overpaidAmount ?? Math.max(0, mainWorkPaidAmount - quoteAmount));
    const materialPaidAmount = Number(item?.materialPaidAmount || 0);
    const otherPaidAmount = Number(item?.otherPaidAmount || 0);
    const unknownPaidAmount = Number(item?.unknownPaidAmount || 0);
    const nonMainWorkPaidAmount = Number(
      item?.nonMainWorkPaidAmount
      ?? (materialPaidAmount + otherPaidAmount + unknownPaidAmount)
    );
    return {
      projectId,
      projectDescription,
      customerName,
      customerSurname,
      projectAddress,
      quoteAmount,
      paidAmount: mainWorkPaidAmount,
      mainWorkPaidAmount,
      remainingAmount,
      remainingAmountForPie,
      overpaidAmount,
      materialPaidAmount,
      otherPaidAmount,
      unknownPaidAmount,
      nonMainWorkPaidAmount
    };
  }) : [];

  const totalMainWorkPaidAmount = Number(
    totals?.totalMainWorkPaidAmount
    ?? totals?.totalPaidAmount
    ?? chart?.paidAmount
    ?? projects.reduce((sum, item) => sum + Number(item.mainWorkPaidAmount || item.paidAmount || 0), 0)
  );
  const totalQuoteAmount = Number(
    totals?.totalQuoteAmount
    ?? projects.reduce((sum, item) => sum + Number(item.quoteAmount || 0), 0)
  );
  const totalRemainingAmount = Number(
    totals?.totalRemainingAmount
    ?? chart?.remainingAmount
    ?? projects.reduce((sum, item) => sum + Number(item.remainingAmount || 0), 0)
  );
  const totalOverpaidAmount = Number(
    totals?.totalOverpaidAmount
    ?? projects.reduce((sum, item) => sum + Number(item.overpaidAmount || 0), 0)
  );
  const materialPaidAmount = Number(
    chart?.materialPaidAmount
    ?? projects.reduce((sum, item) => sum + Number(item.materialPaidAmount || 0), 0)
  );
  const otherPaidAmount = Number(
    chart?.otherPaidAmount
    ?? projects.reduce((sum, item) => sum + Number(item.otherPaidAmount || 0), 0)
  );
  const unknownPaidAmount = Number(
    chart?.unknownPaidAmount
    ?? projects.reduce((sum, item) => sum + Number(item.unknownPaidAmount || 0), 0)
  );
  const nonMainWorkPaidAmount = Number(
    chart?.nonMainWorkPaidAmount
    ?? (materialPaidAmount + otherPaidAmount + unknownPaidAmount)
  );

  return {
    ongoingProjectsCount: Number(totals?.ongoingProjectsCount ?? projects.length),
    totalQuoteAmount,
    totalPaidAmount: totalMainWorkPaidAmount,
    totalMainWorkPaidAmount,
    totalRemainingAmount,
    totalOverpaidAmount,
    chart: {
      paidAmount: Number(chart?.paidAmount ?? totalMainWorkPaidAmount),
      remainingAmount: Number(chart?.remainingAmount ?? totalRemainingAmount),
      materialPaidAmount,
      otherPaidAmount,
      unknownPaidAmount,
      nonMainWorkPaidAmount
    },
    projects
  };
}

function projectOptionLabel(project) {
  const customerName = String(project?.customer?.fullName || project?.clientFullName || '').trim();
  const description = String(project?.description || '').trim();
  if (customerName && description) return `${customerName} - ${description}`;
  if (description) return description;
  if (customerName) return customerName;
  return String(project?.id || '-');
}

function financeUserOptionLabel(user) {
  const name = `${user?.name || ''} ${user?.surname || ''}`.trim();
  if (name && user?.email) return `${name} (${user.email})`;
  if (name) return name;
  return String(user?.email || user?.id || '-');
}

function formatAddressText(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const direct = [
      value.raw,
      value.normalized,
      value.address,
      value.fullAddress,
      value.displayName,
      value.display_name
    ].find((v) => typeof v === 'string' && String(v).trim());
    if (direct) return String(direct).trim();
    const parts = [value.street, value.city, value.state, value.zip, value.postalCode]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    if (parts.length) return parts.join(', ');
  }
  return '';
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
    projectExpenseTotal: pickNumber(root, ['projectExpenseTotal', 'expenseTotal', 'totalExpenses'], 0)
      || pickNumber(summary, ['projectExpenseTotal', 'expenseTotal', 'totalExpenses'], 0),
    companyProjectRelatedExpenseTotal: pickNumber(root, ['companyProjectRelatedExpenseTotal'], 0)
      || pickNumber(summary, ['companyProjectRelatedExpenseTotal'], 0),
    expenseTotalWithCompanyProjectRelated: pickNumber(root, ['expenseTotalWithCompanyProjectRelated'], 0)
      || pickNumber(summary, ['expenseTotalWithCompanyProjectRelated'], 0),
    netCostWithCompanyProjectRelated: pickNumber(root, ['netCostWithCompanyProjectRelated', 'netCost', 'totalCost'], 0)
      || pickNumber(summary, ['netCostWithCompanyProjectRelated', 'netCost', 'totalCost'], 0),
    materialPaidAmount: pickNumber(root, ['materialPaidAmount'], 0)
      || pickNumber(summary, ['materialPaidAmount'], 0),
    workersCount: pickNullableNumber(root, ['workersCount'])
      ?? pickNullableNumber(project, ['workersCount'])
      ?? pickNullableNumber(summary, ['workersCount'])
      ?? 0,
    projectDurationDays: pickNullableNumber(root, ['projectDurationDays', 'actualDurationDays'])
      ?? pickNullableNumber(project, ['projectDurationDays', 'actualDurationDays'])
      ?? pickNullableNumber(summary, ['projectDurationDays', 'actualDurationDays']),
    actualStartAt: pickText(root, ['actualStartAt'], '')
      || pickText(project, ['actualStartAt'], '')
      || pickText(summary, ['actualStartAt'], ''),
    actualEndAt: pickText(root, ['actualEndAt'], '')
      || pickText(project, ['actualEndAt'], '')
      || pickText(summary, ['actualEndAt'], ''),
    projectMaterialExpenseNetAfterCustomerPayments: pickNumber(
      root,
      ['projectMaterialExpenseNetAfterCustomerPayments'],
      pickNumber(summary, ['projectMaterialExpenseNetAfterCustomerPayments'], 0)
    )
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

function formatUserPaymentRateLabel(user) {
  const direct = String(user?.paymentRateLabel || '').trim();
  if (direct) return direct;
  const method = String(user?.paymentMethod || user?.paymentOption || '').toLowerCase();
  const amount = Number(user?.paymentRate ?? user?.paymentAmount ?? 0);
  if (!method) return '-';
  if (method === 'hourly') return `$${amount.toFixed(2)}/hr`;
  if (method === 'monthly') return `$${amount.toFixed(2)}/month`;
  return `${method} $${amount.toFixed(2)}`;
}

function formatCustomerPaymentTypeLabel(item) {
  const direct = String(item?.paymentTypeLabel || '').trim();
  if (direct) return direct;
  const raw = String(item?.paymentType || item?.type || '').toLowerCase();
  if (raw === 'main_work') return 'Main Work';
  if (raw === 'material') return 'Material';
  if (raw === 'other') return 'Other';
  if (raw === 'unknown') return 'Unknown';
  return raw ? raw.replace(/_/g, ' ') : '-';
}

function formatExpenseTypeLabel(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const key = raw.toLowerCase();
  const match = EXPENSE_TYPE_OPTIONS.find((option) => option.value === key);
  if (match) return match.label;
  return key
    .replace(/[_-]+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function createDefaultCompanyExpensesFilter() {
  return {
    year: new Date().getFullYear(),
    month: '',
    quarter: ''
  };
}

function normalizeCompanyExpensesOverview(raw) {
  const source = raw || {};
  const range = source?.range || {};
  const summary = source?.summary || {};
  const laborBreakdown = Array.isArray(source?.laborBreakdown) ? source.laborBreakdown.map((item) => ({
    userId: String(item?.userId || '').trim(),
    name: String(item?.name || item?.userName || 'Unknown Worker').trim() || 'Unknown Worker',
    amount: Number(item?.amount || 0),
    minutesWorked: Number(item?.minutesWorked || 0),
    hoursWorked: Number(item?.hoursWorked || 0),
    entriesCount: Number(item?.entriesCount || 0),
    percentage: Number(item?.percentage || 0)
  })) : [];
  const expenseCategoryBreakdown = Array.isArray(source?.expenseCategoryBreakdown) ? source.expenseCategoryBreakdown.map((item) => ({
    category: String(item?.category || '').trim(),
    label: String(item?.label || formatExpenseTypeLabel(item?.category)).trim() || formatExpenseTypeLabel(item?.category),
    amount: Number(item?.amount || 0),
    count: Number(item?.count || 0),
    percentage: Number(item?.percentage || 0)
  })) : [];
  return {
    range: {
      year: Number(range?.year || new Date().getFullYear()),
      month: range?.month ? Number(range.month) : null,
      quarter: range?.quarter ? Number(range.quarter) : null,
      from: range?.from || '',
      to: range?.to || '',
      label: String(range?.label || '').trim(),
      timeZone: String(range?.timeZone || '').trim()
    },
    summary: {
      totalLaborCost: Number(summary?.totalLaborCost || 0),
      totalOtherCompanyExpenses: Number(summary?.totalOtherCompanyExpenses || 0),
      totalCombinedCost: Number(summary?.totalCombinedCost || 0),
      laborWorkersCount: Number(summary?.laborWorkersCount || laborBreakdown.length || 0),
      expenseItemsCount: Number(summary?.expenseItemsCount || expenseCategoryBreakdown.reduce((sum, item) => sum + Number(item.count || 0), 0))
    },
    laborBreakdown,
    expenseCategoryBreakdown,
    expenseScopeBreakdown: {
      companyGeneral: {
        amount: Number(source?.expenseScopeBreakdown?.companyGeneral?.amount || 0),
        count: Number(source?.expenseScopeBreakdown?.companyGeneral?.count || 0)
      },
      companyProjectRelated: {
        amount: Number(source?.expenseScopeBreakdown?.companyProjectRelated?.amount || 0),
        count: Number(source?.expenseScopeBreakdown?.companyProjectRelated?.count || 0)
      }
    }
  };
}

export default function Finance() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();
  const [users, setUsers] = useState([]);
  const [usersCursor, setUsersCursor] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoadMoreBusy, setUsersLoadMoreBusy] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSearchDebounced, setUsersSearchDebounced] = useState('');
  const [projects, setProjects] = useState([]);
  const [payments, setPayments] = useState([]);
  const [customerPayments, setCustomerPayments] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [paymentForm, setPaymentForm] = useState({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
  const [paymentUserPickerOpen, setPaymentUserPickerOpen] = useState(false);
  const [paymentUserSearch, setPaymentUserSearch] = useState('');
  const [paymentEditId, setPaymentEditId] = useState('');
  const [paymentEditBusyId, setPaymentEditBusyId] = useState('');
  const [paymentCursor, setPaymentCursor] = useState(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [paymentLoadMoreBusy, setPaymentLoadMoreBusy] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState({ userId: '', method: '', from: '', to: '' });
  const [customerPaymentForm, setCustomerPaymentForm] = useState({ projectId: '', amount: '', type: 'main_work', paidAt: '', notes: '' });
  const [customerPaymentProjectPickerOpen, setCustomerPaymentProjectPickerOpen] = useState(false);
  const [customerPaymentEditId, setCustomerPaymentEditId] = useState('');
  const [customerPaymentEditBusyId, setCustomerPaymentEditBusyId] = useState('');
  const [customerPaymentCursor, setCustomerPaymentCursor] = useState(null);
  const [customerPaymentLoading, setCustomerPaymentLoading] = useState(false);
  const [customerPaymentLoadMoreBusy, setCustomerPaymentLoadMoreBusy] = useState(false);
  const [customerPaymentFilter, setCustomerPaymentFilter] = useState({ projectId: '', type: '', from: '', to: '' });
  const [expenseForm, setExpenseForm] = useState({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
  const [expenseEditId, setExpenseEditId] = useState('');
  const [expenseEditBusyId, setExpenseEditBusyId] = useState('');
  const [expenseCursor, setExpenseCursor] = useState(null);
  const [expenseLoading, setExpenseLoading] = useState(false);
  const [expenseLoadMoreBusy, setExpenseLoadMoreBusy] = useState(false);
  const [expenseFilter, setExpenseFilter] = useState({ scope: '', type: '', projectId: '', rangePreset: 'all', customFrom: '', customTo: '' });
  const [expenseProjectSearch, setExpenseProjectSearch] = useState('');
  const [expenseProjectPickerOpen, setExpenseProjectPickerOpen] = useState(false);
  const [expenseProjectOptions, setExpenseProjectOptions] = useState([]);
  const [expenseProjectOptionsLoading, setExpenseProjectOptionsLoading] = useState(false);
  const [expenseProjectCursor, setExpenseProjectCursor] = useState(null);
  const [expenseProjectHasMore, setExpenseProjectHasMore] = useState(false);
  const [expenseProjectLoadMoreBusy, setExpenseProjectLoadMoreBusy] = useState(false);
  const [bonusForm, setBonusForm] = useState({ userId: '', amount: '', description: '', effectiveAt: '' });
  const [bonusUserPickerOpen, setBonusUserPickerOpen] = useState(false);
  const [bonusUserSearch, setBonusUserSearch] = useState('');
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
  const [reportTab, setReportTab] = useState('finance');
  const [companyExpensesFilter, setCompanyExpensesFilter] = useState(() => createDefaultCompanyExpensesFilter());
  const [companyExpensesReport, setCompanyExpensesReport] = useState(null);
  const [companyExpensesLoading, setCompanyExpensesLoading] = useState(false);
  const [companyExpensesError, setCompanyExpensesError] = useState('');
  const [customerPaymentsReport, setCustomerPaymentsReport] = useState(null);
  const [customerPaymentsReportLoading, setCustomerPaymentsReportLoading] = useState(false);
  const [customerPaymentsProjectModalOpen, setCustomerPaymentsProjectModalOpen] = useState(false);
  const [selectedCustomerPaymentsProject, setSelectedCustomerPaymentsProject] = useState(null);
  const [selectedReportProjectId, setSelectedReportProjectId] = useState('');
  const [selectedProjectSummary, setSelectedProjectSummary] = useState(null);
  const [reportProjectModalOpen, setReportProjectModalOpen] = useState(false);
  const [reportDetailsModalOpen, setReportDetailsModalOpen] = useState(false);
  const [reportDetailsTab, setReportDetailsTab] = useState('ongoing');
  const [reportOverviewScope, setReportOverviewScope] = useState('ongoing');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [customerPaymentModalOpen, setCustomerPaymentModalOpen] = useState(false);
  const [expenseModalOpen, setExpenseModalOpen] = useState(false);
  const [bonusModalOpen, setBonusModalOpen] = useState(false);
  const [userSaving, setUserSaving] = useState(false);
  const [userToggleBusyId, setUserToggleBusyId] = useState('');
  const [filterPanelOpen, setFilterPanelOpen] = useState({
    users: false,
    reportFinance: false,
    reportEarnings: false,
    reportCompanyExpenses: false,
    earnings: false,
    payments: false,
    expenses: false,
    bonuses: false
  });
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [customerPaymentSaving, setCustomerPaymentSaving] = useState(false);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [bonusSaving, setBonusSaving] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [paymentDeleteBusyId, setPaymentDeleteBusyId] = useState('');
  const [customerPaymentDeleteBusyId, setCustomerPaymentDeleteBusyId] = useState('');
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
  const [earningsTabLoaded, setEarningsTabLoaded] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [paymentsTabLoaded, setPaymentsTabLoaded] = useState(false);
  const [expensesTabLoaded, setExpensesTabLoaded] = useState(false);
  const [bonusesTabLoaded, setBonusesTabLoaded] = useState(false);
  const lastRefreshRef = useRef(0);
  const skipNextExpenseProjectSearchRef = useRef(false);

  const isActive = activeTab === 'finance';
  const roleLower = String(role || '').toLowerCase();
  const canManage = roleLower === 'admin' || roleLower === 'superadmin';
  const canDelete = roleLower === 'superadmin';
  const canManageTargetUser = (targetRole) => roleLower === 'superadmin' || String(targetRole || '').toLowerCase() === 'user';

  useEffect(() => {
    const handle = setTimeout(() => {
      setUsersSearchDebounced(String(usersSearch || '').trim());
    }, 280);
    return () => clearTimeout(handle);
  }, [usersSearch]);

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

  const loadCustomerPaymentsData = async ({ reset = false } = {}) => {
    if (customerPaymentLoading && !reset) return;
    if (!reset && !customerPaymentCursor) {
      showToast('No more customer payments to load.');
      return [];
    }
    if (reset) setCustomerPaymentLoading(true);
    else setCustomerPaymentLoadMoreBusy(true);
    try {
      const data = await listCustomerPayments({
        limit: 10,
        cursor: reset ? undefined : customerPaymentCursor,
        projectId: customerPaymentFilter.projectId || undefined,
        type: customerPaymentFilter.type || undefined,
        from: toIsoStart(customerPaymentFilter.from),
        to: toIsoEnd(customerPaymentFilter.to)
      });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setCustomerPayments((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setCustomerPaymentCursor(data?.nextCursor || null);
      return nextItems;
    } catch (err) {
      showToast(err?.message || 'Failed to load customer payments.');
      return [];
    } finally {
      setCustomerPaymentLoading(false);
      setCustomerPaymentLoadMoreBusy(false);
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
      const u = await listUsers({
        limit: 10,
        cursor: reset ? undefined : usersCursor,
        q: usersSearchDebounced || undefined
      });
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
    const [usersResult, projectsResult] = await Promise.allSettled([
      loadUsers({ reset: true }),
      listProjects({ limit: 100 })
    ]);

    const nextUsers = usersResult.status === 'fulfilled' ? (usersResult.value || []) : [];
    const nextProjects = projectsResult.status === 'fulfilled'
      ? (Array.isArray(projectsResult.value?.items) ? projectsResult.value.items.filter(isActiveProject) : [])
      : [];

    if (projectsResult.status === 'fulfilled') {
      setProjects(nextProjects);
      setExpenseForm((prev) => ({ ...prev, projectId: prev.projectId || nextProjects[0]?.id || '' }));
    }
    if (usersResult.status === 'fulfilled') {
      setPaymentForm((prev) => ({ ...prev, userId: prev.userId || nextUsers[0]?.id || '' }));
      setBonusForm((prev) => ({ ...prev, userId: prev.userId || nextUsers[0]?.id || '' }));
    }
    if (usersResult.status === 'rejected' && projectsResult.status === 'rejected') {
      showToast('Failed to load admin data.');
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

  const loadCustomerPaymentsReport = async () => {
    setCustomerPaymentsReportLoading(true);
    try {
      const data = await customerPaymentsOverview({
        from: toIsoStart(reportDateFrom),
        to: toIsoEnd(reportDateTo)
      });
      setCustomerPaymentsReport(normalizeCustomerPaymentsOverview(data));
    } catch (err) {
      showToast(err?.message || 'Failed to load customer payments overview.');
    } finally {
      setCustomerPaymentsReportLoading(false);
    }
  };

  const loadCompanyExpensesReport = async (filterOverride) => {
    const filter = filterOverride || companyExpensesFilter;
    setCompanyExpensesLoading(true);
    setCompanyExpensesError('');
    try {
      const data = await companyExpensesOverview({
        year: filter?.year || undefined,
        month: filter?.month || undefined,
        quarter: filter?.quarter || undefined
      });
      const normalized = normalizeCompanyExpensesOverview(data);
      setCompanyExpensesReport(normalized);
      return normalized;
    } catch (err) {
      const message = err?.message || 'Failed to load company expenses overview.';
      setCompanyExpensesError(message);
      showToast(message);
      return null;
    } finally {
      setCompanyExpensesLoading(false);
    }
  };

  const loadReportProjects = async ({ reset = false } = {}) => {
    if (reportProjectsLoading && !reset) return;
    if (!reset && !reportProjectsCursor) return;
    if (reset) setReportProjectsLoading(true);
    else setReportProjectsLoadMoreBusy(true);
    try {
      const cursor = reset ? undefined : reportProjectsCursor;
      const searchText = String(reportSearch || '').trim() || undefined;
      const data = await listProjects({
        limit: 10,
        cursor,
        status: reportStatusFilter || undefined,
        q: searchText
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

  const ensureProjectsLoaded = async () => {
    if (projects.length) return projects;
    try {
      const prj = await listProjects({ limit: 100 });
      const nextProjects = (Array.isArray(prj?.items) ? prj.items : []).filter(isActiveProject);
      setProjects(nextProjects);
      return nextProjects;
    } catch (err) {
      showToast(err?.message || 'Failed to load projects.');
      return [];
    }
  };

  const loadExpenseProjectOptions = async ({ reset = false, queryOverride } = {}) => {
    if (reset) {
      setExpenseProjectOptionsLoading(true);
    } else {
      if (!expenseProjectHasMore || !expenseProjectCursor || expenseProjectLoadMoreBusy) return expenseProjectOptions;
      setExpenseProjectLoadMoreBusy(true);
    }
    try {
      const q = String((queryOverride ?? expenseProjectSearch) || '').trim();
      const prj = await searchProjectsForExpenses({
        limit: 7,
        cursor: reset ? undefined : expenseProjectCursor,
        q: q || undefined
      });
      const nextProjects = (Array.isArray(prj?.items) ? prj.items : []).filter(isActiveProject);
      const nextCursor = prj?.nextCursor || null;
      setExpenseProjectCursor(nextCursor);
      setExpenseProjectHasMore(Boolean(nextCursor));
      setExpenseProjectOptions((prev) => {
        const merged = reset ? nextProjects : [...prev, ...nextProjects];
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
      return nextProjects;
    } catch (err) {
      // Backward-safe fallback if new endpoint is unavailable.
      try {
        const legacy = await listProjects({
          limit: 7,
          cursor: reset ? undefined : expenseProjectCursor
        });
        const nextProjects = (Array.isArray(legacy?.items) ? legacy.items : []).filter(isActiveProject);
        const nextCursor = legacy?.nextCursor || null;
        setExpenseProjectCursor(nextCursor);
        setExpenseProjectHasMore(Boolean(nextCursor));
        setExpenseProjectOptions((prev) => {
          const merged = reset ? nextProjects : [...prev, ...nextProjects];
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
        return nextProjects;
      } catch (legacyErr) {
        showToast(legacyErr?.message || err?.message || 'Failed to load projects for expenses.');
        return [];
      }
    } finally {
      if (reset) setExpenseProjectOptionsLoading(false);
      else setExpenseProjectLoadMoreBusy(false);
    }
  };

  const ensureExpenseProjectsLoaded = async () => {
    if (expenseProjectOptions.length) return expenseProjectOptions;
    const initial = await loadExpenseProjectOptions({ reset: true, queryOverride: '' });
    return initial;
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
      if (reportTab === 'earnings') {
        loadCustomerPaymentsReport().finally(stop).catch(() => {});
      } else if (reportTab === 'companyExpenses') {
        loadCompanyExpensesReport().finally(stop).catch(() => {});
      } else {
        Promise.all([loadProjectsOverview(), loadReportProjects({ reset: true })]).finally(stop).catch(() => {});
      }
      return;
    }
    if (financeTab === 'earnings' && !earningsTabLoaded) {
      const stop = showGlobalLoader ? showGlobalLoader('Loading customer payments...', { center: true }) : () => {};
      loadCustomerPaymentsData({ reset: true }).finally(() => {
        setEarningsTabLoaded(true);
        stop();
      }).catch(() => {});
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
  }, [canManage, hasLoaded, financeTab, reportTab, expenditureTab, earningsTabLoaded, paymentsTabLoaded, expensesTabLoaded, bonusesTabLoaded]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded) return;
    if (financeTab !== 'reports') return;
    if (reportTab === 'earnings') {
      loadCustomerPaymentsReport().catch(() => {});
      return;
    }
    if (reportTab === 'companyExpenses') return;
    loadProjectsOverview().catch(() => {});
    loadReportProjects({ reset: true }).catch(() => {});
  }, [canManage, hasLoaded, financeTab, reportTab, reportStatusFilter, reportSearch, reportDateFrom, reportDateTo]);

  useEffect(() => {
    if (!isActive || !canManage || !hasLoaded) return;
    if (financeTab !== 'users') return;
    loadUsers({ reset: true }).catch(() => {});
  }, [isActive, canManage, hasLoaded, financeTab, usersSearchDebounced]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    if (financeTab === 'users') {
      loadUsers({ reset: true }).catch(() => {});
      return;
    }
    if (financeTab === 'reports') {
      if (reportTab === 'earnings') {
        loadCustomerPaymentsReport().catch(() => {});
      } else if (reportTab === 'companyExpenses') {
        loadCompanyExpensesReport().catch(() => {});
      } else {
        Promise.all([loadProjectsOverview(), loadReportProjects({ reset: true })]).catch(() => {});
      }
      return;
    }
    if (financeTab === 'earnings') {
      loadCustomerPaymentsData({ reset: true }).catch(() => {});
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
  }, [isActive, hasLoaded, refreshTick, financeTab, reportTab, expenditureTab]);

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
      setPaymentUserPickerOpen(false);
      setPaymentUserSearch('');
      setPaymentModalOpen(true);
    } finally {
      setPaymentEditBusyId('');
    }
  };

  const saveCustomerPayment = async () => {
    setCustomerPaymentSaving(true);
    try {
      const projectId = String(customerPaymentForm.projectId || '').trim();
      const amount = Number(customerPaymentForm.amount || 0);
      if (!projectId) {
        showToast('Project is required.');
        return;
      }
      if (!(amount > 0)) {
        showToast('Amount must be greater than zero.');
        return;
      }
      const body = {
        projectId,
        amount,
        type: String(customerPaymentForm.type || 'main_work'),
        paidAt: customerPaymentForm.paidAt ? new Date(customerPaymentForm.paidAt).toISOString() : undefined,
        notes: String(customerPaymentForm.notes || '').trim() || undefined
      };
      if (customerPaymentEditId) {
        await updateCustomerPayment(customerPaymentEditId, body);
      } else {
        await createCustomerPayment(body);
      }
      setCustomerPaymentForm({ projectId: '', amount: '', type: 'main_work', paidAt: '', notes: '' });
      setCustomerPaymentEditId('');
      setCustomerPaymentModalOpen(false);
      await loadCustomerPaymentsData({ reset: true });
      showToast(customerPaymentEditId ? 'Customer payment updated.' : 'Customer payment saved.');
    } catch (err) {
      showToast(err?.message || (customerPaymentEditId ? 'Customer payment update failed.' : 'Customer payment create failed.'));
    } finally {
      setCustomerPaymentSaving(false);
    }
  };

  const startEditCustomerPayment = async (item) => {
    if (!item?.id) return;
    setCustomerPaymentEditBusyId(String(item.id));
    try {
      const source = item;
      setCustomerPaymentEditId(String(source.id || ''));
      setCustomerPaymentForm({
        projectId: source?.projectId || source?.project?.id || '',
        amount: source?.amount ?? '',
        type: String(source?.type || source?.paymentType || 'main_work'),
        paidAt: toInputDateTime(source?.paidAt || source?.createdAt),
        notes: source?.notes || ''
      });
      setCustomerPaymentProjectPickerOpen(false);
      setExpenseProjectSearch('');
      setCustomerPaymentModalOpen(true);
    } finally {
      setCustomerPaymentEditBusyId('');
    }
  };

  const saveExpense = async () => {
    setExpenseSaving(true);
    try {
      const scope = expenseForm.scope || 'project';
      if (isReferralType(expenseForm.type)) {
        showToast('Referral expenses are controlled from project referral settings.');
        return;
      }
      if (scope === 'project' && !expenseForm.projectId) {
        showToast('Project is required for project scope expense.');
        return;
      }
      const body = {
        scope,
        projectId: expenseForm.projectId || null,
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
      const message = err?.message || (expenseEditId ? 'Expense update failed.' : 'Expense failed.');
      showToast(isReferralManagedErrorMessage(message) ? 'Referral expenses are controlled from project referral settings.' : message);
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
      setExpenseProjectPickerOpen(false);
      setExpenseProjectSearch('');
      setExpenseModalOpen(true);
    } finally {
      setExpenseEditBusyId('');
    }
  };

  useEffect(() => {
    if (!expenseModalOpen && !customerPaymentModalOpen) return;
    if (!expenseProjectPickerOpen && !customerPaymentProjectPickerOpen) return;
    if (skipNextExpenseProjectSearchRef.current) {
      skipNextExpenseProjectSearchRef.current = false;
      return;
    }
    const q = String(expenseProjectSearch || '').trim();
    if (!q) {
      loadExpenseProjectOptions({ reset: true }).catch(() => {});
      return undefined;
    }
    const handle = setTimeout(async () => {
      await loadExpenseProjectOptions({ reset: true });
    }, 250);
    return () => clearTimeout(handle);
  }, [expenseModalOpen, customerPaymentModalOpen, expenseProjectPickerOpen, customerPaymentProjectPickerOpen, expenseProjectSearch]);

  useEffect(() => {
    if (!expenseModalOpen) return;
    if (expenseForm.scope !== 'project') return;
    if (expenseForm.projectId) return;
    if (!expenseProjectOptions.length) return;
    setExpenseForm((prev) => ({ ...prev, projectId: prev.projectId || expenseProjectOptions[0]?.id || '' }));
  }, [expenseModalOpen, expenseForm.scope, expenseForm.projectId, expenseProjectOptions]);

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
      setBonusUserPickerOpen(false);
      setBonusUserSearch('');
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

  const onDeleteCustomerPayment = async (id) => {
    setCustomerPaymentDeleteBusyId(String(id || ''));
    try {
      await deleteCustomerPayment(id);
      await loadCustomerPaymentsData({ reset: true });
    } catch (err) {
      showToast(err?.message || 'Delete customer payment failed.');
    } finally {
      setCustomerPaymentDeleteBusyId('');
    }
  };

  const onDeleteExpense = async (id, type) => {
    if (isReferralType(type)) {
      showToast('Referral expenses are controlled from project referral settings.');
      return;
    }
    setExpenseDeleteBusyId(String(id || ''));
    try {
      await deleteExpense(id);
      await loadExpensesData({ reset: true });
    } catch (err) {
      const message = err?.message || 'Delete expense failed.';
      showToast(isReferralManagedErrorMessage(message) ? 'Referral expenses are controlled from project referral settings.' : message);
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
  const totalProjectExpenses = pickNumber(reportOverview, ['totalProjectExpenses', 'totalExpenses'], 0);
  const ongoingProjectExpenses = pickNumber(reportOverview, ['ongoingProjectExpenses', 'ongoingExpenses'], 0);
  const totalMaterialPaidByCustomers = pickNumber(reportOverview, ['totalMaterialPaidByCustomers'], 0);
  const ongoingMaterialPaidByCustomers = pickNumber(reportOverview, ['ongoingMaterialPaidByCustomers'], 0);
  const totalProjectMaterialExpensesNet = pickNumber(
    reportOverview,
    ['totalProjectMaterialExpensesNet'],
    totalProjectExpenses - totalMaterialPaidByCustomers
  );
  const ongoingProjectMaterialExpensesNet = pickNumber(
    reportOverview,
    ['ongoingProjectMaterialExpensesNet'],
    ongoingProjectExpenses - ongoingMaterialPaidByCustomers
  );
  const totalCompanyProjectRelatedExpenses = pickNumber(reportOverview, ['totalCompanyProjectRelatedExpenses'], 0);
  const ongoingCompanyProjectRelatedExpenses = pickNumber(reportOverview, ['ongoingCompanyProjectRelatedExpenses'], 0);
  const totalCompanyGeneralExpenses = pickNumber(reportOverview, ['totalCompanyGeneralExpenses'], 0);
  const ongoingCompanyGeneralExpenses = pickNumber(
    reportOverview,
    ['ongoingCompanyGeneralExpenses', 'totalCompanyGeneralExpenses'],
    totalCompanyGeneralExpenses
  );
  const ongoingCompanyGeneralExpensesCurrentMonth = pickNumber(
    reportOverview,
    ['ongoingCompanyGeneralExpensesCurrentMonth'],
    ongoingCompanyGeneralExpenses
  );
  // Summary consumed/remaining must exclude project material expenses.
  const totalConsumed = totalLaborEarnings + totalCompanyProjectRelatedExpenses + totalCompanyGeneralExpenses;
  const ongoingConsumed = ongoingLaborEarnings + ongoingCompanyProjectRelatedExpenses + ongoingCompanyGeneralExpenses;
  const totalRemainingFromQuote = totalQuoteAmount - totalConsumed;
  const ongoingRemainingFromQuote = ongoingQuoteAmount - ongoingConsumed;
  const isOngoingOverview = reportOverviewScope === 'ongoing';
  const overviewQuoteAmount = isOngoingOverview ? ongoingQuoteAmount : totalQuoteAmount;
  const overviewLaborEarnings = isOngoingOverview ? ongoingLaborEarnings : totalLaborEarnings;
  const overviewProjectExpenses = isOngoingOverview ? ongoingProjectExpenses : totalProjectExpenses;
  const overviewMaterialPaidByCustomers = isOngoingOverview ? ongoingMaterialPaidByCustomers : totalMaterialPaidByCustomers;
  const overviewProjectMaterialExpensesNet = isOngoingOverview
    ? ongoingProjectMaterialExpensesNet
    : totalProjectMaterialExpensesNet;
  const overviewCompanyProjectRelatedExpenses = isOngoingOverview
    ? ongoingCompanyProjectRelatedExpenses
    : totalCompanyProjectRelatedExpenses;
  const overviewCompanyGeneralExpenses = isOngoingOverview
    ? ongoingCompanyGeneralExpenses
    : totalCompanyGeneralExpenses;
  const overviewCompanyGeneralExpensesDisplay = isOngoingOverview
    ? ongoingCompanyGeneralExpensesCurrentMonth
    : overviewCompanyGeneralExpenses;
  const overviewConsumed = isOngoingOverview ? ongoingConsumed : totalConsumed;
  const overviewRemainingFromQuote = isOngoingOverview ? ongoingRemainingFromQuote : totalRemainingFromQuote;
  const overviewChart = buildFinanceOverviewChart(
    overviewQuoteAmount,
    overviewLaborEarnings,
    overviewProjectExpenses,
    overviewCompanyProjectRelatedExpenses,
    overviewCompanyGeneralExpenses,
    overviewRemainingFromQuote
  );

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
  const projectExpenses = Number(selectedProjectSummary?.projectExpenseTotal || 0);
  const projectMaterialPaidByCustomer = Number(selectedProjectSummary?.materialPaidAmount || 0);
  const projectMaterialExpenseNet = Number(
    selectedProjectSummary?.projectMaterialExpenseNetAfterCustomerPayments
    ?? (projectExpenses - projectMaterialPaidByCustomer)
  );
  const projectCompanyProjectRelatedExpenses = Number(selectedProjectSummary?.companyProjectRelatedExpenseTotal || 0);
  const projectConsumedTotal = projectLaborEarned + projectCompanyProjectRelatedExpenses;
  const projectLaborPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectLaborEarned / projectQuoteAmount) * 100))
    : 0;
  const projectCompanyProjectRelatedPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectCompanyProjectRelatedExpenses / projectQuoteAmount) * 100))
    : 0;
  const projectChartSpentPct = projectQuoteAmount > 0
    ? Math.min(100, Math.max(0, (projectConsumedTotal / projectQuoteAmount) * 100))
    : 0;
  const projectRemainingPct = Math.max(0, 100 - Math.min(100, projectLaborPct + projectCompanyProjectRelatedPct));
  const projectChartStyle = {
    background: `conic-gradient(var(--fin-chart-labor) 0 ${projectLaborPct}%, var(--fin-chart-company) ${projectLaborPct}% ${Math.min(100, projectLaborPct + projectCompanyProjectRelatedPct)}%, var(--fin-chart-remaining) ${Math.min(100, projectLaborPct + projectCompanyProjectRelatedPct)}% 100%)`
  };
  const projectStatusToneClass = projectStatusTone(selectedProjectSummary?.projectStatus);
  const selectedProjectWorkersCount = Number(selectedProjectSummary?.workersCount || 0);
  const selectedProjectDurationLabel = formatDurationDaysOrDash(selectedProjectSummary?.projectDurationDays);
  const selectedProjectActualStartLabel = formatDateOrDash(selectedProjectSummary?.actualStartAt);
  const selectedProjectActualEndLabel = formatDateOrDash(selectedProjectSummary?.actualEndAt);
  const selectedExpenseProject = [...expenseProjectOptions, ...projects]
    .find((project) => String(project?.id || '') === String(expenseForm.projectId || ''));
  const selectedCustomerPaymentProject = [...expenseProjectOptions, ...projects]
    .find((project) => String(project?.id || '') === String(customerPaymentForm.projectId || ''));
  const selectedPaymentUser = users.find((user) => String(user?.id || '') === String(paymentForm.userId || ''));
  const selectedBonusUser = users.find((user) => String(user?.id || '') === String(bonusForm.userId || ''));
  const paymentUserFilterText = String(paymentUserSearch || '').trim().toLowerCase();
  const bonusUserFilterText = String(bonusUserSearch || '').trim().toLowerCase();
  const paymentUserOptions = users.filter((user) => {
    if (!paymentUserFilterText) return true;
    const text = `${user?.name || ''} ${user?.surname || ''} ${user?.email || ''}`.toLowerCase();
    return text.includes(paymentUserFilterText);
  });
  const bonusUserOptions = users.filter((user) => {
    if (!bonusUserFilterText) return true;
    const text = `${user?.name || ''} ${user?.surname || ''} ${user?.email || ''}`.toLowerCase();
    return text.includes(bonusUserFilterText);
  });
  const selectedPaymentUserLabel = selectedPaymentUser ? financeUserOptionLabel(selectedPaymentUser) : '';
  const selectedBonusUserLabel = selectedBonusUser ? financeUserOptionLabel(selectedBonusUser) : '';
  const selectedExpenseProjectLabel = expenseForm.projectId && selectedExpenseProject
    ? `[${projectStatusLabel(selectedExpenseProject?.status)}] ${projectOptionLabel(selectedExpenseProject)}`
    : (expenseForm.scope === 'company' ? 'No project (optional)' : '');
  const expenseEditIsReferral = Boolean(expenseEditId) && isReferralType(expenseForm.type);
  const selectedCustomerPaymentProjectLabel = selectedCustomerPaymentProject
    ? `[${projectStatusLabel(selectedCustomerPaymentProject?.status)}] ${projectOptionLabel(selectedCustomerPaymentProject)}`
    : '';
  const customerPaymentsTotals = customerPaymentsReport || {
    ongoingProjectsCount: 0,
    totalQuoteAmount: 0,
    totalPaidAmount: 0,
    totalRemainingAmount: 0,
    totalOverpaidAmount: 0,
    chart: { paidAmount: 0, remainingAmount: 0 },
    projects: []
  };
  const companyExpensesCurrentYear = new Date().getFullYear();
  const companyExpensesYearOptions = Array.from({ length: 6 }, (_, index) => companyExpensesCurrentYear - index);
  const companyExpensesData = companyExpensesReport || normalizeCompanyExpensesOverview(null);
  const companyExpensesLaborChart = buildBreakdownChart(companyExpensesData.laborBreakdown, COMPANY_EXPENSES_LABOR_COLORS);
  const companyExpensesCategoryChart = buildBreakdownChart(companyExpensesData.expenseCategoryBreakdown, COMPANY_EXPENSES_CATEGORY_COLORS);
  const companyExpensesSummary = companyExpensesData.summary;
  const companyExpensesRangeLabel = companyExpensesData.range?.label || 'Current year';
  const companyExpensesHasLabor = companyExpensesData.laborBreakdown.some((item) => Number(item.amount || 0) > 0);
  const companyExpensesHasCategories = companyExpensesData.expenseCategoryBreakdown.some((item) => Number(item.amount || 0) > 0);
  const companyExpensesHasAnyData = Number(companyExpensesSummary.totalCombinedCost || 0) > 0 || companyExpensesHasLabor || companyExpensesHasCategories;
  const customerPaymentsChart = buildPaidPendingChart(
    customerPaymentsTotals?.chart?.paidAmount,
    customerPaymentsTotals?.chart?.remainingAmount
  );
  const selectedCustomerProjectPaidChart = buildPaidPendingChart(
    selectedCustomerPaymentsProject?.mainWorkPaidAmount ?? selectedCustomerPaymentsProject?.paidAmount,
    selectedCustomerPaymentsProject?.remainingAmountForPie
  );
  const selectedCustomerFullName = [selectedCustomerPaymentsProject?.customerName, selectedCustomerPaymentsProject?.customerSurname]
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    || '-';
  const renderFilterPanel = (key, content) => (
    <div className="fin-filter-section">
      <button
        type="button"
        className={`ghost btn-tone-neutral fin-filter-toggle${filterPanelOpen[key] ? ' open' : ''}`}
        onClick={() => setFilterPanelOpen((prev) => ({ ...prev, [key]: !prev[key] }))}
      >
        <span>Filters</span>
        <FiChevronDown className={`fin-filter-chevron${filterPanelOpen[key] ? ' open' : ''}`} />
      </button>
      <div className={`fin-filter-collapse${filterPanelOpen[key] ? ' open' : ''}`}>
        <div className="fin-filter-collapse-inner">
          {content}
        </div>
      </div>
    </div>
  );

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
            className={`fin-tab${financeTab === 'earnings' ? ' active' : ''}`}
            data-mode="employees"
            onClick={() => setFinanceTab('earnings')}
          >
            Earnings
          </button>
          <button
            type="button"
            className={`fin-tab${financeTab === 'expenditure' ? ' active' : ''}`}
            data-mode="projects"
            onClick={() => setFinanceTab('expenditure')}
          >
            Expenditure
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
          {renderFilterPanel('users', (
            <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
            <label className="payments-filter-field">
              <span>Search</span>
              <input
                placeholder="Search by name and surname"
                value={usersSearch}
                onChange={(e) => setUsersSearch(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="ghost btn-tone-neutral payments-reset-btn"
              onClick={() => setUsersSearch('')}
            >
              Reset
            </button>
            </div>
          ))}
          <div className="fin-tx-list fin-users-admin-list">
            {users.map((user) => (
              <div className={`fin-tx-item fin-user-admin-item${user.isActive ? '' : ' inactive'}`} key={user.id}>
                <div className="fin-tx-main">
                  <span className={`fin-tx-label${user.isActive ? '' : ' inactive'}`}><strong>{user.name} {user.surname}</strong></span>
                  <div className={`fin-user-meta${user.isActive ? '' : ' inactive'}`}>
                    <span className="fin-user-chip email">{`Email: ${user.email || '-'}`}</span>
                    <span className="fin-user-chip role">{`Role: ${user.role || '-'}`}</span>
                    <span className="fin-user-chip method">{`Payment Type: ${String(user?.paymentMethod || user?.paymentOption || '-')}`}</span>
                    <span className="fin-user-chip rate">{`Pay Rate: ${formatUserPaymentRateLabel(user)}`}</span>
                    <span className="fin-user-chip start">
                      {`Start Date: ${user?.startDate || user?.firstEntryAt ? new Date(user.startDate || user.firstEntryAt).toLocaleDateString() : '-'}`}
                    </span>
                    <span className={`fin-user-chip status ${user?.isActive ? 'active' : 'inactive'}`}>
                      {`Status: ${user?.isActive ? 'active' : 'inactive'}`}
                    </span>
                  </div>
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
              <h3>{
                reportTab === 'earnings'
                  ? 'Customer Payments Overview'
                  : reportTab === 'companyExpenses'
                    ? 'Company Expenses'
                    : 'Project Finance Overview'
              }</h3>
            </div>
            <div className="row" style={{ gap: 8 }}>
              {reportTab === 'finance' ? (
                <>
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
                </>
              ) : reportTab === 'companyExpenses' ? (
                <>
                  <div className="pill">{companyExpensesRangeLabel}</div>
                  <div className="pill">Workers: {companyExpensesSummary.laborWorkersCount}</div>
                  <div className="pill">Expenses: {companyExpensesSummary.expenseItemsCount}</div>
                </>
              ) : (
                <>
                  <div className="pill">Ongoing: {Number(customerPaymentsTotals?.ongoingProjectsCount || 0)}</div>
                  <div className="pill">Quote: {money(customerPaymentsTotals?.totalQuoteAmount)}</div>
                </>
              )}
            </div>
          </div>

          <div className="fin-tabs finance-sub-tabs" style={{ marginBottom: 10 }}>
            <button
              type="button"
              className={`fin-tab${reportTab === 'finance' ? ' active' : ''}`}
              onClick={() => setReportTab('finance')}
            >
              Finance
            </button>
            <button
              type="button"
              className={`fin-tab${reportTab === 'earnings' ? ' active' : ''}`}
              onClick={() => setReportTab('earnings')}
            >
              Earnings
            </button>
            <button
              type="button"
              className={`fin-tab${reportTab === 'companyExpenses' ? ' active' : ''}`}
              onClick={() => setReportTab('companyExpenses')}
            >
              Company Expenses
            </button>
          </div>

          {reportTab === 'finance' ? (
            <>
              <div className="fin-tabs finance-sub-tabs finance-overview-scope-tabs" style={{ marginBottom: 10 }}>
                <button
                  type="button"
                  className={`fin-tab${reportOverviewScope === 'ongoing' ? ' active' : ''}`}
                  onClick={() => setReportOverviewScope('ongoing')}
                >
                  Ongoing Projects
                </button>
                <button
                  type="button"
                  className={`fin-tab${reportOverviewScope === 'all' ? ' active' : ''}`}
                  onClick={() => setReportOverviewScope('all')}
                >
                  All Projects
                </button>
              </div>
              <div className="fin-report-overview-card">
            <div className="fin-report-donut-wrap">
              <div className="fin-report-donut" style={overviewChart.chartStyle}>
                {donutSegmentMarkers([
                  { label: 'Labor', pct: overviewChart.laborPct },
                  { label: 'Company', pct: overviewChart.companyProjectRelatedPct },
                  { label: 'Owned', pct: overviewChart.companyOwnedPct },
                  { label: 'Remain', pct: overviewChart.remainingPct }
                ]).map((marker) => (
                  <span
                    key={`overview-${marker.key}`}
                    className="fin-donut-marker"
                    style={{
                      left: `${50 + (marker.x * 45)}%`,
                      top: `${50 + (marker.y * 45)}%`
                    }}
                    title={`${marker.label}: ${marker.pct.toFixed(1)}%`}
                  >
                    {marker.pct.toFixed(1)}%
                  </span>
                ))}
                <div className="fin-report-donut-center">
                  <strong>{overviewChart.consumedPct.toFixed(1)}%</strong>
                  <small>Consumed</small>
                </div>
              </div>
            </div>
            <div className="fin-report-overview-meta">
              <div className="fin-project-summary-group">
                <div className="fin-project-summary-row">
                  <span className="dot labor" />
                  <span className="fin-row-label-inline">
                    <span>Labor Used</span>
                    <PctBadge value={overviewChart.laborPct} />
                  </span>
                  <strong>{money(overviewLaborEarnings)}</strong>
                </div>
                <div className="fin-project-summary-row">
                  <span className="dot agreed" />
                  <span className="fin-row-label-inline">
                    <span>Company Expenses (Project-Related)</span>
                    <PctBadge value={overviewChart.companyProjectRelatedPct} />
                  </span>
                  <strong>{money(overviewCompanyProjectRelatedExpenses)}</strong>
                </div>
                <div className="fin-project-summary-row">
                  <span className="dot company-owned" />
                  <span className="fin-row-label-with-pct">
                    <span className="fin-row-label-inline">
                      <span>Company-Owned Expenses (Non-Project)</span>
                      <PctBadge value={overviewChart.companyOwnedPct} />
                    </span>
                    {isOngoingOverview ? <small className="muted" style={{ display: 'block' }}>Current month (America/Chicago)</small> : null}
                  </span>
                  <strong>{money(overviewCompanyGeneralExpensesDisplay)}</strong>
                </div>
                <div className="fin-project-summary-row">
                  <span className="dot remaining" />
                  <span className="fin-row-label-inline">
                    <span>Remaining Balance</span>
                    <PctBadge value={overviewChart.remainingPct} mode="remaining" />
                  </span>
                  <strong>{money(overviewRemainingFromQuote)}</strong>
                </div>
              </div>
              <div className="fin-project-summary-group fin-project-summary-group-extra">
                {isOngoingOverview ? (
                  <div className="fin-project-summary-row">
                    <span className="row-icon consumed" aria-hidden="true"><FiDollarSign /></span>
                    <span className="with-icon-label">Ongoing Quote Amount</span>
                    <strong>{money(overviewQuoteAmount)}</strong>
                  </div>
                ) : null}
                <div className="fin-project-summary-row">
                  <span className="row-icon consumed" aria-hidden="true"><FiTrendingUp /></span>
                  <span className="with-icon-label">{isOngoingOverview ? 'Consumed (All Company Expenses)' : 'Consumed'}</span>
                  <strong>{money(overviewConsumed)}</strong>
                </div>
                <div className="fin-project-summary-row-group material-group">
                  <div className="fin-project-summary-row">
                    <span className="row-icon material" aria-hidden="true"><FiPlusCircle /></span>
                    <span className="with-icon-label">Project Material Expenses</span>
                    <strong>{money(overviewProjectExpenses)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot material-paid" />
                    <span>Material Paid by Customer</span>
                    <strong>{money(overviewMaterialPaidByCustomers)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot material-net" />
                    <span>Net Material Expense</span>
                    <strong>{money(overviewProjectMaterialExpensesNet)}</strong>
                  </div>
                </div>
                <div className={`fin-report-health ${overviewChart.tone}`}>
                  {overviewChart.overrun > 0
                    ? `Over quote by ${money(overviewChart.overrun)}`
                    : `Consumed ${overviewChart.consumedPct.toFixed(1)}% of agreed value`}
                </div>
              </div>
            </div>
              </div>

              {renderFilterPanel('reportFinance', (
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
              ))}

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

              <div id="prjList" style={{ marginTop: 12 }}>
            {reportProjects.map((project) => (
              <div
                key={project.id}
                className={`prj-item${selectedReportProjectId === String(project.id) ? ' active' : ''}`}
                data-status={projectCardTone(project?.status)}
              >
                <div className="prj-row1">
                  <div className="prj-title">{project.description || project.address?.raw || project.id}</div>
                  <div className="prj-status-inline">
                    <span className={`pill ${projectCardTone(project?.status)}`}>{projectStatusLabel(project?.status)}</span>
                  </div>
                </div>
                <div className="prj-time">
                  {formatAddressText(project?.address) ? (
                    <div className="address-link">
                      <span className="prj-time-muted address-link-text">{formatAddressText(project?.address)}</span>
                      <a
                        className="address-link-icon-btn"
                        href={buildDirectionsHref(formatAddressText(project?.address))}
                        target="_blank"
                        rel="noreferrer"
                        aria-label={`Open directions for ${formatAddressText(project?.address)}`}
                        title="Open directions"
                      >
                        <FiNavigation />
                      </a>
                    </div>
                  ) : <span className="prj-time-muted">-</span>}
                </div>
                <div className="prj-client-block">
                  <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                    <div className="prj-client-line" style={{ margin: 0, flex: '1 1 auto', minWidth: 0 }}>
                      <strong>Customer:</strong>{' '}
                      {String(project?.customer?.fullName || '').trim()
                        || [project?.customer?.name, project?.customer?.surname].map((part) => String(part || '').trim()).filter(Boolean).join(' ')
                        || '-'}
                    </div>
                    <div className="prj-amount">{money(project.quoteAmount)}</div>
                  </div>
                  <div className="row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
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
                </div>
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
            </>
          ) : reportTab === 'companyExpenses' ? (
            <>
              {renderFilterPanel('reportCompanyExpenses', (
                <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
                  <label className="payments-filter-field">
                    <span>Year</span>
                    <select
                      value={companyExpensesFilter.year}
                      onChange={(e) => setCompanyExpensesFilter((prev) => ({ ...prev, year: Number(e.target.value) || companyExpensesCurrentYear }))}
                    >
                      {companyExpensesYearOptions.map((year) => (
                        <option key={year} value={year}>{year}</option>
                      ))}
                    </select>
                  </label>
                  <label className="payments-filter-field">
                    <span>Month</span>
                    <select
                      value={companyExpensesFilter.month}
                      onChange={(e) => setCompanyExpensesFilter((prev) => ({ ...prev, month: e.target.value, quarter: '' }))}
                      disabled={Boolean(companyExpensesFilter.quarter)}
                    >
                      <option value="">All months</option>
                      <option value="1">January</option>
                      <option value="2">February</option>
                      <option value="3">March</option>
                      <option value="4">April</option>
                      <option value="5">May</option>
                      <option value="6">June</option>
                      <option value="7">July</option>
                      <option value="8">August</option>
                      <option value="9">September</option>
                      <option value="10">October</option>
                      <option value="11">November</option>
                      <option value="12">December</option>
                    </select>
                  </label>
                  <label className="payments-filter-field">
                    <span>Quarter</span>
                    <select
                      value={companyExpensesFilter.quarter}
                      onChange={(e) => setCompanyExpensesFilter((prev) => ({ ...prev, quarter: e.target.value, month: '' }))}
                      disabled={Boolean(companyExpensesFilter.month)}
                    >
                      <option value="">All quarters</option>
                      <option value="1">Q1</option>
                      <option value="2">Q2</option>
                      <option value="3">Q3</option>
                      <option value="4">Q4</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="ghost btn-tone-neutral payments-reset-btn"
                    onClick={() => setCompanyExpensesFilter(createDefaultCompanyExpensesFilter())}
                  >
                    Reset
                  </button>
                  <button
                    type="button"
                    className="ghost btn-tone-primary"
                    onClick={() => loadCompanyExpensesReport()}
                    disabled={companyExpensesLoading}
                  >
                    Apply
                  </button>
                </div>
              ))}

              <div className="home-stat-grid fin-report-overall-metrics fin-company-expenses-summary-grid" style={{ marginBottom: 12 }}>
                <div className="home-metric tone-labor">
                  <span className="home-metric-label">Total Labor</span>
                  <span className="home-metric-value">{money(companyExpensesSummary.totalLaborCost)}</span>
                </div>
                <div className="home-metric tone-expense">
                  <span className="home-metric-label">Total Other Expenses</span>
                  <span className="home-metric-value">{money(companyExpensesSummary.totalOtherCompanyExpenses)}</span>
                </div>
                <div className="home-metric tone-consumed">
                  <span className="home-metric-label">Total Combined Cost</span>
                  <span className="home-metric-value">{money(companyExpensesSummary.totalCombinedCost)}</span>
                </div>
              </div>

              {companyExpensesLoading ? (
                <div className="muted">Loading company expenses...</div>
              ) : companyExpensesError ? (
                <div className="fin-report-health danger">{companyExpensesError}</div>
              ) : !companyExpensesHasAnyData ? (
                <div className="muted">No company expense data found for this range.</div>
              ) : (
                <>
                  <div className="fin-company-expenses-grid">
                    <div className="fin-report-overview-card fin-company-expenses-card">
                      <div className="fin-report-donut-wrap">
                        <div className="fin-report-donut" style={companyExpensesLaborChart.chartStyle}>
                          {donutSegmentMarkers(companyExpensesLaborChart.segments.map((item) => ({ label: item.name, pct: item.pct })), 7).map((marker) => (
                            <span
                              key={`company-labor-${marker.key}`}
                              className={`fin-donut-marker fin-company-donut-marker${marker.x >= 0 ? ' is-right' : ' is-left'}`}
                              style={companyDonutMarkerStyle(
                                marker,
                                companyExpensesLaborChart.segments.find((item) => item.name === marker.label)?.color || COMPANY_EXPENSES_LABOR_COLORS[0]
                              )}
                              title={`${marker.label}: ${marker.pct.toFixed(1)}%`}
                            >
                              <strong>{marker.label}</strong>
                              <small>{marker.pct.toFixed(1)}%</small>
                            </span>
                          ))}
                          <div className="fin-report-donut-center">
                            <strong>{companyExpensesSummary.laborWorkersCount}</strong>
                            <small>Workers</small>
                          </div>
                        </div>
                      </div>
                      <div className="fin-report-overview-meta">
                        <div className="fin-project-summary-group">
                          <div className="fin-project-summary-row">
                            <span className="dot labor" />
                            <span>Labor by worker</span>
                            <strong>{money(companyExpensesSummary.totalLaborCost)}</strong>
                          </div>
                          <div className="fin-project-summary-row">
                            <span className="dot agreed" />
                            <span>Entries</span>
                            <strong>{companyExpensesData.laborBreakdown.reduce((sum, item) => sum + Number(item.entriesCount || 0), 0)}</strong>
                          </div>
                        </div>
                        <div className="fin-project-summary-group fin-project-summary-group-extra">
                          {companyExpensesHasLabor ? companyExpensesData.laborBreakdown.map((item, index) => (
                            <div key={item.userId || `${item.name}-${index}`} className="fin-project-summary-row">
                              <span className="dot" style={{ background: companyExpensesLaborChart.segments[index]?.color || COMPANY_EXPENSES_LABOR_COLORS[index % COMPANY_EXPENSES_LABOR_COLORS.length] }} />
                              <span className="fin-company-expenses-list-label">
                                <span>{item.name}</span>
                                <small>{`${Number(item.hoursWorked || (Number(item.minutesWorked || 0) / 60)).toFixed(2)} hrs | ${item.entriesCount} entries`}</small>
                              </span>
                              <strong>{`${money(item.amount)} | ${Number(companyExpensesLaborChart.segments[index]?.pct || item.percentage || 0).toFixed(1)}%`}</strong>
                            </div>
                          )) : <div className="muted">No labor items for this range.</div>}
                        </div>
                      </div>
                    </div>

                    <div className="fin-report-overview-card fin-company-expenses-card">
                      <div className="fin-report-donut-wrap">
                        <div className="fin-report-donut" style={companyExpensesCategoryChart.chartStyle}>
                          {donutSegmentMarkers(companyExpensesCategoryChart.segments.map((item) => ({ label: item.label, pct: item.pct })), 7).map((marker) => (
                            <span
                              key={`company-category-${marker.key}`}
                              className={`fin-donut-marker fin-company-donut-marker${marker.x >= 0 ? ' is-right' : ' is-left'}`}
                              style={companyDonutMarkerStyle(
                                marker,
                                companyExpensesCategoryChart.segments.find((item) => item.label === marker.label)?.color || COMPANY_EXPENSES_CATEGORY_COLORS[0]
                              )}
                              title={`${marker.label}: ${marker.pct.toFixed(1)}%`}
                            >
                              <strong>{marker.label}</strong>
                              <small>{marker.pct.toFixed(1)}%</small>
                            </span>
                          ))}
                          <div className="fin-report-donut-center">
                            <strong>{companyExpensesData.expenseCategoryBreakdown.length}</strong>
                            <small>Categories</small>
                          </div>
                        </div>
                      </div>
                      <div className="fin-report-overview-meta">
                        <div className="fin-project-summary-group">
                          <div className="fin-project-summary-row">
                            <span className="dot expense" />
                            <span>Other company expenses by category</span>
                            <strong>{money(companyExpensesSummary.totalOtherCompanyExpenses)}</strong>
                          </div>
                          <div className="fin-project-summary-row">
                            <span className="dot company-owned" />
                            <span>Expense items</span>
                            <strong>{companyExpensesSummary.expenseItemsCount}</strong>
                          </div>
                        </div>
                        <div className="fin-project-summary-group fin-project-summary-group-extra">
                          {companyExpensesHasCategories ? companyExpensesData.expenseCategoryBreakdown.map((item, index) => (
                            <div key={item.category || `${item.label}-${index}`} className="fin-project-summary-row">
                              <span className="dot" style={{ background: companyExpensesCategoryChart.segments[index]?.color || COMPANY_EXPENSES_CATEGORY_COLORS[index % COMPANY_EXPENSES_CATEGORY_COLORS.length] }} />
                              <span className="fin-company-expenses-list-label">
                                <span>{item.label}</span>
                                <small>{`${item.count} items`}</small>
                              </span>
                              <strong>{`${money(item.amount)} | ${Number(companyExpensesCategoryChart.segments[index]?.pct || item.percentage || 0).toFixed(1)}%`}</strong>
                            </div>
                          )) : <div className="muted">No expense categories for this range.</div>}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="fin-company-expenses-scope-grid">
                    <div className="fin-company-expenses-scope-card">
                      <div className="eyebrow">Expense Scope</div>
                      <div className="fin-company-expenses-scope-row">
                        <span>Company General</span>
                        <strong>{money(companyExpensesData.expenseScopeBreakdown.companyGeneral.amount)}</strong>
                        <small>{`${companyExpensesData.expenseScopeBreakdown.companyGeneral.count} items`}</small>
                      </div>
                      <div className="fin-company-expenses-scope-row">
                        <span>Company Project Related</span>
                        <strong>{money(companyExpensesData.expenseScopeBreakdown.companyProjectRelated.amount)}</strong>
                        <small>{`${companyExpensesData.expenseScopeBreakdown.companyProjectRelated.count} items`}</small>
                      </div>
                    </div>
                    <div className="fin-company-expenses-scope-card">
                      <div className="eyebrow">Range</div>
                      <div className="fin-company-expenses-range-copy">
                        <strong>{companyExpensesRangeLabel}</strong>
                        <small>{companyExpensesData.range?.timeZone || 'Time zone not provided'}</small>
                        <small>{companyExpensesData.range?.from && companyExpensesData.range?.to ? `${companyExpensesData.range.from} to ${companyExpensesData.range.to}` : 'Range dates unavailable'}</small>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="fin-report-overview-card">
                <div className="fin-report-donut-wrap">
                  <div className="fin-report-donut" style={customerPaymentsChart.chartStyle}>
                    {donutSegmentMarkers([
                      { label: 'Paid', pct: customerPaymentsChart.paidPct },
                      { label: 'Pending', pct: customerPaymentsChart.pendingPct }
                    ]).map((marker) => (
                      <span
                        key={`cust-overview-${marker.key}`}
                        className="fin-donut-marker"
                        style={{
                          left: `${50 + (marker.x * 45)}%`,
                          top: `${50 + (marker.y * 45)}%`
                        }}
                        title={`${marker.label}: ${marker.pct.toFixed(1)}%`}
                      >
                        {marker.pct.toFixed(1)}%
                      </span>
                    ))}
                    <div className="fin-report-donut-center">
                      <strong>{customerPaymentsChart.paidPct.toFixed(1)}%</strong>
                      <small>Paid</small>
                    </div>
                  </div>
                </div>
                <div className="fin-report-overview-meta">
                  <div className="fin-project-summary-group">
                    <div className="fin-project-summary-row">
                      <span className="dot paid" />
                      <span>{`Paid (Main Work) (${customerPaymentsChart.paidPct.toFixed(1)}%)`}</span>
                      <strong>{money(customerPaymentsTotals?.totalMainWorkPaidAmount ?? customerPaymentsTotals?.totalPaidAmount)}</strong>
                    </div>
                    <div className="fin-project-summary-row">
                      <span className="dot pending" />
                      <span>{`Pending (${customerPaymentsChart.pendingPct.toFixed(1)}%)`}</span>
                      <strong>{money(customerPaymentsTotals?.totalRemainingAmount)}</strong>
                    </div>
                    <div className="fin-project-summary-row">
                      <span className="row-icon quote" aria-hidden="true"><FiPlusCircle /></span>
                      <span>Total Quote</span>
                      <strong>{money(customerPaymentsTotals?.totalQuoteAmount)}</strong>
                    </div>
                  </div>
                  <div className="fin-project-summary-group fin-project-summary-group-extra">
                    <div className="fin-project-summary-row">
                      <span className="row-icon overpaid" aria-hidden="true"><FiTrendingUp /></span>
                      <span>Overpaid</span>
                      <strong>{money(customerPaymentsTotals?.totalOverpaidAmount)}</strong>
                    </div>
                    <div className="fin-project-summary-row">
                      <span className="row-icon material" aria-hidden="true"><FiPlusCircle /></span>
                      <span className="with-icon-label">Material/Other Payments</span>
                      <strong>{money(
                        Number(customerPaymentsTotals?.chart?.materialPaidAmount || 0)
                        + Number(customerPaymentsTotals?.chart?.otherPaidAmount || 0)
                        + Number(customerPaymentsTotals?.chart?.unknownPaidAmount || 0)
                      )}</strong>
                    </div>
                  </div>
                </div>
              </div>

              {renderFilterPanel('reportEarnings', (
                <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
                <label className="payments-filter-field">
                  <span>From</span>
                  <input type="date" value={reportDateFrom} onChange={(e) => setReportDateFrom(e.target.value)} />
                </label>
                <label className="payments-filter-field">
                  <span>To</span>
                  <input type="date" value={reportDateTo} onChange={(e) => setReportDateTo(e.target.value)} />
                </label>
                <button
                  type="button"
                  className="ghost btn-tone-neutral payments-reset-btn"
                  onClick={() => {
                    setReportDateFrom('');
                    setReportDateTo('');
                  }}
                >
                  Reset
                </button>
                <button
                  type="button"
                  className="ghost btn-tone-primary"
                  onClick={() => loadCustomerPaymentsReport()}
                >
                  Apply
                </button>
                </div>
              ))}

              <div className="fin-tx-list" style={{ marginTop: 12 }}>
                {(customerPaymentsTotals?.projects || []).map((project) => (
                  <div
                    key={project.projectId || `${project.projectDescription}-${project.customerName}`}
                    className="fin-tx-item fin-report-earning-item"
                  >
                    <div className="fin-tx-main">
                      <span className="fin-tx-label">{project.projectDescription || project.projectId || '-'}</span>
                      <div className="fin-earning-meta">
                        <span className="fin-earning-chip customer">
                          {`Customer: ${[project.customerName, project.customerSurname].filter(Boolean).join(' ') || '-'}`}
                        </span>
                        <span className="fin-earning-chip address">
                          {`Address: ${project.projectAddress || '-'}`}
                        </span>
                      </div>
                    </div>
                    <div className="fin-earnings-amounts">
                      <span className="fin-earning-amount paid">Main Work Paid {money(project.mainWorkPaidAmount ?? project.paidAmount)}</span>
                      <span className="fin-earning-amount pending">Pending {money(project.remainingAmount)}</span>
                      <span className="fin-earning-amount">Material {money(project.materialPaidAmount)}</span>
                      <span className="fin-earning-amount">Other {money(project.otherPaidAmount)}</span>
                      <span className="fin-earning-amount">Unknown {money(project.unknownPaidAmount)}</span>
                      <span className="fin-earning-amount">Non-Main {money(project.nonMainWorkPaidAmount)}</span>
                    </div>
                    <button
                      type="button"
                      className="ghost btn-tone-info"
                      onClick={() => {
                        setSelectedCustomerPaymentsProject(project);
                        setCustomerPaymentsProjectModalOpen(true);
                      }}
                    >
                      View Summary
                    </button>
                  </div>
                ))}
                {!customerPaymentsReportLoading && !(customerPaymentsTotals?.projects || []).length ? (
                  <div className="muted">No projects found.</div>
                ) : null}
              </div>
            </>
          )}

        </div>
      ) : null}

      {financeTab === 'earnings' ? (
        <div className="section card">
          <h3>Customer Payments</h3>
          <div className="page-actions">
            <button
              type="button"
              className="ghost finance-create-cta finance-create-cta-payment"
              onClick={() => {
                setCustomerPaymentEditId('');
                setCustomerPaymentProjectPickerOpen(false);
                setExpenseProjectSearch('');
                setCustomerPaymentForm({ projectId: '', amount: '', type: 'main_work', paidAt: '', notes: '' });
                setCustomerPaymentModalOpen(true);
              }}
            >
              <FiPlusCircle />
              <span className="finance-create-cta-text">
                <strong>Add Customer Payment</strong>
                <small>Record customer receipt linked to a project</small>
              </span>
            </button>
          </div>

          {renderFilterPanel('earnings', (
            <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
            <label className="payments-filter-field">
              <span>Project</span>
              <select value={customerPaymentFilter.projectId} onChange={(e) => setCustomerPaymentFilter((prev) => ({ ...prev, projectId: e.target.value }))}>
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {projectOptionLabel(project)}
                  </option>
                ))}
              </select>
            </label>
            <label className="payments-filter-field">
              <span>Type</span>
              <select value={customerPaymentFilter.type} onChange={(e) => setCustomerPaymentFilter((prev) => ({ ...prev, type: e.target.value }))}>
                <option value="">All types</option>
                <option value="main_work">Main Work</option>
                <option value="material">Material</option>
                <option value="other">Other</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
            <label className="payments-filter-field">
              <span>From</span>
              <input type="date" value={customerPaymentFilter.from} onChange={(e) => setCustomerPaymentFilter((prev) => ({ ...prev, from: e.target.value }))} />
            </label>
            <label className="payments-filter-field">
              <span>To</span>
              <input type="date" value={customerPaymentFilter.to} onChange={(e) => setCustomerPaymentFilter((prev) => ({ ...prev, to: e.target.value }))} />
            </label>
            <button type="button" className="ghost btn-tone-neutral payments-reset-btn" onClick={() => {
              setCustomerPaymentFilter({ projectId: '', type: '', from: '', to: '' });
            }}>Reset</button>
            <button type="button" className="ghost btn-tone-primary" onClick={() => loadCustomerPaymentsData({ reset: true })}>Apply</button>
            </div>
          ))}

          <div className="fin-tx-list">
            {customerPayments.map((item) => {
              const fullName = String(item?.customer?.fullName || '').trim();
              const fallbackNameParts = fullName ? fullName.split(/\s+/) : [];
              const customerName = String(item?.customerFirstName || item?.customer?.name || fallbackNameParts[0] || '').trim();
              const customerSurname = String(item?.customerSurname || item?.customer?.surname || fallbackNameParts.slice(1).join(' ') || '').trim();
              const customerLabel = [customerName, customerSurname].filter(Boolean).join(' ') || '-';
              const projectDescription = String(item?.project?.description || '-').trim() || '-';
              const projectAddress = String(item?.project?.address?.raw || item?.project?.address?.normalized || '-').trim() || '-';
              const noteText = String(item?.notes || '-').trim() || '-';
              return (
                <div key={item.id} className="fin-tx-item">
                  <div className="fin-tx-main">
                    <span className="fin-tx-label">{projectDescription}</span>
                    <div className="fin-cpayment-meta">
                      <span className="fin-cpayment-chip customer">{`Customer: ${customerLabel}`}</span>
                      <span className="fin-cpayment-chip address">{`Address: ${projectAddress}`}</span>
                      <span className="fin-cpayment-chip type">{`Type: ${formatCustomerPaymentTypeLabel(item)}`}</span>
                      <span className="fin-cpayment-chip note">{`Note: ${noteText}`}</span>
                    </div>
                  </div>
                  <span className="fin-tx-amount fin-payment-amount positive">${Number(item?.amount || 0).toFixed(2)}</span>
                  <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      type="button"
                      className="ghost btn-tone-info btn-with-spinner"
                      onClick={() => startEditCustomerPayment(item)}
                      disabled={customerPaymentEditBusyId === String(item.id)}
                    >
                      {customerPaymentEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{customerPaymentEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                    </button>
                    <button
                      type="button"
                      className="ghost btn-tone-danger btn-with-spinner"
                      onClick={() => onDeleteCustomerPayment(item.id)}
                      disabled={customerPaymentDeleteBusyId === String(item.id)}
                    >
                      {customerPaymentDeleteBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                      <span>{customerPaymentDeleteBusyId === String(item.id) ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
            {!customerPaymentLoading && !customerPayments.length ? <div className="muted">No customer payments found.</div> : null}
          </div>
          {!customerPaymentLoading && customerPaymentCursor ? (
            <div className="fin-list-footer">
              <button
                type="button"
                className="ghost btn-tone-neutral btn-with-spinner fin-list-more-btn"
                onClick={() => loadCustomerPaymentsData()}
                disabled={customerPaymentLoadMoreBusy}
              >
                {customerPaymentLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
                <span>{customerPaymentLoadMoreBusy ? 'Loading...' : 'Load more'}</span>
              </button>
            </div>
          ) : null}
          {customerPaymentLoading && !customerPayments.length ? <div className="muted">Loading customer payments...</div> : null}
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
                    setPaymentUserPickerOpen(false);
                    setPaymentUserSearch('');
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
              {renderFilterPanel('payments', (
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
              ))}
              <div className="fin-tx-list">
                {payments.map((item) => {
                  const matchedUser = users.find((u) => String(u?.id || '') === String(item?.userId || '')) || null;
                  const userRecord = item?.user || matchedUser || {};
                  const userFullName = item?.user?.name
                    ? `${item.user.name} ${item.user?.surname || ''}`.trim()
                    : (matchedUser?.name
                      ? `${matchedUser.name || ''} ${matchedUser.surname || ''}`.trim()
                      : String(item?.userId || '-'));
                  const paymentLabelFromApi = String(item?.userPaymentAmountLabel || userRecord?.paymentAmountLabel || '').trim();
                  const paymentOption = String(item?.userPaymentOption || userRecord?.paymentOption || '').toLowerCase();
                  const paymentAmount = Number(item?.userPaymentAmount ?? userRecord?.paymentAmount ?? 0);
                  const payRateText = paymentLabelFromApi
                    || (paymentOption ? `${paymentOption} ${money(paymentAmount)}` : '-');
                  return (
                    <div key={item.id} className="fin-tx-item">
                      <div className="fin-tx-main">
                        <span className="fin-tx-label">{userFullName}</span>
                        <div className="fin-payment-meta">
                          <span className="fin-payment-chip date">{new Date(item.paidAt || item.createdAt).toLocaleString()}</span>
                          <span className="fin-payment-chip method">{item.method || 'method'}</span>
                          <span className="fin-payment-chip note">{`Note: ${item.description || item.notes || '-'}`}</span>
                          <span className="fin-payment-chip rate">{`Rate: ${payRateText}`}</span>
                        </div>
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
                  );
                })}
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
                    setExpenseProjectPickerOpen(false);
                    setExpenseProjectSearch('');
                    setExpenseForm({
                      scope: 'project',
                      projectId: '',
                      type: 'material',
                      amount: '',
                      notes: '',
                      spentAt: ''
                    });
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
              {renderFilterPanel('expenses', (
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
                    {EXPENSE_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </label>
                <label className="payments-filter-field">
                  <span>Project</span>
                  <select value={expenseFilter.projectId} onChange={(e) => setExpenseFilter((prev) => ({ ...prev, projectId: e.target.value }))}>
                    <option value="">All projects</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {projectOptionLabel(project)}
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
              ))}
              <div className="fin-tx-list">
                {expenses.map((item) => {
                  const scopeKey = String(item?.expenseScope || item?.scope || '').toLowerCase();
                  const scopeLabel = item?.expenseScopeLabel
                    || (scopeKey === 'company' ? 'Company Based' : 'Project Based');
                  const isReferralExpense = isReferralType(item?.type || item?.expenseCategory);
                  const categoryLabel = item?.expenseCategoryLabel
                    || formatExpenseTypeLabel(item?.expenseCategory || item?.type)
                    || '-';
                  const projectLabel = item?.project?.description || item?.projectId || '';
                  const projectAddress = formatAddressText(item?.project?.address || item?.projectAddress);
                  const titleLabel = projectLabel || scopeLabel;
                  return (
                    <div key={item.id} className={`fin-tx-item${scopeKey === 'company' ? ' fin-expense-company-row' : ''}`}>
                      <div className="fin-tx-main">
                        <span className="fin-tx-label">{titleLabel}</span>
                        <div className="fin-expense-meta">
                          <span className="fin-expense-chip date">{new Date(item.spentAt || item.createdAt).toLocaleString()}</span>
                          <span className={`fin-expense-chip scope${scopeKey === 'company' ? ' company' : ''}`}>{scopeLabel}</span>
                          <span className="fin-expense-chip category">{categoryLabel}</span>
                          <span className="fin-expense-chip note">{`Note: ${item?.notes ?? '-'}`}</span>
                          {projectAddress ? <span className="fin-expense-chip address">{projectAddress}</span> : null}
                        </div>
                      </div>
                      <span className={`fin-tx-amount negative${scopeKey === 'project' ? ' fin-expense-amount-project' : ''}`}>${Number(item.amount).toFixed(2)}</span>
                      <button
                        type="button"
                        className={`ghost btn-with-spinner ${isReferralExpense ? 'btn-tone-neutral' : 'btn-tone-info'}`}
                        onClick={() => {
                          if (isReferralExpense) return;
                          startEditExpense(item);
                        }}
                        disabled={isReferralExpense || expenseEditBusyId === String(item.id)}
                        title={isReferralExpense ? 'Referral expense is auto-managed by project referral settings.' : undefined}
                      >
                        {expenseEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                        <span>{isReferralExpense ? 'Auto-managed' : (expenseEditBusyId === String(item.id) ? 'Loading...' : 'Edit')}</span>
                      </button>
                    </div>
                  );
                })}
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
                    setBonusUserPickerOpen(false);
                    setBonusUserSearch('');
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
              {renderFilterPanel('bonuses', (
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
              ))}
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
              background: `conic-gradient(var(--fin-chart-paid) 0 ${paidPct}%, var(--fin-chart-pending) ${paidPct}% ${Math.min(100, paidPct + pendingPct)}%, var(--fin-chart-track) ${Math.min(100, paidPct + pendingPct)}% 100%)`
            };
            return (
              <div className="full fin-user-summary-chart-card">
                <div className="fin-user-summary-donut-wrap">
                  <div className="fin-user-summary-donut" style={userChartStyle}>
                    {donutSegmentMarkers([
                      { label: 'Paid', pct: paidPct },
                      { label: 'Pending', pct: pendingPct }
                    ]).map((marker) => (
                      <span
                        key={`user-summary-${marker.key}`}
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
                    <div className="fin-user-summary-donut-center">
                      {userSummaryLoading ? <FiLoader className="btn-spinner" /> : <strong>{paidPct.toFixed(1)}%</strong>}
                      <small>{userSummaryLoading ? 'Loading' : 'Paid'}</small>
                    </div>
                  </div>
                </div>
                <div className="fin-user-summary-chart-meta">
                  <div className="fin-user-summary-row">
                    <span className="dot earned" />
                    <span>Earned (100.0%)</span>
                    <strong>{money(earned)}</strong>
                  </div>
                  <div className="fin-user-summary-row">
                    <span className="dot paid" />
                    <span>{`Paid (${paidPct.toFixed(1)}%)`}</span>
                    <strong>{money(paid)}</strong>
                  </div>
                  <div className="fin-user-summary-row">
                    <span className="dot pending" />
                    <span>{`Pending (${pendingPct.toFixed(1)}%)`}</span>
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
                <div className="home-metric tone-expense"><span className="home-metric-label">Ongoing Project Material Expenses</span><span className="home-metric-value">{money(ongoingProjectExpenses)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Material Paid by Customer</span><span className="home-metric-value">{money(ongoingMaterialPaidByCustomers)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Net Material Expense</span><span className="home-metric-value">{money(ongoingProjectMaterialExpensesNet)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Company Expenses (Project-Related)</span><span className="home-metric-value">{money(ongoingCompanyProjectRelatedExpenses)}</span></div>
                <div className="home-metric">
                  <span className="home-metric-label">Company-Owned Expenses (Non-Project)</span>
                  <span className="home-metric-value">{money(ongoingCompanyGeneralExpensesCurrentMonth)}</span>
                  <small className="muted">Current month (America/Chicago)</small>
                </div>
                <div className="home-metric tone-consumed"><span className="home-metric-label">Ongoing Consumed (All Company Expenses)</span><span className="home-metric-value">{money(ongoingConsumed)}</span></div>
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
                <div className="home-metric tone-expense"><span className="home-metric-label">Project Material Expenses</span><span className="home-metric-value">{money(totalProjectExpenses)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Material Paid by Customer</span><span className="home-metric-value">{money(totalMaterialPaidByCustomers)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Net Material Expense</span><span className="home-metric-value">{money(totalProjectMaterialExpensesNet)}</span></div>
                <div className="home-metric"><span className="home-metric-label">Company Expenses (Project-Related)</span><span className="home-metric-value">{money(totalCompanyProjectRelatedExpenses)}</span></div>
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
                {donutSegmentMarkers([
                  { label: 'Labor', pct: projectLaborPct },
                  { label: 'Company', pct: projectCompanyProjectRelatedPct },
                  { label: 'Remain', pct: projectRemainingPct }
                ]).map((marker) => (
                  <span
                    key={`project-summary-${marker.key}`}
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
                  {reportBusy ? <FiLoader className="btn-spinner" /> : <strong>{projectChartSpentPct.toFixed(1)}%</strong>}
                  <small>{reportBusy ? 'Loading' : 'Spent'}</small>
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
            <div className="fin-project-top-card">
              <span className="home-metric-label">Status</span>
              <span className={`home-metric-value fin-status-badge ${projectStatusToneClass}`}>{selectedProjectSummary?.projectStatus || '-'}</span>
            </div>
            <div className="fin-project-top-card">
              <span className="home-metric-label">Agreed Amount</span>
              <span className="home-metric-value">{money(selectedProjectSummary?.projectQuoteAmount)}</span>
            </div>
            <div className="fin-project-top-card total-cost">
              <span className="home-metric-label">Consumed</span>
              <span className="home-metric-value">{money(projectConsumedTotal)}</span>
            </div>
          </div>
          <div className="full home-stat-grid fin-project-metrics">
            <div className="home-metric"><span className="home-metric-label">Labor Hours Worked</span><span className="home-metric-value">{hoursFromMinutes(selectedProjectSummary?.laborMinutes)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Labor Earned</span><span className="home-metric-value">{money(selectedProjectSummary?.laborEarnings)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Project Material Expenses</span><span className="home-metric-value">{money(selectedProjectSummary?.projectExpenseTotal)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Company Expenses (Project-Related)</span><span className="home-metric-value">{money(selectedProjectSummary?.companyProjectRelatedExpenseTotal)}</span></div>
            <div className="home-metric"><span className="home-metric-label">Workers Count</span><span className="home-metric-value">{selectedProjectWorkersCount.toLocaleString()}</span></div>
            <div className="home-metric"><span className="home-metric-label">Project Duration</span><span className="home-metric-value">{selectedProjectDurationLabel}</span></div>
          </div>
          <div className="full muted" style={{ fontSize: 12, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span><strong>Actual Start:</strong> {selectedProjectActualStartLabel}</span>
            <span><strong>Actual End:</strong> {selectedProjectActualEndLabel}</span>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={customerPaymentsProjectModalOpen}
        onClose={() => setCustomerPaymentsProjectModalOpen(false)}
        title={selectedCustomerPaymentsProject?.projectDescription || 'Project Earnings Summary'}
        size="md"
      >
        <div className="modal-form-grid">
          <div className="full fin-project-summary-chart-card">
            <div className="fin-project-summary-donut-wrap">
              <div
                className="fin-project-summary-donut"
                style={{
                  ...selectedCustomerProjectPaidChart.chartStyle,
                  boxShadow: 'inset 0 0 0 3px rgba(34,197,94,0.22)'
                }}
              >
                {donutSegmentMarkers([
                  { label: 'Paid', pct: selectedCustomerProjectPaidChart.paidPct },
                  { label: 'Pending', pct: selectedCustomerProjectPaidChart.pendingPct }
                ]).map((marker) => (
                  <span
                    key={`customer-project-${marker.key}`}
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
                  <strong>{selectedCustomerProjectPaidChart.paidPct.toFixed(1)}%</strong>
                  <small>Paid</small>
                </div>
              </div>
            </div>
              <div className="fin-project-summary-chart-meta">
                <div className="fin-project-summary-group">
                  <div className="fin-project-summary-row">
                    <span className="dot paid" />
                    <span>{`Paid (Main Work) (${selectedCustomerProjectPaidChart.paidPct.toFixed(1)}%)`}</span>
                    <strong>{money(selectedCustomerPaymentsProject?.mainWorkPaidAmount ?? selectedCustomerPaymentsProject?.paidAmount)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot pending" />
                    <span>{`Pending (${selectedCustomerProjectPaidChart.pendingPct.toFixed(1)}%)`}</span>
                    <strong>{money(selectedCustomerPaymentsProject?.remainingAmount)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="dot labor" />
                    <span>Quote</span>
                    <strong>{money(selectedCustomerPaymentsProject?.quoteAmount)}</strong>
                  </div>
                </div>
                <div className="fin-project-summary-group fin-project-summary-group-extra">
                  <div className="fin-project-summary-row">
                    <span className="dot expense" />
                    <span>Overpaid</span>
                    <strong>{money(selectedCustomerPaymentsProject?.overpaidAmount)}</strong>
                  </div>
                  <div className="fin-project-summary-row">
                    <span className="row-icon material" aria-hidden="true"><FiPlusCircle /></span>
                    <span className="with-icon-label">Material/Other Payments</span>
                    <strong>{money(
                      Number(selectedCustomerPaymentsProject?.materialPaidAmount || 0)
                      + Number(selectedCustomerPaymentsProject?.otherPaidAmount || 0)
                      + Number(selectedCustomerPaymentsProject?.unknownPaidAmount || 0)
                    )}</strong>
                  </div>
                </div>
              </div>
            </div>
          <div className="full home-stat-grid fin-project-metrics">
            <div className="home-metric"><span className="home-metric-label">Project Description</span><span className="home-metric-value">{selectedCustomerPaymentsProject?.projectDescription || '-'}</span></div>
            <div className="home-metric"><span className="home-metric-label">Customer</span><span className="home-metric-value">{selectedCustomerFullName}</span></div>
            <div className="home-metric"><span className="home-metric-label">Project Address</span><span className="home-metric-value">{selectedCustomerPaymentsProject?.projectAddress || '-'}</span></div>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={paymentModalOpen}
        onClose={() => {
          setPaymentModalOpen(false);
          setPaymentEditId('');
          setPaymentUserPickerOpen(false);
          setPaymentUserSearch('');
          setPaymentForm({ userId: '', amount: '', method: 'cash', notes: '', paidAt: '' });
        }}
        title={paymentEditId ? 'Edit Payment' : 'Add Payment'}
        size="sm"
      >
        <div className="modal-form-grid">
          <input
            className="full"
            placeholder="Search user"
            value={paymentUserPickerOpen ? paymentUserSearch : selectedPaymentUserLabel}
            onFocus={() => {
              setBonusUserPickerOpen(false);
              setPaymentUserPickerOpen(true);
              if (!paymentUserPickerOpen) setPaymentUserSearch('');
            }}
            onClick={() => {
              setBonusUserPickerOpen(false);
              setPaymentUserPickerOpen((prev) => !prev);
              if (!paymentUserPickerOpen) setPaymentUserSearch('');
            }}
            onChange={(e) => {
              setBonusUserPickerOpen(false);
              setPaymentUserPickerOpen(true);
              setPaymentUserSearch(e.target.value);
            }}
          />
          {paymentUserPickerOpen ? (
            <div className="full fin-expense-project-picker" style={{ maxHeight: 180 }}>
              {paymentUserOptions.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`fin-expense-project-item${String(paymentForm.userId || '') === String(user.id) ? ' active' : ''}`}
                  onClick={() => {
                    setPaymentForm((prev) => ({ ...prev, userId: String(user.id) }));
                    setPaymentUserPickerOpen(false);
                  }}
                >
                  <span className="fin-expense-status none">USER</span>
                  <span className="fin-expense-project-label">{financeUserOptionLabel(user)}</span>
                </button>
              ))}
              {!paymentUserOptions.length ? (
                <div className="muted fin-expense-project-empty">No users found.</div>
              ) : null}
            </div>
          ) : null}
          <input placeholder="amount" value={paymentForm.amount} onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })} />
          <input type="datetime-local" placeholder="Paid at (date & time)" value={paymentForm.paidAt || ''} onChange={(e) => setPaymentForm({ ...paymentForm, paidAt: e.target.value })} />
          <select value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
            <option value="cash">cash</option>
            <option value="card">card</option>
          </select>
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
          setExpenseProjectPickerOpen(false);
          setExpenseProjectSearch('');
          setExpenseProjectCursor(null);
          setExpenseProjectHasMore(false);
          setExpenseProjectOptions([]);
          setExpenseForm({ scope: 'project', projectId: '', type: 'material', amount: '', notes: '', spentAt: '' });
        }}
        title={expenseEditId ? 'Edit Expense' : 'Add Expense'}
        size="sm"
      >
        <div className="modal-form-grid">
          {expenseEditIsReferral ? (
            <div
              className="full"
              style={{
                border: '1px solid var(--glass-5)',
                borderRadius: 12,
                padding: '10px 12px',
                background: 'var(--card)'
              }}
            >
              Referral expense is auto-managed by project referral settings.
            </div>
          ) : null}
          <select value={expenseForm.scope} onChange={(e) => setExpenseForm({ ...expenseForm, scope: e.target.value })} disabled={expenseEditIsReferral}>
            <option value="project">project</option>
            <option value="company">company</option>
          </select>
          <input
            className="full"
            placeholder="Search project for expense"
            value={expenseProjectPickerOpen ? expenseProjectSearch : selectedExpenseProjectLabel}
            onFocus={async () => {
              setCustomerPaymentProjectPickerOpen(false);
              setExpenseProjectPickerOpen(true);
              if (!expenseProjectPickerOpen) setExpenseProjectSearch('');
              await ensureExpenseProjectsLoaded();
            }}
            onClick={async () => {
              setCustomerPaymentProjectPickerOpen(false);
              setExpenseProjectPickerOpen((prev) => !prev);
              if (!expenseProjectPickerOpen) setExpenseProjectSearch('');
              await ensureExpenseProjectsLoaded();
            }}
            onChange={(e) => {
              setCustomerPaymentProjectPickerOpen(false);
              setExpenseProjectPickerOpen(true);
              setExpenseProjectSearch(e.target.value);
            }}
            disabled={expenseEditIsReferral}
          />
          {expenseProjectPickerOpen ? (
          <div
            className="full fin-expense-project-picker"
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
              if (!nearBottom) return;
              loadExpenseProjectOptions({ reset: false }).catch(() => {});
            }}
          >
            {expenseForm.scope === 'company' ? (
              <button
                type="button"
                className={`fin-expense-project-item${expenseForm.projectId ? '' : ' active'}`}
                onClick={() => {
                  setExpenseForm({ ...expenseForm, projectId: '' });
                  skipNextExpenseProjectSearchRef.current = true;
                  setExpenseProjectSearch('');
                  setExpenseProjectPickerOpen(false);
                }}
                disabled={expenseEditIsReferral}
              >
                <span className="fin-expense-status none">NONE</span>
                <span className="fin-expense-project-label">No project (optional)</span>
              </button>
            ) : null}
            {expenseProjectOptions.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`fin-expense-project-item${String(expenseForm.projectId || '') === String(project.id) ? ' active' : ''}`}
                onClick={() => {
                  setExpenseForm({ ...expenseForm, projectId: String(project.id) });
                  skipNextExpenseProjectSearchRef.current = true;
                  setExpenseProjectSearch(projectOptionLabel(project));
                  setExpenseProjectPickerOpen(false);
                }}
                disabled={expenseEditIsReferral}
              >
                <span className={`fin-expense-status ${projectStatusTone(project?.status)}`}>{projectStatusLabel(project?.status)}</span>
                <span className="fin-expense-project-label">{projectOptionLabel(project)}</span>
              </button>
            ))}
            {!expenseProjectOptionsLoading && !expenseProjectOptions.length ? (
              <div className="muted fin-expense-project-empty">No projects found.</div>
            ) : null}
          </div>
          ) : null}
          {expenseProjectPickerOpen && expenseProjectOptionsLoading ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading projects...</span>
            </div>
          ) : null}
          {expenseProjectPickerOpen && expenseProjectLoadMoreBusy ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading more projects...</span>
            </div>
          ) : null}
          {expenseProjectPickerOpen && !expenseProjectOptionsLoading && expenseProjectHasMore ? (
            <button
              type="button"
              className="ghost btn-tone-neutral"
              onClick={() => loadExpenseProjectOptions({ reset: false })}
              disabled={expenseProjectLoadMoreBusy || expenseEditIsReferral}
            >
              {expenseProjectLoadMoreBusy ? 'Loading...' : 'Load more projects'}
            </button>
          ) : null}
          {expenseEditIsReferral ? (
            <input value={formatExpenseTypeLabel(expenseForm.type)} disabled />
          ) : (
            <select value={expenseForm.type} onChange={(e) => setExpenseForm({ ...expenseForm, type: e.target.value })}>
              {EXPENSE_MUTABLE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          )}
          <input placeholder="amount" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} disabled={expenseEditIsReferral} />
          <input type="datetime-local" placeholder="Spent at (date & time)" value={expenseForm.spentAt || ''} onChange={(e) => setExpenseForm({ ...expenseForm, spentAt: e.target.value })} disabled={expenseEditIsReferral} />
          <input className="full" placeholder="notes" value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} disabled={expenseEditIsReferral} />
          {expenseEditId && canDelete && !expenseEditIsReferral ? (
            <div className="full row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="muted">Delete is soft delete.</span>
              <button
                type="button"
                className="ghost btn-tone-danger btn-with-spinner"
                onClick={async () => {
                  await onDeleteExpense(expenseEditId, expenseForm.type);
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
          {expenseEditIsReferral ? <div className="full muted">Delete is disabled for referral expenses.</div> : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setExpenseModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveExpense} disabled={expenseSaving || expenseEditIsReferral} className="btn-with-spinner">
              {expenseSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{expenseSaving ? (expenseEditId ? 'Updating...' : 'Saving...') : (expenseEditId ? 'Update' : 'Save')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={customerPaymentModalOpen}
        onClose={() => {
          setCustomerPaymentModalOpen(false);
          setCustomerPaymentEditId('');
          setCustomerPaymentProjectPickerOpen(false);
          setExpenseProjectSearch('');
          setCustomerPaymentForm({ projectId: '', amount: '', type: 'main_work', paidAt: '', notes: '' });
        }}
        title={customerPaymentEditId ? 'Edit Customer Payment' : 'Add Customer Payment'}
        size="sm"
      >
        <div className="modal-form-grid">
          <input
            className="full"
            placeholder="Search project for customer payment"
            value={customerPaymentProjectPickerOpen ? expenseProjectSearch : selectedCustomerPaymentProjectLabel}
            onFocus={async () => {
              setExpenseProjectPickerOpen(false);
              setCustomerPaymentProjectPickerOpen(true);
              if (!customerPaymentProjectPickerOpen) setExpenseProjectSearch('');
              await ensureExpenseProjectsLoaded();
            }}
            onClick={async () => {
              setExpenseProjectPickerOpen(false);
              setCustomerPaymentProjectPickerOpen((prev) => !prev);
              if (!customerPaymentProjectPickerOpen) setExpenseProjectSearch('');
              await ensureExpenseProjectsLoaded();
            }}
            onChange={(e) => {
              setExpenseProjectPickerOpen(false);
              setCustomerPaymentProjectPickerOpen(true);
              setExpenseProjectSearch(e.target.value);
            }}
          />
          {customerPaymentProjectPickerOpen ? (
          <div
            className="full fin-expense-project-picker"
            onScroll={(e) => {
              const el = e.currentTarget;
              const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 8;
              if (!nearBottom) return;
              loadExpenseProjectOptions({ reset: false }).catch(() => {});
            }}
          >
            {expenseProjectOptions.map((project) => (
              <button
                key={project.id}
                type="button"
                className={`fin-expense-project-item${String(customerPaymentForm.projectId || '') === String(project.id) ? ' active' : ''}`}
                onClick={() => {
                  setCustomerPaymentForm((prev) => ({ ...prev, projectId: String(project.id) }));
                  skipNextExpenseProjectSearchRef.current = true;
                  setExpenseProjectSearch(projectOptionLabel(project));
                  setCustomerPaymentProjectPickerOpen(false);
                }}
              >
                <span className={`fin-expense-status ${projectStatusTone(project?.status)}`}>{projectStatusLabel(project?.status)}</span>
                <span className="fin-expense-project-label">{projectOptionLabel(project)}</span>
              </button>
            ))}
            {!expenseProjectOptionsLoading && !expenseProjectOptions.length ? (
              <div className="muted fin-expense-project-empty">No projects found.</div>
            ) : null}
          </div>
          ) : null}
          {customerPaymentProjectPickerOpen && expenseProjectOptionsLoading ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading projects...</span>
            </div>
          ) : null}
          {customerPaymentProjectPickerOpen && expenseProjectLoadMoreBusy ? (
            <div className="muted full row" style={{ gap: 8, alignItems: 'center' }}>
              <FiLoader className="btn-spinner" />
              <span>Loading more projects...</span>
            </div>
          ) : null}
          {customerPaymentProjectPickerOpen && !expenseProjectOptionsLoading && expenseProjectHasMore ? (
            <button
              type="button"
              className="ghost btn-tone-neutral"
              onClick={() => loadExpenseProjectOptions({ reset: false })}
              disabled={expenseProjectLoadMoreBusy}
            >
              {expenseProjectLoadMoreBusy ? 'Loading...' : 'Load more projects'}
            </button>
          ) : null}
          <select
            value={customerPaymentForm.type}
            onChange={(e) => setCustomerPaymentForm((prev) => ({ ...prev, type: e.target.value }))}
          >
            <option value="main_work">Main Work</option>
            <option value="material">Material</option>
            <option value="other">Other</option>
            <option value="unknown">Unknown</option>
          </select>
          <input
            placeholder="amount"
            value={customerPaymentForm.amount}
            onChange={(e) => setCustomerPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
          />
          <input
            type="datetime-local"
            placeholder="Paid at (date & time)"
            value={customerPaymentForm.paidAt || ''}
            onChange={(e) => setCustomerPaymentForm((prev) => ({ ...prev, paidAt: e.target.value }))}
          />
          <input
            className="full"
            placeholder="notes"
            value={customerPaymentForm.notes}
            onChange={(e) => setCustomerPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
          />
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost" onClick={() => setCustomerPaymentModalOpen(false)}>Cancel</button>
            <button type="button" onClick={saveCustomerPayment} disabled={customerPaymentSaving} className="btn-with-spinner">
              {customerPaymentSaving ? <FiLoader className="btn-spinner" /> : null}
              <span>{customerPaymentSaving ? (customerPaymentEditId ? 'Updating...' : 'Saving...') : (customerPaymentEditId ? 'Update' : 'Save')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>

      <SimpleModal
        open={bonusModalOpen}
        onClose={() => {
          setBonusModalOpen(false);
          setBonusEditId('');
          setBonusUserPickerOpen(false);
          setBonusUserSearch('');
          setBonusForm({ userId: '', amount: '', description: '', effectiveAt: '' });
        }}
        title={bonusEditId ? 'Edit Bonus / Penalty' : 'Add Bonus / Penalty'}
        size="sm"
      >
        <div className="modal-form-grid">
          <input
            className="full"
            placeholder="Search user"
            value={bonusUserPickerOpen ? bonusUserSearch : selectedBonusUserLabel}
            onFocus={() => {
              setPaymentUserPickerOpen(false);
              setBonusUserPickerOpen(true);
              if (!bonusUserPickerOpen) setBonusUserSearch('');
            }}
            onClick={() => {
              setPaymentUserPickerOpen(false);
              setBonusUserPickerOpen((prev) => !prev);
              if (!bonusUserPickerOpen) setBonusUserSearch('');
            }}
            onChange={(e) => {
              setPaymentUserPickerOpen(false);
              setBonusUserPickerOpen(true);
              setBonusUserSearch(e.target.value);
            }}
          />
          {bonusUserPickerOpen ? (
            <div className="full fin-expense-project-picker" style={{ maxHeight: 180 }}>
              {bonusUserOptions.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  className={`fin-expense-project-item${String(bonusForm.userId || '') === String(user.id) ? ' active' : ''}`}
                  onClick={() => {
                    setBonusForm((prev) => ({ ...prev, userId: String(user.id) }));
                    setBonusUserPickerOpen(false);
                  }}
                >
                  <span className="fin-expense-status none">USER</span>
                  <span className="fin-expense-project-label">{financeUserOptionLabel(user)}</span>
                </button>
              ))}
              {!bonusUserOptions.length ? (
                <div className="muted fin-expense-project-empty">No users found.</div>
              ) : null}
            </div>
          ) : null}
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
