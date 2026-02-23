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
