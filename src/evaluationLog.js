const STORAGE_KEY = 'evaluationLogs';
const SESSION_KEY = 'evaluationSessionId';

const notifyUpdate = () => {
  try {
    window.dispatchEvent(new Event('evaluationLogsUpdated'));
  } catch {
    // Event dispatch is best-effort in non-browser test contexts.
  }
};

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const getOrCreateSessionId = () => {
  const existing = localStorage.getItem(SESSION_KEY);
  if (existing) return existing;
  const id = `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(SESSION_KEY, id);
  return id;
};

export const resetEvaluationSession = () => {
  localStorage.removeItem(SESSION_KEY);
  const next = getOrCreateSessionId();
  notifyUpdate();
  return next;
};

export const getEvaluationSessionId = () => getOrCreateSessionId();

export const getEvaluationLogs = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeJsonParse(raw || '[]', []);
  return Array.isArray(parsed) ? parsed : [];
};

export const clearEvaluationLogs = () => {
  localStorage.removeItem(STORAGE_KEY);
  notifyUpdate();
};

export const appendEvaluationLog = (entry) => {
  const logs = getEvaluationLogs();
  const safeEntry = entry && typeof entry === 'object' ? entry : { value: entry };
  const next = [
    ...logs,
    {
      ts: new Date().toISOString(),
      sessionId: getOrCreateSessionId(),
      ...safeEntry,
    },
  ].slice(-2000);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyUpdate();
  return next;
};
