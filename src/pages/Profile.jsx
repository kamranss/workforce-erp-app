import { useEffect, useState } from 'react';
import { FiCheckCircle, FiClock, FiDollarSign, FiKey, FiLoader, FiLogOut, FiMoon, FiShield, FiSmartphone, FiSun, FiTrash2, FiUser, FiUserPlus } from 'react-icons/fi';
import { myReport, userLiability } from '../api/reportsApi.js';
import { createUser, deactivateUser, listUsers, updateUser } from '../api/usersApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useAuthActions } from '../context/AuthActionsProvider.jsx';
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

function pickNumber(obj, keys, fallback = 0) {
  for (const key of keys) {
    const raw = obj?.[key];
    if (raw == null) continue;
    const n = Number(raw);
    if (!Number.isNaN(n)) return n;
  }
  return fallback;
}

function resolveReportTotals(report) {
  const source = report?.summary || report?.totals || report?.data?.summary || report?.data?.totals || report;
  return {
    totalHours: pickNumber(source, ['totalHours', 'hoursTotal', 'laborHours', 'workedHours'], 0),
    totalEarned: pickNumber(source, ['totalEarned', 'earnedTotal', 'laborEarningsTotal', 'earningsTotal'], 0),
    pendingTotal: pickNumber(source, ['pendingTotal', 'pendingAmount'], 0)
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

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function toTitleCase(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function passkeyDeviceLabel(item) {
  const explicit =
    String(item?.deviceModel || item?.deviceName || item?.model || '').trim()
    || String(item?.aaguidName || '').trim();
  if (explicit) return explicit;
  const type = String(item?.deviceType || '').toLowerCase();
  if (type === 'singledevice') return 'This device';
  if (type === 'multidevice') return 'Synced Face ID';
  return 'Face ID';
}

export default function Profile() {
  const { activeTab, showToast, refreshTick, showGlobalLoader, theme, setTheme } = useUI();
  const {
    logout,
    registerPasskey,
    listPasskeys,
    deletePasskey,
    passkeySupport,
    updatePasskeySupport
  } = useAuthActions();
  const { user, role } = useAuth();
  const [profileTab, setProfileTab] = useState('profile');
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [users, setUsers] = useState([]);
  const [usersCursor, setUsersCursor] = useState(null);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoadMoreBusy, setUsersLoadMoreBusy] = useState(false);
  const [usersSearch, setUsersSearch] = useState('');
  const [usersSearchDebounced, setUsersSearchDebounced] = useState('');
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [userForm, setUserForm] = useState(EMPTY_USER);
  const [userEditId, setUserEditId] = useState('');
  const [userSaving, setUserSaving] = useState(false);
  const [userEditBusyId, setUserEditBusyId] = useState('');
  const [userToggleBusyId, setUserToggleBusyId] = useState('');
  const [userEditMeta, setUserEditMeta] = useState({ id: '', role: '', isActive: true });
  const [userSummaryModalOpen, setUserSummaryModalOpen] = useState(false);
  const [userSummaryBusyId, setUserSummaryBusyId] = useState('');
  const [userSummaryLoading, setUserSummaryLoading] = useState(false);
  const [selectedUserSummaryUser, setSelectedUserSummaryUser] = useState(null);
  const [selectedUserSummaryData, setSelectedUserSummaryData] = useState(null);
  const [passkeys, setPasskeys] = useState([]);
  const [passkeysLoading, setPasskeysLoading] = useState(false);
  const [passkeyRegisterBusy, setPasskeyRegisterBusy] = useState(false);
  const [passkeyDeleteBusyId, setPasskeyDeleteBusyId] = useState('');
  const isActive = activeTab === 'profile';
  const roleLower = String(role || '').toLowerCase();
  const isAdminRole = roleLower === 'admin' || roleLower === 'superadmin';
  const hideTotalsForRole = roleLower === 'user' || roleLower === 'employee';
  const canManageTargetUser = (targetRole) => roleLower === 'superadmin' || String(targetRole || '').toLowerCase() === 'user';
  const hasRegisteredPasskey = passkeys.length > 0;

  useEffect(() => {
    const handle = setTimeout(() => {
      setUsersSearchDebounced(String(usersSearch || '').trim());
    }, 280);
    return () => clearTimeout(handle);
  }, [usersSearch]);

  const loadUsersData = async ({ reset = false } = {}) => {
    if (usersLoading && !reset) return [];
    if (!reset && !usersCursor) return [];
    if (reset) setUsersLoading(true);
    else setUsersLoadMoreBusy(true);
    try {
      const data = await listUsers({
        limit: 10,
        cursor: reset ? undefined : usersCursor,
        q: usersSearchDebounced || undefined
      });
      const rows = Array.isArray(data?.items) ? data.items : [];
      setUsers((prev) => (reset ? rows : [...prev, ...rows]));
      setUsersCursor(data?.nextCursor || null);
      return rows;
    } catch (err) {
      showToast(err?.message || 'Failed to load users.');
      return [];
    } finally {
      setUsersLoading(false);
      setUsersLoadMoreBusy(false);
    }
  };

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
      await loadUsersData({ reset: true });
      showToast(userEditId ? 'User updated.' : 'User created.');
    } catch (err) {
      showToast(err?.message || (userEditId ? 'Update user failed.' : 'Create user failed.'));
    } finally {
      setUserSaving(false);
    }
  };

  const startEditUser = async (item) => {
    if (!item?.id) return;
    if (!canManageTargetUser(item.role)) {
      showToast('You cannot manage this user role.');
      return;
    }
    setUserEditBusyId(String(item.id));
    try {
      setUserEditId(String(item.id));
      setUserForm({
        name: item?.name || '',
        surname: item?.surname || '',
        email: item?.email || '',
        passCode: '',
        role: item?.role || 'user',
        paymentOption: item?.paymentOption || 'hourly',
        paymentAmount: item?.paymentAmount ?? '',
        isActive: item?.isActive !== false
      });
      setUserEditMeta({ id: String(item.id), role: item?.role || 'user', isActive: item?.isActive !== false });
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
      await loadUsersData({ reset: true });
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
      await loadUsersData({ reset: true });
      showToast('User activated.');
    } catch (err) {
      showToast(err?.message || 'Activate failed.');
    } finally {
      setUserToggleBusyId('');
    }
  };

  const openUserSummaryModal = async (item) => {
    if (!item?.id) return;
    const id = String(item.id);
    setUserSummaryBusyId(id);
    setSelectedUserSummaryUser(item);
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

  useEffect(() => {
    if (!isActive || hideTotalsForRole || isAdminRole || hasLoaded) return;
    let mounted = true;
    setLoading(true);
    const stop = showGlobalLoader ? showGlobalLoader('Loading profile...', { center: true }) : () => {};
    myReport({})
      .then((data) => {
        if (!mounted) return;
        setReport(data || null);
        setHasLoaded(true);
      })
      .catch((err) => {
        if (!mounted) return;
        showToast(err?.message || 'Failed to load profile totals.');
      })
      .finally(() => {
        stop();
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
      stop();
    };
  }, [isActive, hideTotalsForRole, isAdminRole, hasLoaded]);

  useEffect(() => {
    if (!isActive || hideTotalsForRole || isAdminRole || !hasLoaded) return;
    setLoading(true);
    myReport({})
      .then((data) => setReport(data || null))
      .catch((err) => showToast(err?.message || 'Failed to load profile totals.'))
      .finally(() => setLoading(false));
  }, [isActive, hideTotalsForRole, isAdminRole, hasLoaded, refreshTick]);

  useEffect(() => {
    if (!isActive || !isAdminRole) return;
    if (profileTab !== 'users') return;
    loadUsersData({ reset: true }).catch(() => {});
  }, [isActive, isAdminRole, profileTab, usersSearchDebounced]);

  useEffect(() => {
    if (!isActive || !isAdminRole) return;
    if (profileTab !== 'users') return;
    loadUsersData({ reset: true }).catch(() => {});
  }, [isActive, isAdminRole, profileTab, refreshTick]);

  const loadPasskeys = async () => {
    if (passkeysLoading) return;
    setPasskeysLoading(true);
    try {
      const items = await listPasskeys();
      setPasskeys(items);
    } catch (err) {
      showToast(err?.message || 'Failed to load passkeys.');
    } finally {
      setPasskeysLoading(false);
    }
  };

  const onEnablePasskey = async () => {
    setPasskeyRegisterBusy(true);
    try {
      const result = await registerPasskey();
      if (result?.ok) {
        showToast('Face ID enabled.', 'success');
        await loadPasskeys();
        return;
      }
      if (result?.canceled) {
        showToast('Face ID setup canceled.', 'warning');
        return;
      }
      showToast('Face ID setup failed.', 'error');
    } catch (err) {
      showToast(err?.message || 'Face ID setup failed.', 'error');
    } finally {
      setPasskeyRegisterBusy(false);
    }
  };

  const onDeletePasskey = async (id) => {
    const passkeyId = String(id || '').trim();
    if (!passkeyId) return;
    setPasskeyDeleteBusyId(passkeyId);
    try {
      await deletePasskey(passkeyId);
      await loadPasskeys();
      showToast('Face ID removed.', 'success');
    } catch (err) {
      showToast(err?.message || 'Remove Face ID failed.', 'error');
    } finally {
      setPasskeyDeleteBusyId('');
    }
  };

  useEffect(() => {
    if (!isActive || profileTab !== 'profile') return;
    updatePasskeySupport().catch(() => {});
    loadPasskeys().catch(() => {});
  }, [isActive, profileTab, refreshTick]);

  if (!isActive) return <div id="profilePage" className="tab-page hidden" />;
  const totals = resolveReportTotals(report || {});

  return (
    <div id="profilePage" className="tab-page active">
      {isAdminRole ? (
        <div className="section card">
          <div className="fin-tabs finance-sub-tabs">
            <button type="button" className={`fin-tab${profileTab === 'profile' ? ' active' : ''}`} onClick={() => setProfileTab('profile')}>Profile</button>
            <button type="button" className={`fin-tab${profileTab === 'users' ? ' active' : ''}`} onClick={() => setProfileTab('users')}>Users</button>
          </div>
        </div>
      ) : null}

      {profileTab === 'profile' ? (
        <>
          <div className="section card profile-hero">
            <div className="home-card-head">
              <div>
                <div className="eyebrow">Account</div>
                <h3>{`${user?.name || ''} ${user?.surname || ''}`.trim() || 'Profile'}</h3>
              </div>
              <FiUser />
            </div>
            <div className="home-personal-grid profile-metrics">
              <div className="metric profile-metric profile-metric-role">
                <span className="metric-label">Role</span>
                <span className="metric-value profile-metric-value"><FiShield style={{ marginRight: 6 }} />{role || '-'}</span>
              </div>
              <div className="metric profile-metric profile-metric-user">
                <span className="metric-label">User</span>
                <span className="metric-value profile-metric-value">{`${user?.name || ''} ${user?.surname || ''}`.trim() || '-'}</span>
              </div>
              <div className="metric profile-metric profile-metric-paytype">
                <span className="metric-label">Payment</span>
                <span className="metric-value profile-metric-value">{user?.paymentOption || '-'}</span>
              </div>
            </div>
          </div>

          {!isAdminRole ? (
            <div className="section card profile-totals">
              <div className="home-card-head">
                <div>
                  <div className="eyebrow">My Totals</div>
                  <h3>Work & Earnings</h3>
                </div>
                {!hideTotalsForRole && loading ? <FiLoader className="btn-spinner" /> : null}
              </div>
              {!hideTotalsForRole ? (
                <div className="home-personal-grid profile-metrics">
                  <div className="metric profile-metric profile-metric-hours">
                    <span className="metric-label">Hours</span>
                    <FiClock className="profile-metric-icon" />
                    <span className="metric-value">{Number(totals.totalHours || 0).toFixed(2)}</span>
                  </div>
                  <div className="metric profile-metric profile-metric-earned">
                    <span className="metric-label">Earned</span>
                    <FiDollarSign className="profile-metric-icon" />
                    <span className="metric-value">${Number(totals.totalEarned || 0).toFixed(2)}</span>
                  </div>
                  <div className="metric profile-metric profile-metric-pending">
                    <span className="metric-label">Pending</span>
                    <FiDollarSign className="profile-metric-icon" />
                    <span className="metric-value">${Number(totals.pendingTotal || 0).toFixed(2)}</span>
                  </div>
                </div>
              ) : null}
              <div className="home-personal-list profile-facts">
                <div className="entry">
                  <div>Payment Amount</div>
                  <div className="profile-fact-value">{user?.paymentAmount ?? 0}</div>
                </div>
                <div className="entry">
                  <div>Status</div>
                  <div className="profile-fact-value">{user?.isActive ? 'Active' : 'Inactive'}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className="section card settings-card">
            <div className="home-card-head">
              <div>
                <div className="eyebrow">Appearance</div>
                <h3>Theme</h3>
              </div>
            </div>
            <div className="setting-list">
              <div className="setting-row">
                <div className="setting-meta">
                  <div className="setting-title">Dark Mode</div>
                  <div className="setting-desc">Switch app colors for day or night use.</div>
                </div>
                <div className="theme-toggle" role="group" aria-label="Theme switcher">
                  <button type="button" className={theme === 'light' ? 'active' : ''} onClick={() => setTheme('light')}>
                    <FiSun />
                    Light
                  </button>
                  <button type="button" className={theme === 'dark' ? 'active' : ''} onClick={() => setTheme('dark')}>
                    <FiMoon />
                    Dark
                  </button>
                </div>
              </div>
            </div>
          </div>

          {passkeySupport?.checked && passkeySupport?.supported ? (
            <div className="section card settings-card">
              <div className="home-card-head">
                <div>
                  <div className="eyebrow">Security</div>
                  <h3>Face ID</h3>
                </div>
              </div>
              <div className="setting-list">
                <div className="setting-row">
                  <div className="setting-meta">
                    <div className="setting-title">Enable Face ID</div>
                    <div className="setting-desc">Use Face ID for faster sign in.</div>
                  </div>
                  <button
                    type="button"
                    className="ghost btn-tone-success btn-with-spinner"
                    onClick={onEnablePasskey}
                    disabled={!passkeySupport?.available || passkeyRegisterBusy || hasRegisteredPasskey}
                  >
                    {passkeyRegisterBusy ? <FiLoader className="btn-spinner" /> : null}
                    {!passkeyRegisterBusy && hasRegisteredPasskey ? <FiCheckCircle /> : null}
                    <span>{passkeyRegisterBusy ? 'Enabling...' : (hasRegisteredPasskey ? 'Enabled' : 'Enable')}</span>
                  </button>
                </div>
                <div className="setting-row" style={{ display: 'block' }}>
                  <div className="setting-meta" style={{ marginBottom: 8 }}>
                    <div className="setting-title">Registered Face IDs</div>
                    <div className="setting-desc">{passkeySupport?.available ? 'You can remove old devices below.' : 'Platform authenticator is not available on this device.'}</div>
                  </div>
                  {passkeysLoading ? <div className="muted">Loading Face ID devices...</div> : null}
                  {!passkeysLoading && !passkeys.length ? <div className="muted">No Face ID registered.</div> : null}
                  {!passkeysLoading && passkeys.length ? (
                    <div className="task-project-scroll" style={{ maxHeight: 220 }}>
                      {passkeys.map((item) => {
                        const id = String(item?.id || '');
                        const createdAt = item?.createdAt ? new Date(item.createdAt).toLocaleString() : '-';
                        const lastUsedAt = item?.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString() : '-';
                        const transport = Array.isArray(item?.transports) && item.transports.length ? item.transports.join(', ') : '-';
                        const deviceType = toTitleCase(item?.deviceType || 'platform');
                        const backedUp = item?.backedUp === true ? 'Yes' : 'No';
                        return (
                          <div key={id} className="task-project-item" style={{ alignItems: 'stretch' }}>
                            <div style={{ width: '100%' }}>
                              <div className="task-project-title passkey-item-title">
                                <FiSmartphone />
                                <span>{passkeyDeviceLabel(item)}</span>
                              </div>
                              <div className="task-project-meta passkey-meta-line">
                                <span className="passkey-chip"><FiKey /> {`Type: ${deviceType}`}</span>
                                <span className="passkey-chip">{`Transport: ${transport}`}</span>
                                <span className="passkey-chip">{`Backed up: ${backedUp}`}</span>
                              </div>
                              <div className="task-project-meta">{`Created: ${createdAt}`}</div>
                              <div className="task-project-meta">{`Last used: ${lastUsedAt}`}</div>
                            </div>
                            <button
                              type="button"
                              className="ghost btn-tone-danger btn-with-spinner"
                              onClick={() => onDeletePasskey(id)}
                              disabled={passkeyDeleteBusyId === id}
                            >
                              {passkeyDeleteBusyId === id ? <FiLoader className="btn-spinner" /> : <FiTrash2 />}
                              <span>{passkeyDeleteBusyId === id ? 'Removing...' : 'Remove'}</span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}

          <div className="section card">
            <div className="profile-actions">
              <button type="button" className="ghost btn-tone-danger" onClick={logout}>
                <FiLogOut />
                Sign out
              </button>
            </div>
          </div>
        </>
      ) : null}

      {isAdminRole && profileTab === 'users' ? (
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
          <div className="prj-filter-group payments-filters-grid finance-payments-filter-grid" style={{ marginBottom: 10 }}>
            <label className="payments-filter-field">
              <span>Search</span>
              <input placeholder="Search by name and surname" value={usersSearch} onChange={(e) => setUsersSearch(e.target.value)} />
            </label>
            <button type="button" className="ghost btn-tone-neutral payments-reset-btn" onClick={() => setUsersSearch('')}>Reset</button>
          </div>
          <div className="fin-tx-list fin-users-admin-list">
            {users.map((item) => (
              <div key={item.id} className={`fin-tx-item fin-user-admin-item${item.isActive ? '' : ' inactive'}`}>
                <div className="fin-tx-main">
                  <span className={`fin-tx-label${item.isActive ? '' : ' inactive'}`}><strong>{item.name} {item.surname}</strong></span>
                  <div className={`fin-user-meta${item.isActive ? '' : ' inactive'}`}>
                    <span className="fin-user-chip email">{`Email: ${item.email || '-'}`}</span>
                    <span className="fin-user-chip role">{`Role: ${item.role || '-'}`}</span>
                    <span className="fin-user-chip method">{`Payment Type: ${String(item?.paymentMethod || item?.paymentOption || '-')}`}</span>
                    <span className="fin-user-chip rate">{`Pay Rate: ${formatUserPaymentRateLabel(item)}`}</span>
                    <span className="fin-user-chip start">
                      {`Start Date: ${item?.startDate || item?.firstEntryAt ? new Date(item.startDate || item.firstEntryAt).toLocaleDateString() : '-'}`}
                    </span>
                    <span className={`fin-user-chip status ${item?.isActive ? 'active' : 'inactive'}`}>{`Status: ${item?.isActive ? 'active' : 'inactive'}`}</span>
                  </div>
                </div>
                {canManageTargetUser(item.role) ? null : <span className="pill">restricted</span>}
                <div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    className="ghost btn-tone-primary btn-with-spinner"
                    onClick={() => openUserSummaryModal(item)}
                    disabled={userSummaryBusyId === String(item.id)}
                  >
                    {userSummaryBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{userSummaryBusyId === String(item.id) ? 'Loading...' : 'Overview'}</span>
                  </button>
                  <button
                    type="button"
                    className="ghost btn-tone-info btn-with-spinner"
                    onClick={() => startEditUser(item)}
                    disabled={userEditBusyId === String(item.id) || !canManageTargetUser(item.role)}
                  >
                    {userEditBusyId === String(item.id) ? <FiLoader className="btn-spinner" /> : null}
                    <span>{userEditBusyId === String(item.id) ? 'Loading...' : 'Edit'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          {!usersLoading && usersCursor ? (
            <button type="button" className="btn-tone-neutral btn-with-spinner" onClick={() => loadUsersData()} disabled={usersLoadMoreBusy}>
              {usersLoadMoreBusy ? <FiLoader className="btn-spinner" /> : null}
              <span>{usersLoadMoreBusy ? 'Loading...' : 'Load more users'}</span>
            </button>
          ) : null}
          {usersLoading && !users.length ? <div className="muted">Loading users...</div> : null}
        </div>
      ) : null}

      <SimpleModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={userEditId ? 'Edit User' : 'Add User'}
      >
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
                  className={`ghost btn-with-spinner ${userEditMeta.isActive ? 'btn-tone-danger' : 'btn-tone-success'}`}
                  onClick={userEditMeta.isActive ? deactivateFromEditModal : activateFromEditModal}
                  disabled={userToggleBusyId === String(userEditId)}
                >
                  {userToggleBusyId === String(userEditId) ? <FiLoader className="btn-spinner" /> : null}
                  <span>{userToggleBusyId === String(userEditId) ? 'Saving...' : (userEditMeta.isActive ? 'Deactivate' : 'Activate')}</span>
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
    </div>
  );
}
