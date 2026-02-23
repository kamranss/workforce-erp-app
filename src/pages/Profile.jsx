import { useEffect, useState } from 'react';
import { FiClock, FiDollarSign, FiLoader, FiLogOut, FiMoon, FiShield, FiSun, FiUser } from 'react-icons/fi';
import { myReport } from '../api/reportsApi.js';
import { useAuth } from '../context/AuthProvider.jsx';
import { useAuthActions } from '../context/AuthActionsProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

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

export default function Profile() {
  const { activeTab, showToast, refreshTick, showGlobalLoader, theme, setTheme } = useUI();
  const { logout } = useAuthActions();
  const { user, role } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const isActive = activeTab === 'profile';
  const roleLower = String(role || '').toLowerCase();
  const isAdminRole = roleLower === 'admin' || roleLower === 'superadmin';
  const hideTotalsForRole = roleLower === 'user' || roleLower === 'employee';

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

  if (!isActive) return <div id="profilePage" className="tab-page hidden" />;
  const totals = resolveReportTotals(report || {});

  return (
    <div id="profilePage" className="tab-page active">
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

      <div className="section card">
        <div className="profile-actions">
          <button type="button" className="ghost btn-tone-danger" onClick={logout}>
            <FiLogOut />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
