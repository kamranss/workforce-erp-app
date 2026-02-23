const defaultStore = {
  role: '',
  name: '',
  userId: '',
  surname: '',
  email: '',
  paymentOption: '',
  paymentAmount: 0,
  isActive: false,
  token: ''
};

function readStoredAuth() {
  if (typeof localStorage === 'undefined') return { ...defaultStore };
  return {
    ...defaultStore,
    role: localStorage.getItem('ab_role') || '',
    name: localStorage.getItem('ab_name') || '',
    userId: localStorage.getItem('ab_userId') || '',
    surname: localStorage.getItem('ab_surname') || '',
    email: localStorage.getItem('ab_email') || '',
    paymentOption: localStorage.getItem('ab_paymentOption') || '',
    paymentAmount: Number(localStorage.getItem('ab_paymentAmount') || 0),
    isActive: localStorage.getItem('ab_isActive') === '1',
    token: localStorage.getItem('auth_token') || ''
  };
}

function writeStoredAuth(next) {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('ab_role', next.role || '');
  localStorage.setItem('ab_name', next.name || '');
  localStorage.setItem('ab_userId', next.userId || '');
  localStorage.setItem('ab_surname', next.surname || '');
  localStorage.setItem('ab_email', next.email || '');
  localStorage.setItem('ab_paymentOption', next.paymentOption || '');
  localStorage.setItem('ab_paymentAmount', String(Number(next.paymentAmount || 0)));
  localStorage.setItem('ab_isActive', next.isActive ? '1' : '0');
  if (next.token) {
    localStorage.setItem('auth_token', next.token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export const store = (() => {
  if (typeof window === 'undefined') return { ...defaultStore };
  if (!window.__ARCHBUILD_STORE__) {
    window.__ARCHBUILD_STORE__ = readStoredAuth();
  }
  return window.__ARCHBUILD_STORE__;
})();

const listeners = new Set();

export function setStore(patch) {
  Object.assign(store, patch || {});
  writeStoredAuth(store);
  listeners.forEach((fn) => fn(store));
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearStoredAuth() {
  if (typeof localStorage === 'undefined') return;
  [
    'ab_role',
    'ab_name',
    'ab_userId',
    'ab_surname',
    'ab_email',
    'ab_paymentOption',
    'ab_paymentAmount',
    'ab_isActive',
    'auth_token'
  ].forEach((key) => localStorage.removeItem(key));
}

export function clearInMemoryAuth() {
  Object.assign(store, defaultStore);
  writeStoredAuth(store);
  listeners.forEach((fn) => fn(store));
}

export const PASSKEY_ENROLLED_KEY = 'ab_passkey_enrolled';
