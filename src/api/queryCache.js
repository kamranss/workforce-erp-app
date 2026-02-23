const cacheStore = new Map();

function now() {
  return Date.now();
}

export function getCachedQuery(key) {
  if (!key) return undefined;
  const entry = cacheStore.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= now()) {
    cacheStore.delete(key);
    return undefined;
  }
  return entry.value;
}

export function setCachedQuery(key, value, ttlMs, tags = []) {
  if (!key || !Number.isFinite(ttlMs) || ttlMs <= 0) return;
  cacheStore.set(key, {
    value,
    expiresAt: now() + ttlMs,
    tags: new Set((tags || []).filter(Boolean))
  });
}

export function invalidateQueryCacheByTags(tags = []) {
  const wanted = new Set((tags || []).filter(Boolean));
  if (!wanted.size) return;
  for (const [key, entry] of cacheStore.entries()) {
    const hit = Array.from(entry.tags || []).some((tag) => wanted.has(tag));
    if (hit) cacheStore.delete(key);
  }
}

export function clearQueryCache() {
  cacheStore.clear();
}

