import { request } from './httpClient.js';

export function listExpenses(query) {
  return request('/api/expenses', { query });
}

export function createExpense(body) {
  return request('/api/expenses', { method: 'POST', body });
}

export function updateExpense(id, body) {
  return request('/api/expenses/id', { method: 'PATCH', query: { id }, body });
}

export function deleteExpense(id) {
  return request('/api/expenses/id', { method: 'DELETE', query: { id } });
}
