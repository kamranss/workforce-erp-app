import { request } from './httpClient.js';

export function checkIn(body) {
  return request('/api/time-entries/check-in', { method: 'POST', body });
}

export function checkOut(body) {
  return request('/api/time-entries/check-out', { method: 'POST', body });
}

export function listTimeEntries(query) {
  return request('/api/time-entries', { query });
}

export function getTimeEntry(id, includeDeleted) {
  return request('/api/time-entries/id', { query: { id, includeDeleted } });
}

export function patchTimeEntry(id, body) {
  return request('/api/time-entries/id', { method: 'PATCH', query: { id }, body });
}

export function deleteTimeEntry(id) {
  return request('/api/time-entries/id', { method: 'DELETE', query: { id } });
}

export function adminCreateTimeEntry(body) {
  return request('/api/time-entries/admin-create', { method: 'POST', body });
}

export function adminAddHours(body) {
  return request('/api/time-entries/admin-add-hours', { method: 'POST', body });
}

export function myOpenEntry() {
  return request('/api/time-entries/my-open');
}

export function myRecentEntries(query) {
  return request('/api/time-entries/my-recent', { query });
}

export function hoursReport(query) {
  return request('/api/time-entries/hours-report', { query });
}
