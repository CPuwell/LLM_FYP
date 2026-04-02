export const asString = (v) => (v ?? '').toString();

export const trimTo = (v, maxLen) => {
  const s = asString(v).trim();
  if (!Number.isFinite(maxLen) || maxLen <= 0) return s;
  return s.length > maxLen ? s.slice(0, maxLen) : s;
};

export const clampInt = (v, min, max, fallback) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
};

