
import { useEffect, useRef, useState } from 'react';
import { FiEdit2, FiLoader, FiNavigation, FiPhone, FiPlusCircle } from 'react-icons/fi';
import { createCustomer, listCustomers, updateCustomer } from '../api/customersApi.js';
import { createProject, deleteProject, listProjects, projectStatusCounts, updateProject } from '../api/projectsApi.js';
import SimpleModal from '../components/SimpleModal.jsx';
import { useAuth } from '../context/AuthProvider.jsx';
import { useUI } from '../context/UIProvider.jsx';

const EMPTY_PROJECT_FORM = {
  description: '',
  addressRaw: '',
  estimatedStartAt: '',
  quoteAmount: '',
  customerId: '',
  materials: '',
  advancedOpen: false,
  locationKey: '',
  geoLat: '',
  geoLng: '',
  geoRadiusMeters: '500'
};

const EMPTY_CUSTOMER_FORM = {
  fullName: '',
  address: '',
  email: '',
  phone: ''
};

const STATUS_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'waiting', label: 'Waiting' },
  { value: 'ongoing', label: 'Ongoing' },
  { value: 'finished', label: 'Finished' },
  { value: 'canceled', label: 'Canceled' }
];

function toStatusLabel(status) {
  const key = String(status || '').toLowerCase();
  if (key === 'ongoing') return 'Started';
  if (key === 'finished') return 'Completed';
  if (key === 'canceled') return 'Rejected';
  return 'Waiting';
}

function buildDirectionsHref(address) {
  const raw = String(address || '').trim();
  if (!raw) return '';
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(raw)}`;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

export default function Projects() {
  const { activeTab, showToast, refreshTick, showGlobalLoader } = useUI();
  const { role } = useAuth();

  const [pageTab, setPageTab] = useState('projects');

  const [projects, setProjects] = useState([]);
  const [projectsCursor, setProjectsCursor] = useState(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [counts, setCounts] = useState({ waiting: 0, ongoing: 0 });
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCustomerId, setFilterCustomerId] = useState('');
  const [query, setQuery] = useState('');

  const [customers, setCustomers] = useState([]);
  const [customersCursor, setCustomersCursor] = useState(null);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');

  const [projectForm, setProjectForm] = useState(EMPTY_PROJECT_FORM);
  const [projectFormError, setProjectFormError] = useState('');
  const [editProjectId, setEditProjectId] = useState('');
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);

  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerSaving, setCustomerSaving] = useState(false);
  const [customerForm, setCustomerForm] = useState(EMPTY_CUSTOMER_FORM);
  const [editCustomerId, setEditCustomerId] = useState('');

  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusSaving, setStatusSaving] = useState(false);
  const [statusTargetProject, setStatusTargetProject] = useState(null);
  const [statusValue, setStatusValue] = useState('waiting');

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
        status: filterStatus || undefined,
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
      setCounts({
        waiting: Number(data?.waiting || 0),
        ongoing: Number(data?.ongoing || 0)
      });
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
    setProjectForm(EMPTY_PROJECT_FORM);
    setProjectFormError('');
    setProjectModalOpen(true);
  };

  const startEditProject = (project) => {
    setEditProjectId(project.id);
    setProjectForm({
      description: project.description || '',
      addressRaw: project.address?.raw || '',
      estimatedStartAt: project.estimatedStartAt ? String(project.estimatedStartAt).slice(0, 10) : '',
      quoteAmount: project.quoteAmount ?? '',
      customerId: project.customer?.id || project.customerId || '',
      materials: project.materials || '',
      locationKey: project.locationKey || '',
      geoLat: project.geo?.lat ?? '',
      geoLng: project.geo?.lng ?? '',
      geoRadiusMeters: project.geoRadiusMeters ?? 500,
      advancedOpen: false
    });
    setProjectFormError('');
    setProjectModalOpen(true);
  };

  const saveProject = async () => {
    if (projectSaving) return;
    const description = String(projectForm.description || '').trim();
    const addressRaw = String(projectForm.addressRaw || '').trim();
    const quoteAmount = projectForm.quoteAmount === '' ? undefined : Number(projectForm.quoteAmount);
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

    const body = {
      description,
      address: { raw: addressRaw },
      estimatedStartAt: projectForm.estimatedStartAt ? new Date(projectForm.estimatedStartAt).toISOString() : undefined,
      quoteAmount,
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

  const onDeleteProject = async (id) => {
    if (!canDelete) return;
    if (!confirm('Soft delete this project?')) return;
    try {
      await deleteProject(id);
      await Promise.all([loadProjects({ reset: true }), loadCounts()]);
      showToast('Project deactivated.');
    } catch (err) {
      showToast(err?.message || 'Delete failed.');
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
                  <div className="prj-summary-total"><div className="prj-total-label">Count</div><div className="prj-total-value">{projects.length}</div></div>
                  <button type="button" className="ghost btn-tone-primary" onClick={openNewProjectModal}><FiPlusCircle />New Project</button>
                </div>
              </div>
              <div className="home-personal-grid" style={{ marginBottom: 10 }}>
                <div className="metric"><span className="metric-label">Waiting Projects</span><span className="metric-value">{counts.waiting}</span></div>
                <div className="metric"><span className="metric-label">Ongoing Projects</span><span className="metric-value">{counts.ongoing}</span></div>
              </div>
              <div className="prj-filters-panel">
                <div className="prj-filter-group prj-filter-group-compact">
                  <input id="prjFilter" className="prj-search" placeholder="Search by project description or address" value={query} onChange={(e) => setQuery(e.target.value)} />
                  <select id="prjStatus" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} aria-label="Project status filter">
                    {STATUS_OPTIONS.map((opt) => <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>)}
                  </select>
                  <select value={filterCustomerId} onChange={(e) => setFilterCustomerId(e.target.value)} aria-label="Customer filter">
                    <option value="">All customers</option>
                    {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName || customer.id}</option>)}
                  </select>
                  <button type="button" className="btn-tone-neutral" onClick={() => { setFilterStatus(''); setFilterCustomerId(''); setQuery(''); }}>Clear</button>
                </div>
              </div>
            </div>

            <div id="prjList" style={{ marginTop: 14 }}>
              {projects.map((project) => {
                const statusLabel = toStatusLabel(project.status);
                const addressRaw = String(project.address?.raw || '').trim();
                const directionsHref = buildDirectionsHref(addressRaw);
                const customer = project.customer || {};
                return (
                  <div key={project.id} className="prj-item" data-status={statusLabel}>
                    <div className="prj-row1"><div className="prj-title">{project.description || 'Untitled project'}</div><span className={`pill ${statusLabel}`}>{statusLabel}</span></div>
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
                        {(customer.phone || project.clientPhone) ? <div className="prj-client-line"><strong>Phone:</strong> {customer.phone || project.clientPhone}</div> : null}
                        {(customer.email || project.clientEmail) ? <div className="prj-client-line"><strong>Email:</strong> <a href={`mailto:${customer.email || project.clientEmail}`}>{customer.email || project.clientEmail}</a></div> : null}
                        {customer.address ? <div className="prj-client-line"><strong>Address:</strong> {customer.address}</div> : null}
                      </div>
                    ) : null}
                    {project.materials ? <div className="prj-client-block"><div className="prj-client-line"><strong>Materials:</strong> {project.materials}</div></div> : null}
                    <div className="prj-actions">
                      <div className="prj-amount">{project.quoteAmount ? `$${Number(project.quoteAmount).toFixed(2)}` : '$0.00'}</div>
                      <div className="prj-action-buttons">
                        <button type="button" className="ghost btn-tone-warning" onClick={() => startEditProject(project)}>Edit</button>
                        <button type="button" className="ghost btn-tone-danger" onClick={() => onDeleteProject(project.id)} disabled={!canDelete} title={canDelete ? 'Delete project' : 'Only super admin can delete'}>Delete</button>
                        <button type="button" className="ghost btn-tone-success" onClick={() => openStatusModal(project)}>Status</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {!projects.length && !projectsLoading ? <div className="muted">No projects found.</div> : null}
            {projectsLoading && !projects.length ? <div className="muted">Loading...</div> : null}
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

      <SimpleModal open={projectModalOpen} onClose={() => { if (!projectSaving) setProjectModalOpen(false); }} title={editProjectId ? 'Edit Project' : 'New Project'}>
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
          <select
            className="full"
            value={projectForm.customerId}
            onChange={(e) => {
              const nextCustomerId = e.target.value;
              const selectedCustomer = customers.find((customer) => String(customer?.id || '') === String(nextCustomerId));
              setProjectForm((prev) => ({
                ...prev,
                customerId: nextCustomerId,
                addressRaw: selectedCustomer?.address ? selectedCustomer.address : prev.addressRaw
              }));
            }}
          >
            <option value="">No customer</option>
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.fullName || customer.id}</option>)}
          </select>
          <div className="full row" style={{ justifyContent: 'flex-end' }}><button type="button" className="ghost btn-tone-info" onClick={openNewCustomerModal}>+ New Customer</button></div>
          <textarea className="full" rows={3} placeholder="Materials (optional)" value={projectForm.materials} onChange={(e) => setProjectForm((prev) => ({ ...prev, materials: e.target.value }))} disabled={projectSaving} />
          <div className="full"><button type="button" className="ghost btn-tone-purple" onClick={() => setProjectForm((prev) => ({ ...prev, advancedOpen: !prev.advancedOpen }))} disabled={projectSaving}>{projectForm.advancedOpen ? 'Hide advanced' : 'Show advanced'}</button></div>
          {projectForm.advancedOpen ? (
            <>
              <input placeholder="Location key (override)" value={projectForm.locationKey} onChange={(e) => setProjectForm((prev) => ({ ...prev, locationKey: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo lat (override)" value={projectForm.geoLat} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoLat: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo lng (override)" value={projectForm.geoLng} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoLng: e.target.value }))} disabled={projectSaving} />
              <input placeholder="Geo radius m (override)" value={projectForm.geoRadiusMeters} onChange={(e) => setProjectForm((prev) => ({ ...prev, geoRadiusMeters: e.target.value }))} disabled={projectSaving} />
            </>
          ) : null}
          {projectFormError ? <div className="full muted">{projectFormError}</div> : null}
          <div className="full row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="ghost btn-tone-neutral" onClick={() => setProjectModalOpen(false)} disabled={projectSaving}>Cancel</button>
            <button type="button" className="btn-tone-primary btn-with-spinner" onClick={saveProject} disabled={projectSaving}>{projectSaving ? <FiLoader className="btn-spinner" /> : null}<span>{projectSaving ? 'Saving...' : (editProjectId ? 'Update' : 'Create')}</span></button>
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
            {STATUS_OPTIONS.filter((opt) => opt.value).map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
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
