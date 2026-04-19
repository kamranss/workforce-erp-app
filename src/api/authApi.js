import { getStoredToken, request } from './httpClient.js';

export function login(passCode) {
  return request('/api/auth/login', {
    method: 'POST',
    auth: false,
    body: { passCode }
  });
}

export function me() {
  if (!getStoredToken()) {
    const err = new Error('No auth token');
    err.status = 401;
    err.code = 'NO_TOKEN';
    return Promise.reject(err);
  }
  return request('/api/auth/me');
}

export function passkeyRegisterOptions() {
  return request('/api/auth/passkey/register/options', {
    method: 'POST',
    body: {}
  });
}

export function passkeyRegisterVerify(credential) {
  return request('/api/auth/passkey/register/verify', {
    method: 'POST',
    body: { credential }
  });
}

export function passkeyLoginOptions() {
  return request('/api/auth/passkey/login/options', {
    method: 'POST',
    auth: false,
    body: {}
  });
}

export function passkeyLoginVerify(credential) {
  return request('/api/auth/passkey/login/verify', {
    method: 'POST',
    auth: false,
    body: { credential }
  });
}

export function passkeyList() {
  return request('/api/auth/passkey/list');
}

export function passkeyDelete(id) {
  return request('/api/auth/passkey', {
    method: 'DELETE',
    query: { id }
  });
}
