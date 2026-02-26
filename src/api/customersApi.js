import { request } from './httpClient.js';

export function listCustomers(query) {
  return request('/api/customers', { query });
}

export function searchCustomersForProjectPicker(query) {
  return request('/api/customers/search-for-project-picker', { query });
}

export function createCustomer(body) {
  return request('/api/customers', { method: 'POST', body });
}

export function updateCustomer(id, body) {
  return request('/api/customers/id', { method: 'PATCH', query: { id }, body });
}
