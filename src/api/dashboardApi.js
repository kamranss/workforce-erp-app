import { request } from './httpClient.js';

export function dashboardToday() {
  return request('/api/dashboard/today');
}

export function dashboardOpenEntries(query) {
  return request('/api/dashboard/open-entries', { query });
}
