import { request } from './httpClient.js';

export function userSummary(query) {
  return request('/api/reports/user-summary', { query });
}

export function projectSummary(query) {
  return request('/api/reports/project-summary', { query });
}

export function myReport(query) {
  return request('/api/reports/me', { query });
}

export function myEarnings(query) {
  return request('/api/reports/me-earnings', { query });
}

export function projectUserBreakdown(query) {
  return request('/api/reports/project-user-breakdown', { query });
}

export function projectsFinanceOverview(query) {
  return request('/api/reports/projects-finance-overview', { query });
}

export function userLiability(query) {
  return request('/api/reports/user-liability', { query });
}
