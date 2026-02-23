import { request } from './httpClient.js';

export function listPayments(query) {
  return request('/api/payments', { query });
}

export function createPayment(body) {
  return request('/api/payments', { method: 'POST', body });
}

export function updatePayment(id, body) {
  return request('/api/payments/id', { method: 'PATCH', query: { id }, body });
}

export function getPayment(id) {
  return request('/api/payments/id', { query: { id } });
}

export function deletePayment(id) {
  return request('/api/payments/id', { method: 'DELETE', query: { id } });
}
