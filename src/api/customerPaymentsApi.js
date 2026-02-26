import { request } from './httpClient.js';

export function listCustomerPayments(query) {
  return request('/api/customer-payments', { query });
}

export function createCustomerPayment(body) {
  return request('/api/customer-payments', { method: 'POST', body });
}

export function getCustomerPayment(id) {
  return request('/api/customer-payments/id', { query: { id } });
}

export function updateCustomerPayment(id, body) {
  return request('/api/customer-payments/id', { method: 'PATCH', query: { id }, body });
}

export function deleteCustomerPayment(id) {
  return request('/api/customer-payments/id', { method: 'DELETE', query: { id } });
}
