export const getApiBaseUrl = () => {
  const env = (import.meta.env.VITE_API_BASE_URL || '').toString().trim();
  if (env) return env.replace(/\/$/, '');
  try {
    const proto = window.location.protocol;
    if (proto === 'file:') return 'http://localhost:3001';
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') return 'http://localhost:3001';
  } catch {
    // Browser location access can fail in unusual embedded contexts.
  }
  return '';
};
