import { getApiBaseUrl } from './apiBaseUrl.js';

export const getDisplayImageUrl = (url) => {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:')) return trimmed;
  const apiBaseUrl = getApiBaseUrl();
  if (trimmed.startsWith('/')) {
    if (!apiBaseUrl) return trimmed;
    if (trimmed.startsWith('/api/') || trimmed.startsWith('/generated/')) return `${apiBaseUrl}${trimmed}`;
    return trimmed;
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const u = new URL(trimmed);
      if (u.pathname.startsWith('/generated/')) return u.toString();
    } catch {
    }
    if (apiBaseUrl) return `${apiBaseUrl}/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
    return `/api/proxy-image?url=${encodeURIComponent(trimmed)}`;
  }
  return trimmed;
};
