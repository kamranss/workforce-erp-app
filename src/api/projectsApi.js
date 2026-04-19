import { request } from './httpClient.js';

export function listProjects(query) {
  return request('/api/projects', { query });
}

export function searchProjectsForExpenses(query) {
  return request('/api/projects/search-for-expenses', { query });
}

export function projectStatusCounts() {
  return request('/api/projects/status-counts');
}

export function listCheckInEligibleProjects(query) {
  return request('/api/projects/ongoing', { query });
}

export function listOngoingProjects(query) {
  return listCheckInEligibleProjects(query);
}

export function listActiveProjects(query) {
  return request('/api/projects/active', { query });
}

export function createProject(body) {
  return request('/api/projects', { method: 'POST', body });
}

export function getProject(id) {
  return request('/api/projects/id', { query: { id } });
}

export function updateProject(id, body) {
  return request('/api/projects/id', { method: 'PATCH', query: { id }, body });
}

export function deleteProject(id) {
  return request('/api/projects/id', { method: 'DELETE', query: { id } });
}
