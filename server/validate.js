import { asString, trimTo } from './strings.js';

export const validateGenerateRequest = (body) => {
  const src = (body && typeof body === 'object') ? body : {};

  const title = trimTo(src.title, 200);
  const storyContext = trimTo(src.storyContext, 20000);
  const userPrompt = trimTo(src.userPrompt, 12000);
  const location = trimTo(src.location, 200);

  const worldBible = (src.worldBible && typeof src.worldBible === 'object') ? src.worldBible : null;
  const normalizeFact = (f) => {
    if (typeof f === 'string') {
      const text = f.trim().slice(0, 180);
      return text ? { text, topic: '', entity: '' } : null;
    }
    if (!f || typeof f !== 'object') return null;
    const text = typeof f.text === 'string' ? f.text.trim().slice(0, 180) : '';
    if (!text) return null;
    const topic = typeof f.topic === 'string' ? f.topic.trim().slice(0, 40) : '';
    const entity = typeof f.entity === 'string' ? f.entity.trim().slice(0, 80) : '';
    return { text, topic, entity };
  };
  const memory = (src.memory && typeof src.memory === 'object') ? {
    summary: trimTo(src.memory.summary, 2000),
    facts: Array.isArray(src.memory.facts)
      ? src.memory.facts.map(normalizeFact).filter(Boolean).slice(0, 20)
      : [],
  } : null;

  const errors = [];
  if (!asString(title).trim()) errors.push('title is required');
  const hasAnyContext = Boolean(
    asString(storyContext).trim() ||
    asString(userPrompt).trim() ||
    worldBible,
  );
  if (!hasAnyContext) errors.push('storyContext or userPrompt or worldBible is required');

  if (errors.length) {
    const err = new Error(errors.join('; '));
    err.statusCode = 400;
    throw err;
  }

  return { title, storyContext, userPrompt, worldBible, location, memory };
};
