const STORAGE_KEY = 'userGeminiApiKey';

export const getUserGeminiApiKey = () => {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (typeof v !== 'string') return '';
    const t = v.trim();
    return t ? t : '';
  } catch {
    return '';
  }
};

export const setUserGeminiApiKey = (key) => {
  const v = (key ?? '').toString().trim();
  try {
    if (!v) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, v);
  } catch {
    return;
  }
};

export const clearUserGeminiApiKey = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    return;
  }
};

export const buildGeminiKeyHeader = () => {
  const key = getUserGeminiApiKey();
  return key ? { 'X-Gemini-Api-Key': key } : {};
};
