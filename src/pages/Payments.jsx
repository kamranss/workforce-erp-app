import { useEffect, useMemo, useRef, useState } from 'react';
import { FiCalendar, FiClock, FiDollarSign, FiEdit2, FiFilter, FiLoader, FiPlusCircle, FiTrash2, FiUser } from 'react-icons/fi';
import { createPayment, deletePayment, getPayment, listPayments, updatePayment } from '../api/paymentsApi.js';
import { myEarnings } from '../api/reportsApi.js';
import { listUsers } from '../api/usersApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

const EMPTY_FORM = {
  userId: '',
  amount: '',
  paidAt: '',
  method: 'cash',
  notes: ''
};

const PRESETS = [
  { value: 'all', label: 'All Time' },
  { value: 'last15', label: 'Last 15 Days' },
  { value: 'previous15', label: 'Previous 15 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'previousMonth', label: 'Previous Month' },
  { value: 'custom', label: 'Custom' }
];

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
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

function formatDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleString();
}

function resolveUserLabel(item) {
  const name = String(item?.user?.name || '').trim();
  const surname = String(item?.user?.surname || '').trim();
  const full = `${name} ${surname}`.trim();
  if (full) return full;
  return String(item?.userId || '-');
}

function presetRange(preset, customFrom, customTo) {
  if (preset === 'all') {
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

export default function Payments() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();

  const roleLower = String(role || '').toLowerCase();
  const isAdmin = roleLower === 'admin' || roleLower === 'superadmin';
  const isSuperAdmin = roleLower === 'superadmin';
  const isUser = roleLower === 'user' || roleLower === 'employee';

  const [items, setItems] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadMoreBusy, setLoadMoreBusy] = useState(false);
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [error, setError] = useState('');
  const [hasLoaded, setHasLoaded] = useState(false);

  const [userOptions, setUserOptions] = useState([]);
  const [filters, setFilters] = useState({
    userId: '',
    method: '',
    rangePreset: 'all',
    customFrom: '',
    customTo: ''
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState('');
  const [saving, setSaving] = useState(false);
  const [rowDeleteBusyId, setRowDeleteBusyId] = useState('');
  const [rowEditBusyId, setRowEditBusyId] = useState('');
  const lastRefreshRef = useRef(0);
  const skipNextFilterReloadRef = useRef(false);

  const isActive = activeTab === 'payments';

  const selectedRange = useMemo(
    () => presetRange(filters.rangePreset, filters.customFrom, filters.customTo),
    [filters.rangePreset, filters.customFrom, filters.customTo]
  );

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      const data = await listUsers({ limit: 20 });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setUserOptions(rows);
      setForm((prev) => ({ ...prev, userId: prev.userId || rows[0]?.id || '' }));
    } catch (err) {
      showToast(err?.message || 'Failed to load users.');
    }
  };

  const loadSummary = async () => {
    if (!isUser) return;
    setSummaryLoading(true);
    try {
      const data = await myEarnings({ limit: 1 });
      setSummary({
        laborHours: Number(data?.laborHours || 0),
        laborEarnings: Number(data?.laborEarnings || 0),
        paymentsTotal: Number(data?.paymentsTotal || 0),
        pendingTotal: Number(data?.pendingTotal || 0)
      });
    } catch (err) {
      showToast(err?.message || 'Failed to load payments summary.');
    } finally {
      setSummaryLoading(false);
    }
  };

  const buildQuery = (nextCursor) => ({
    limit: 5,
    cursor: nextCursor || undefined,
    userId: isAdmin ? (filters.userId || undefined) : undefined,
    from: selectedRange.from,
    to: selectedRange.to,
    method: filters.method || undefined
  });

  const loadPaymentsPage = async ({ reset = false } = {}) => {
    if (loading && !reset) return;
    if (!reset && !cursor) return;

    if (filters.rangePreset === 'custom' && (!filters.customFrom || !filters.customTo)) {
      setError('Pick both custom dates.');
      return;
    }

    if (reset) {
      setLoading(true);
      setError('');
    } else {
      setLoadMoreBusy(true);
    }

    try {
      const data = await listPayments(buildQuery(reset ? '' : cursor));
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setItems((prev) => (reset ? nextItems : [...prev, ...nextItems]));
      setCursor(data?.nextCursor || null);
      if (reset) setHasLoaded(true);
    } catch (err) {
      const message = err?.message || 'Failed to load payments.';
      setError(message);
      showToast(message);
    } finally {
      setLoading(false);
      setLoadMoreBusy(false);
    }
  };

  const openCreate = () => {
    setEditId('');
    setForm({ ...EMPTY_FORM, userId: userOptions[0]?.id || '' });
    setModalOpen(true);
  };

  const openEdit = async (id) => {
    if (!id) return;
    setRowEditBusyId(String(id));
    try {
      const row = await getPayment(id);
      setEditId(String(id));
      setForm({
        userId: row?.userId || '',
        amount: row?.amount ?? '',
        paidAt: toInputDateTime(row?.paidAt),
        method: row?.method || 'cash',
        notes: row?.notes || row?.description || ''
      });
      setModalOpen(true);
    } catch (err) {
      showToast(err?.message || 'Failed to load payment details.');
    } finally {
      setRowEditBusyId('');
    }
  };

  const savePayment = async () => {
    if (!isAdmin) return;
    setSaving(true);
    try {
      const amountNum = Number(form.amount);
      if (!form.userId) {
        showToast('User is required.');
        return;
      }
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        showToast('Amount must be greater than 0.');
        return;
      }

      const body = {
        userId: form.userId,
        amount: amountNum,
        paidAt: form.paidAt ? new Date(form.paidAt).toISOString() : undefined,
        method: String(form.method || '').trim() || undefined,
        notes: String(form.notes || '').trim() || undefined
      };

      if (editId) {
        await updatePayment(editId, body);
      } else {
        await createPayment(body);
      }

      setModalOpen(false);
      setForm(EMPTY_FORM);
      setEditId('');
      await loadPaymentsPage({ reset: true });
      showToast(editId ? 'Payment updated.' : 'Payment created.');
    } catch (err) {
      showToast(err?.message || (editId ? 'Update failed.' : 'Create failed.'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (id) => {
    if (!isSuperAdmin || !id) return;
    setRowDeleteBusyId(String(id));
    try {
      await deletePayment(id);
      await loadPaymentsPage({ reset: true });
      showToast('Payment deleted (soft).');
    } catch (err) {
      showToast(err?.message || 'Delete failed.');
    } finally {
      setRowDeleteBusyId('');
    }
  };

  useEffect(() => {
    if (!isActive) return;
    if (isAdmin) loadUsers();
  }, [isActive, isAdmin]);

  useEffect(() => {
    if (!isActive || hasLoaded) return;
    const stop = showGlobalLoader ? showGlobalLoader('Loading payments...', { center: true }) : () => {};
    Promise.allSettled([
      loadPaymentsPage({ reset: true }),
      isUser ? loadSummary() : Promise.resolve()
    ]).finally(() => {
      skipNextFilterReloadRef.current = true;
      stop();
    });
  }, [isActive, hasLoaded, isUser]);

  useEffect(() => {
    if (!isActive || !hasLoaded) return;
    if (skipNextFilterReloadRef.current) {
      skipNextFilterReloadRef.current = false;
      return;
    }
    loadPaymentsPage({ reset: true });
  }, [hasLoaded, isAdmin, filters.userId, filters.method, filters.rangePreset, filters.customFrom, filters.customTo]);

  useEffect(() => {
    if (!isActive || !isUser) return;
    loadSummary().catch(() => {});
  }, [isUser]);

  useEffect(() => {
    if (!isActive) return;
    if (refreshTick === lastRefreshRef.current) return;
    lastRefreshRef.current = refreshTick;
    Promise.allSettled([
      loadPaymentsPage({ reset: true }),
      isUser ? loadSummary() : Promise.resolve()
    ]).catch(() => {});
  }, [isActive, refreshTick, isUser]);

  if (!isActive) return <div id="paymentsPage" className="tab-page hidden" />;
  if (!isAdmin && !isUser) return <div id="paymentsPage" className="tab-page active section card">Payments page not available for this role.</div>;

  return (
    <div id="paymentsPage" className="tab-page active">
      {isUser ? (
        <div className="section card">
          <div className="home-card-head">
            <div>
              <div className="eyebrow">My Totals</div>
              <h3>Work & Payments</h3>
            </div>
            {summaryLoading ? <FiLoader className="btn-spinner" /> : <FiDollarSign />}
          </div>
          <div className="home-personal-grid payments-summary-grid">
            <div className="metric payments-summary-card payments-summary-hours">
              <span className="metric-label">Total Hours</span>
              <span className="metric-value">{summaryLoading && !summary ? '-' : Number(summary?.laborHours || 0).toFixed(2)}</span>
            </div>
            <div className="metric payments-summary-card payments-summary-earned">
              <span className="metric-label">Total Earned</span>
              <span className="metric-value">{summaryLoading && !summary ? '-' : money(summary?.laborEarnings)}</span>
            </div>
            <div className="metric payments-summary-card payments-summary-paid">
              <span className="metric-label">Total Paid</span>
              <span className="metric-value">{summaryLoading && !summary ? '-' : money(summary?.paymentsTotal)}</span>
            </div>
            <div className="metric payments-summary-card payments-summary-paid">
              <span className="metric-label">Pending Balance</span>
              <span className="metric-value">{summaryLoading && !summary ? '-' : money(summary?.pendingTotal)}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="section card payments-filters-card">
        <div className="home-card-head">
          <div>
            <div className="eyebrow">Payments</div>
            <h3>{isAdmin ? 'Payments Manager' : 'My Payments'}</h3>
          </div>
          <FiDollarSign />
        </div>

        <div className="prj-filter-group payments-filters-grid">
          {isAdmin ? (
            <label className="payments-filter-field">
              <span><FiUser /> User</span>
              <select value={filters.userId} onChange={(e) => setFilters((prev) => ({ ...prev, userId: e.target.value }))}>
                <option value="">All users</option>
                {userOptions.map((user) => (
                  <option key={user.id} value={user.id}>{user.name} {user.surname} ({user.email})</option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="payments-filter-field">
            <span><FiFilter /> Method</span>
            <select value={filters.method} onChange={(e) => setFilters((prev) => ({ ...prev, method: e.target.value }))}>
              <option value="">All methods</option>
              <option value="cash">Cash</option>
              <option value="zelle">Zelle</option>
              <option value="bank">Bank</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
          </label>

          <label className="payments-filter-field">
            <span><FiClock /> Range</span>
            <select value={filters.rangePreset} onChange={(e) => setFilters((prev) => ({ ...prev, rangePreset: e.target.value }))}>
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </label>

          {filters.rangePreset === 'custom' ? (
            <>
              <label className="payments-filter-field">
                <span><FiCalendar /> From</span>
                <input type="date" value={filters.customFrom} onChange={(e) => setFilters((prev) => ({ ...prev, customFrom: e.target.value }))} />
              </label>
              <label className="payments-filter-field">
                <span><FiCalendar /> To</span>
                <input type="date" value={filters.customTo} onChange={(e) => setFilters((prev) => ({ ...prev, customTo: e.target.value }))} />
              </label>
            </>
          ) : null}

          <button
            type="button"
            className="ghost btn-tone-neutral payments-reset-btn"
            onClick={() => setFilters({ userId: '', method: '', rangePreset: 'all', customFrom: '', customTo: '' })}
          >
            Reset
          </button>
        </div>

        {isAdmin ? (
          <div className="page-actions" style={{ marginTop: 10 }}>
            <button type="button" className="ghost btn-tone-primary" onClick={openCreate}>
              <FiPlusCircle /> Add Payment
            </button>
          </div>
        ) : null}

        {error ? <div className="muted" style={{ marginTop: 8 }}>{error}</div> : null}
      </div>

      <div className="section card payments-list-card">
        <div className="home-card-head">
          <div>
            <div className="eyebrow">List</div>
            <h3>Payments</h3>
          </div>
        </div>

        {!items.length && !loading ? <div className="muted">No payments found.</div> : null}

        <div className="task-list">
          {items.map((item, idx) => (
            <div key={item.id || `payment-${idx}`} className={`task-row payments-row payments-row-paid${isUser ? ' payments-row-user' : ''}`}>
              {isUser ? (
                <>
                  <div className="payments-user-row-top">
                    <div className="payments-date">{formatDateTime(item.paidAt || item.createdAt)}</div>
                    <div className="payments-amount-line">
                      <span className="payments-amount-strong">{money(item.amount)}</span>
                      <span className="payments-method-chip">{String(item.method || 'method unknown').toUpperCase()}</span>
                    </div>
                  </div>
                  <div className="payments-user-note">{item.description || item.notes || '-'}</div>
                </>
              ) : (
                <>
                  <div className="payments-row-head">
                    <div className="task-title">{resolveUserLabel(item)}</div>
                    <div className="payments-date">{formatDateTime(item.paidAt || item.createdAt)}</div>
                  </div>
                  <div className="task-location">
                    <span className="payments-amount-strong">{money(item.amount)}</span>
                    <span> | {String(item.method || 'method unknown').toUpperCase()}</span>
                  </div>
                  <div className="task-footer">
                    <span className="task-due">{item.description || item.notes || '-'}</span>
                  </div>
                </>
              )}

              {isAdmin ? (
                <div className="task-actions">
                  <button type="button" className="ghost btn-tone-info btn-with-spinner" onClick={() => openEdit(item.id)} disabled={rowEditBusyId === String(item.id)}>
                    {rowEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : <FiEdit2 />}
                    <span>{rowEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                  </button>
                  {isSuperAdmin ? (
                    <button type="button" className="ghost btn-tone-danger btn-with-spinner" onClick={() => onDelete(item.id)} disabled={rowDeleteBusyId === String(item.id)}>
                      {rowDeleteBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : <FiTrash2 />}
                      <span>{rowDeleteBusyId === String(item.id) ? 'Deleting...' : 'Delete'}</span>
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>

        {loading && !items.length ? (
          <div className="section card" style={{ textAlign: 'center' }}>
            <FiLoader className="btn-spinner" style={{ width: 24, height: 24, marginBottom: 8 }} />
            <div style={{ fontWeight: 600 }}>Loading payments...</div>
          </div>
        ) : null}

        {!loading && cursor ? (
          <button type="button" className="btn-tone-neutral btn-with-spinner" onClick={() => loadPaymentsPage()} disabled={loadMoreBusy}>
            {loadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
            <span>{loadMoreBusy ? 'Loading...' : 'Load more payments'}</span>
          </button>
        ) : null}
      </div>

      <SimpleModal open={modalOpen} onClose={() => setModalOpen(false)} title={editId ? 'Edit Payment' : 'Add Payment'} size="sm">
        <div className="modal-form-grid">
          <select className="full" value={form.userId} onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))}>
            <option value="">Select user</option>
            {userOptions.map((user) => (
              <option key={user.id} value={user.id}>{user.name} {user.surname} ({user.email})</option>
            ))}
          </select>
          <input type="number" min="0" step="0.01" placeholder="Amount" value={form.amount} onChange={(e) => setForm((prev) => ({ ...prev, amount: e.target.value }))} />
          <input type="datetime-local" placeholder="Paid at (date & time)" value={form.paidAt} onChange={(e) => setForm((prev) => ({ ...prev, paidAt: e.target.value }))} />
          <input placeholder="Method (cash/zelle/bank/check)" value={form.method} onChange={(e) => setForm((prev) => ({ ...prev, method: e.target.value }))} />
          <input className="full" placeholder="Description / Notes" value={form.notes} onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))} />
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setModalOpen(false)}>Cancel</button>
            <button type="button" className="btn-tone-primary btn-with-spinner" onClick={savePayment} disabled={saving}>
              {saving ? <FiLoader className="btn-spinner" /> : null}
              <span>{saving ? 'Saving...' : (editId ? 'Update' : 'Create')}</span>
            </button>
          </div>
        </div>
      </SimpleModal>
    </div>
  );
}
