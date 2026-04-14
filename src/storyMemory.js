const STORAGE_KEY = 'storyMemory';

const safeJsonParse = (raw, fallback) => {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
};

const defaultMemory = () => ({
  version: 2,
  runId: `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`,
  summary: '',
  facts: [],
  lastProcessedLogTs: '',
  updatedAt: '',
});

const normalizeFact = (f) => {
  if (typeof f === 'string') {
    const t = f.trim();
    if (!t) return null;
    return { text: t.slice(0, 180), topic: '', entity: '' };
  }
  if (!f || typeof f !== 'object') return null;
  const text = typeof f.text === 'string' ? f.text.trim().slice(0, 180) : '';
  if (!text) return null;
  const topic = typeof f.topic === 'string' ? f.topic.trim().slice(0, 40) : '';
  const entity = typeof f.entity === 'string' ? f.entity.trim().slice(0, 80) : '';
  return { text, topic, entity };
};

const tokenize = (s) => (s || '')
  .toString()
  .toLowerCase()
  .split(/[^a-z0-9]+/g)
  .filter((w) => w.length >= 4);

export const getStoryMemory = () => {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = safeJsonParse(raw || 'null', null);
  if (!parsed || typeof parsed !== 'object') return defaultMemory();
  const summary = typeof parsed.summary === 'string' ? parsed.summary : '';
  const facts = Array.isArray(parsed.facts)
    ? parsed.facts.map(normalizeFact).filter(Boolean).slice(0, 20)
    : [];
  return {
    version: 2,
    runId: typeof parsed.runId === 'string' && parsed.runId ? parsed.runId : defaultMemory().runId,
    summary: summary.trim().slice(0, 2000),
    facts,
    lastProcessedLogTs: typeof parsed.lastProcessedLogTs === 'string' ? parsed.lastProcessedLogTs : '',
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
  };
};

export const setStoryMemory = (memory) => {
  const src = memory && typeof memory === 'object' ? memory : {};
  const prev = getStoryMemory();
  const next = {
    ...prev,
    version: 2,
    summary: typeof src.summary === 'string' ? src.summary.trim().slice(0, 2000) : prev.summary,
    facts: Array.isArray(src.facts)
      ? src.facts.map(normalizeFact).filter(Boolean).slice(0, 20)
      : prev.facts,
    lastProcessedLogTs: typeof src.lastProcessedLogTs === 'string' ? src.lastProcessedLogTs : prev.lastProcessedLogTs,
    updatedAt: new Date().toISOString(),
    runId: typeof src.runId === 'string' && src.runId ? src.runId : prev.runId,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const resetStoryMemory = () => {
  const next = defaultMemory();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
};

export const pickMemoryUpdateLogs = (logs, sinceIsoTs, limit = 20) => {
  const list = Array.isArray(logs) ? logs : [];
  const since = sinceIsoTs ? Date.parse(sinceIsoTs) : 0;
  const picked = [];
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const e = list[i];
    const tsIso = typeof e?.ts === 'string' ? e.ts : '';
    const ts = tsIso ? Date.parse(tsIso) : 0;
    if (since && ts && ts <= since) break;
    const type = typeof e?.type === 'string' ? e.type : '';
    if (type === 'play_enter' || type === 'play_choice' || type === 'play_restart') {
      picked.push(e);
      if (picked.length >= limit) break;
    }
  }
  return picked.reverse();
};

export const selectFactsForScene = (memory, { title, location, limit = 8 } = {}) => {
  const facts = Array.isArray(memory?.facts) ? memory.facts.map(normalizeFact).filter(Boolean) : [];
  const titleTokens = tokenize(title);
  const loc = (location || '').toString().trim();
  const locLower = loc.toLowerCase();

  const scored = facts.map((f) => {
    const t = f.text.toLowerCase();
    const entityLower = (f.entity || '').toLowerCase();
    const topicLower = (f.topic || '').toLowerCase();
    let s = 0;
    if (locLower && (entityLower === locLower)) s += 10;
    if (locLower && (t.includes(locLower))) s += 6;
    if (topicLower === 'item') s += 6;
    if (topicLower === 'character') s += 6;
    if (topicLower === 'goal') s += 4;
    if (topicLower === 'state') s += 3;
    if (topicLower === 'rule') s += 2;
    if (topicLower === 'location' && entityLower === 'player') s -= 4;
    for (const w of titleTokens) {
      if (t.includes(w)) s += 1;
    }
    return { f, s };
  });

  const want = Math.max(0, Math.min(20, limit));
  if (!want) return [];

  const recentCount = Math.min(3, want, facts.length);
  const recent = recentCount ? facts.slice(-recentCount) : [];
  const recentKey = new Set(recent.map((f) => `${f.topic}::${f.entity}::${f.text}`));

  const ranked = scored
    .sort((a, b) => b.s - a.s)
    .map((x) => x.f)
    .filter((f) => !recentKey.has(`${f.topic}::${f.entity}::${f.text}`));

  return [...recent, ...ranked].slice(0, want);
};
