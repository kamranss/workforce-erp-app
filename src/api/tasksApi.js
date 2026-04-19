import { request } from './httpClient.js';

export function listTasks(query, options = {}) {
  return request('/api/tasks', { query, ...options });
}

export function createTask(body) {
  return request('/api/tasks', { method: 'POST', body });
}

export function getTask(id) {
  return request('/api/tasks/id', { query: { id } });
}

export function updateTask(id, body) {
  return request('/api/tasks/id', { method: 'PATCH', query: { id }, body });
}

export function deleteTask(id) {
  return request('/api/tasks/id', { method: 'DELETE', query: { id } });
}

export function myTasks(query, options = {}) {
  return request('/api/tasks/my-assigned', { query, ...options });
}

export function updateMyAssignedTaskStatus(id, body) {
  return request('/api/tasks/my-assigned-status', { method: 'PATCH', query: { id }, body });
}

export function toggleTaskTodo(id, body) {
  return request('/api/tasks/todo-toggle', { method: 'POST', query: { id }, body });
}
