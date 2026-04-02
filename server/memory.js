import crypto from 'node:crypto';
import { asString } from './strings.js';

export const MEMORY_PROMPT_VERSION = 'memory_v2_struct';

const normalizeMemoryJson = (obj) => {
  const summary = typeof obj?.summary === 'string' ? obj.summary.trim().slice(0, 1400) : '';
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
  const facts = Array.isArray(obj?.facts)
    ? obj.facts.map(normalizeFact).filter(Boolean).slice(0, 12)
    : [];
  return { summary, facts };
};

export const parseMemoryJson = (rawText) => {
  const cleaned = asString(rawText)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const tryJson = (s) => {
    try {
      return normalizeMemoryJson(JSON.parse(s));
    } catch {
      return null;
    }
  };

  const direct = tryJson(cleaned);
  if (direct) return direct;

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const sliced = tryJson(cleaned.slice(first, last + 1));
    if (sliced) return sliced;
  }

  throw new Error('Invalid AI JSON output');
};

const isRetryableGeminiError = (err) => {
  const msg = asString(err?.message);
  return msg.includes('429') || msg.includes('503') || msg.includes('Invalid AI JSON output');
};

const formatAttributes = (attrs) => {
  if (!attrs || typeof attrs !== 'object') return '';
  const entries = Object.entries(attrs)
    .filter(([k]) => typeof k === 'string' && k.trim())
    .slice(0, 20)
    .map(([k, v]) => {
      const key = k.trim().slice(0, 40);
      const value = (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')
        ? `${v}`
        : (v === null ? 'null' : 'object');
      return `${key}=${value.slice(0, 60)}`;
    });
  return entries.length ? entries.join(', ') : '';
};

const formatEvents = (events) => {
  const list = Array.isArray(events) ? events : [];
  const lines = [];
  for (const e of list.slice(-50)) {
    const type = asString(e?.type);
    if (type === 'play_enter') {
      const title = asString(e?.title).trim();
      const location = asString(e?.location).trim();
      const snippet = asString(e?.descriptionSnippet).trim();
      const attrs = formatAttributes(e?.attributesSnapshot);
      lines.push(`ENTER: ${title}${location ? ` @ ${location}` : ''}${snippet ? ` | ${snippet}` : ''}${attrs ? ` | ATTRS: ${attrs}` : ''}`);
    } else if (type === 'play_choice') {
      const fromTitle = asString(e?.fromTitle).trim();
      const choiceText = asString(e?.choiceText).trim();
      const toTitle = asString(e?.toTitle).trim();
      const attrs = formatAttributes(e?.attributesAfter);
      lines.push(`CHOICE: ${fromTitle} -> [${choiceText}] -> ${toTitle}${attrs ? ` | ATTRS: ${attrs}` : ''}`);
    } else if (type === 'play_restart') {
      lines.push('RESTART');
    }
  }
  return lines.join('\n');
};

export const buildMemoryPrompt = ({ memory, events }) => {
  const prevSummary = asString(memory?.summary).trim();
  const prevFacts = Array.isArray(memory?.facts)
    ? memory.facts
      .map((f) => {
        if (typeof f === 'string') return { text: f.trim(), topic: '', entity: '' };
        if (!f || typeof f !== 'object') return null;
        const text = typeof f.text === 'string' ? f.text.trim() : '';
        if (!text) return null;
        const topic = typeof f.topic === 'string' ? f.topic.trim() : '';
        const entity = typeof f.entity === 'string' ? f.entity.trim() : '';
        return { text, topic, entity };
      })
      .filter(Boolean)
      .slice(0, 12)
    : [];
  const eventText = formatEvents(events);

  return [
    'You maintain long-term memory for an interactive narrative playthrough.',
    '',
    'Previous Memory Summary (may be empty):',
    prevSummary || '(none)',
    '',
    'Previous Memory Facts (0-12 bullets, may be empty):',
    prevFacts.length
      ? prevFacts.map((f) => `- ${(f.topic || f.entity) ? `[${[f.topic, f.entity].filter(Boolean).join(': ')}] ` : ''}${f.text}`).join('\n')
      : '(none)',
    '',
    'New Events (chronological):',
    eventText || '(none)',
    '',
    'Task:',
    '- Update the memory based only on the Previous Memory and New Events.',
    '- Keep the summary concise, stable, and consistent.',
    '- Facts should be durable world-state or important story truths (not fleeting prose).',
    '- Do NOT invent details that are not supported by events.',
    '',
    'Output:',
    '- Return ONLY valid JSON, no markdown, no extra keys.',
    '{"summary":"...","facts":[{"text":"...","topic":"state|location|character|goal|item|rule|","entity":"..."}]}',
    '',
    'Constraints:',
    '- summary: <= 120 words',
    '- facts: 0-12 items, each text <= 18 words',
    '- topic: one short word; entity: optional (e.g., location or character name)',
  ].join('\n');
};

export const updateLongTermMemory = async ({ genAI, modelsToTry, memory, events }) => {
  if (!genAI) {
    const err = new Error('AI is not configured');
    err.statusCode = 500;
    err.details = 'Missing GEMINI_API_KEY on the backend';
    throw err;
  }

  const requestId = crypto.randomBytes(8).toString('hex');
  const startedAt = Date.now();
  let lastError = null;

  const modelList = Array.isArray(modelsToTry) && modelsToTry.length
    ? modelsToTry
    : ['gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-flash'];

  const prompt = buildMemoryPrompt({ memory, events });

  for (const modelName of modelList) {
    try {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: {
          responseMimeType: 'application/json',
        },
      });
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      const content = parseMemoryJson(text);

      return {
        ...content,
        meta: {
          requestId,
          model: modelName,
          promptVersion: MEMORY_PROMPT_VERSION,
          ms: Date.now() - startedAt,
        },
      };
    } catch (error) {
      lastError = error;
      if (isRetryableGeminiError(error)) continue;
      break;
    }
  }

  const err = new Error('Failed to update memory');
  err.statusCode = 500;
  err.details = lastError ? asString(lastError.message) : 'Unknown error';
  throw err;
};
