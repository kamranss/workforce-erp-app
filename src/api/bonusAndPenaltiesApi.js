import { request } from './httpClient.js';

export function listBonuses(query) {
  return request('/api/bonus-and-penalties', { query });
}

export function createBonus(body) {
  return request('/api/bonus-and-penalties', { method: 'POST', body });
}

export function updateBonus(id, body) {
  return request('/api/bonus-and-penalties/id', { method: 'PATCH', query: { id }, body });
}

export function getBonus(id) {
  return request('/api/bonus-and-penalties/id', { query: { id } });
}

export function deleteBonus(id) {
  return request('/api/bonus-and-penalties/id', { method: 'DELETE', query: { id } });
}
