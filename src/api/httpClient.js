import { clearQueryCache, getCachedQuery, invalidateQueryCacheByTags, setCachedQuery } from './queryCache.js';

const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL
  || process.env.NEXT_PUBLIC_API_URL
  || process.env.NEXT_PUBLIC_BACKEND_URL
  || ''
).trim();
const DEFAULT_TIMEOUT_MS = 18000;
const DEV_NETWORK_LOG = process.env.NODE_ENV !== 'production';
const TOKEN_KEY = 'auth_token';
const inFlightGetRequests = new Map();
let pendingRequestCount = 0;

function emitNetworkActivity() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('ab:network-activity', {
    detail: {
      pending: pendingRequestCount,
      active: pendingRequestCount > 0
    }
  }));
}

function withBase(path) {
  const safePath = String(path || '');
  if (!API_BASE_URL) return safePath;
  const base = API_BASE_URL.replace(/\/+$/, '');
  const nextPath = safePath.startsWith('/') ? safePath : `/${safePath}`;
  return `${base}${nextPath}`;
}

function getPathname(rawUrl) {
  try {
    return new URL(rawUrl, 'http://localhost').pathname || '';
  } catch {
    return '';
  }
}

function getDefaultTtlMs(pathname) {
  if (!pathname) return 0;
  if (pathname === '/api/auth/me') return 15000;
  if (pathname.startsWith('/api/dashboard/')) return 45000;
  if (pathname.startsWith('/api/tasks')) return 45000;
  if (pathname.startsWith('/api/time-entries/hours-report')) return 45000;
  if (pathname.startsWith('/api/projects/status-counts')) return 45000;
  if (pathname.startsWith('/api/projects')) return 45000;
  if (pathname.startsWith('/api/reports/projects-finance-overview')) return 45000;
  if (pathname.startsWith('/api/reports/me')) return 15000;
  if (pathname.startsWith('/api/reports/')) return 45000;
  if (pathname.startsWith('/api/payments')) return 45000;
  if (pathname.startsWith('/api/customer-payments')) return 45000;
  if (pathname.startsWith('/api/bonus-and-penalties')) return 45000;
  if (pathname.startsWith('/api/expenses')) return 45000;
  if (pathname.startsWith('/api/users')) return 45000;
  return 0;
}

function getReadTags(pathname) {
  if (!pathname) return [];
  if (pathname.startsWith('/api/auth/me')) return ['auth', 'reports'];
  if (pathname.startsWith('/api/dashboard/')) return ['dashboard'];
  if (pathname.startsWith('/api/time-entries')) return ['hours', 'dashboard', 'reports', 'time-entries'];
  if (pathname.startsWith('/api/projects')) return ['projects', 'reports', 'dashboard'];
  if (pathname.startsWith('/api/reports/')) return ['reports', 'dashboard', 'finance', 'hours'];
  if (pathname.startsWith('/api/payments')) return ['payments', 'finance', 'reports'];
  if (pathname.startsWith('/api/customer-payments')) return ['customer-payments', 'finance', 'reports'];
  if (pathname.startsWith('/api/bonus-and-penalties')) return ['bonuses', 'finance', 'reports'];
  if (pathname.startsWith('/api/expenses')) return ['expenses', 'finance', 'reports'];
  if (pathname.startsWith('/api/users')) return ['users', 'reports', 'finance'];
  return [];
}

function getMutationInvalidationTags(pathname) {
  if (!pathname) return [];
  if (pathname.startsWith('/api/projects')) return ['projects', 'reports', 'dashboard', 'finance'];
  if (pathname.startsWith('/api/time-entries')) return ['hours', 'dashboard', 'reports', 'time-entries'];
  if (pathname.startsWith('/api/payments')) return ['payments', 'finance', 'reports'];
  if (pathname.startsWith('/api/customer-payments')) return ['customer-payments', 'finance', 'reports'];
  if (pathname.startsWith('/api/bonus-and-penalties')) return ['bonuses', 'finance', 'reports'];
  if (pathname.startsWith('/api/expenses')) return ['expenses', 'finance', 'reports'];
  if (pathname.startsWith('/api/users')) return ['users', 'reports', 'finance', 'dashboard'];
  if (pathname.startsWith('/api/tasks')) return ['tasks', 'dashboard'];
  if (pathname.startsWith('/api/auth/')) return ['auth', 'reports', 'dashboard', 'hours', 'projects', 'finance', 'users'];
  return [];
}

function toApiError({
  status = 0,
  message = 'Request failed',
  code = '',
  details = undefined,
  data = undefined,
  url = '',
  method = 'GET',
  timeout = false
}) {
  const error = new Error(message);
  error.status = status;
  error.code = code || (status ? `HTTP_${status}` : 'NETWORK_ERROR');
  error.details = details;
  error.data = data;
  error.url = url;
  error.method = method;
  error.timeout = timeout;
  return error;
}

export function getStoredToken() {
  if (typeof localStorage === 'undefined') return '';
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setStoredToken(token) {
  if (typeof localStorage === 'undefined') return;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    clearQueryCache();
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  clearQueryCache();
}

function buildQuery(query) {
  const params = new URLSearchParams();
  Object.entries(query || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  const out = params.toString();
  return out ? `?${out}` : '';
}

export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    query,
    auth = true,
    headers = {},
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cacheTtlMs = undefined,
    cache = true
  } = options;

  const finalHeaders = {
    'Content-Type': 'application/json',
    ...headers
  };

  if (!body) {
    delete finalHeaders['Content-Type'];
  }

  if (auth) {
    const token = getStoredToken();
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`;
    }
  }

  const url = withBase(`${path}${buildQuery(query)}`);
  const pathname = getPathname(url);
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const isGet = normalizedMethod === 'GET';
  const isOptions = normalizedMethod === 'OPTIONS';
  const isIdempotentGet = isGet && !isOptions;
  const authKey = finalHeaders.Authorization || '';
  const dedupeKey = `${normalizedMethod}::${url}::${authKey}`;
  const ttlMs = isGet ? (Number.isFinite(cacheTtlMs) ? cacheTtlMs : getDefaultTtlMs(pathname)) : 0;
  const readTags = getReadTags(pathname);

  const execute = async (attempt = 0) => {
    pendingRequestCount += 1;
    emitNetworkActivity();
    try {
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutHandle = controller ? setTimeout(() => controller.abort(), Math.max(1, Number(timeoutMs) || DEFAULT_TIMEOUT_MS)) : null;
      if (DEV_NETWORK_LOG) {
        console.debug('[api] fired', normalizedMethod, url);
      }
      let res;
      try {
        res = await fetch(url, {
          method: normalizedMethod,
          headers: finalHeaders,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller?.signal
        });
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }

      const json = await res.json().catch(() => ({}));

      if (!res.ok || json?.ok === false) {
        const error = toApiError({
          status: res.status,
          message: json?.error?.message || json?.error || `Request failed: ${res.status}`,
          code: json?.error?.code || `HTTP_${res.status}`,
          details: json?.error?.details,
          data: json,
          url,
          method: normalizedMethod
        });

        if (res.status === 401) {
          setStoredToken('');
        }

        throw error;
      }

      const data = json?.data;
      if (isGet && cache !== false && ttlMs > 0) {
        setCachedQuery(dedupeKey, data, ttlMs, readTags);
      }
      if (!isGet) {
        const invalidateTags = getMutationInvalidationTags(pathname);
        if (invalidateTags.length) invalidateQueryCacheByTags(invalidateTags);
      }
      return data;
    } catch (err) {
      const timeout = err?.name === 'AbortError';
      const normalized = err?.status != null ? err : toApiError({
        status: 0,
        message: timeout ? 'Request timeout' : (err?.message || 'Network error'),
        code: timeout ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
        data: undefined,
        url,
        method: normalizedMethod,
        timeout
      });
      const canRetry =
        attempt < 1
        && isIdempotentGet
        && normalized.status === 0
        && !normalized.timeout;
      if (canRetry) {
        return execute(attempt + 1);
      }
      throw normalized;
    } finally {
      pendingRequestCount = Math.max(0, pendingRequestCount - 1);
      emitNetworkActivity();
    }
  };

  if (isGet && cache !== false && ttlMs > 0) {
    const cached = getCachedQuery(dedupeKey);
    if (cached !== undefined) return cached;
  }

  // Deduplicate identical in-flight GET requests to avoid double network calls.
  // Skip dedupe when cache is disabled so callers can force a fresh fetch.
  if (isGet && cache !== false) {
    const existing = inFlightGetRequests.get(dedupeKey);
    if (existing) return existing;
    const next = execute().finally(() => {
      inFlightGetRequests.delete(dedupeKey);
    });
    inFlightGetRequests.set(dedupeKey, next);
    return next;
  }

  return execute();
}

export function invalidateApiCache(tags = []) {
  invalidateQueryCacheByTags(tags);
}
