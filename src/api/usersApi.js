import { request } from './httpClient.js';

export function listUsers(query) {
  return request('/api/users', { query });
}

export function createUser(body) {
  return request('/api/users', { method: 'POST', body });
}

export function getUser(id) {
  return request('/api/users/id', { query: { id } });
}

export function updateUser(id, body) {
  return request('/api/users/id', { method: 'PATCH', query: { id }, body });
}

export function deactivateUser(id) {
  return request('/api/users/id', { method: 'DELETE', query: { id } });
}
