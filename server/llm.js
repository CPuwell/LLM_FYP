import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { asString } from './strings.js';
import { buildWorldBibleSnippet } from './worldBible.js';
import { buildScenePrompt, PROMPT_VERSION } from './prompt.js';

const normalizeModelJson = (obj) => {
  const descriptionRaw = typeof obj?.description === 'string' ? obj.description.trim() : '';
  const actions = Array.isArray(obj?.actions)
    ? obj.actions
      .filter((a) => typeof a === 'string' && a.trim())
      .map((a) => a.trim().slice(0, 120))
      .slice(0, 3)
    : [];

  const description = descriptionRaw.slice(0, 1200);
  if (!description) throw new Error('Missing description');
  if (actions.length !== 3) throw new Error('Missing actions');
  return { description, actions };
};

export const parseModelJson = (rawText) => {
  const cleaned = asString(rawText)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  let lastReason = '';

  const tryJson = (s) => {
    try {
      const parsed = JSON.parse(s);
      try {
        return normalizeModelJson(parsed);
      } catch (e) {
        lastReason = asString(e?.message) || lastReason;
        return null;
      }
    } catch (e) {
      lastReason = lastReason || asString(e?.message) || 'Invalid JSON';
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

  throw new Error(lastReason ? `Invalid AI JSON output: ${lastReason}` : 'Invalid AI JSON output');
};

const isRetryableGeminiError = (err) => {
  const msg = asString(err?.message);
  return msg.includes('429') || msg.includes('503') || msg.includes('Invalid AI JSON output');
};

export const createGeminiClient = (apiKey) => {
  const key = asString(apiKey).trim();
  if (!key) return null;
  return new GoogleGenerativeAI(key);
};

export const generateSceneText = async ({
  genAI,
  modelsToTry,
  title,
  storyContext,
  userPrompt,
  worldBible,
  location,
  memory,
  playerState,
}) => {
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
    : ['gemini-2.5-flash', 'gemini-2.0-flash-001', 'gemini-2.0-flash-lite-001'];

  const wbSnippet = buildWorldBibleSnippet(
    worldBible,
    `${title || ''}\n${storyContext || ''}\n${userPrompt || ''}`,
    location,
  );

  const prompt = buildScenePrompt({
    title,
    storyContext,
    userPrompt,
    worldBibleSnippet: wbSnippet,
    memory,
    playerState,
  });

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
      const content = parseModelJson(text);

      return {
        ...content,
        meta: {
          requestId,
          model: modelName,
          promptVersion: PROMPT_VERSION,
          ms: Date.now() - startedAt,
        },
      };
    } catch (error) {
      lastError = error;
      if (isRetryableGeminiError(error)) continue;
      break;
    }
  }

  const err = new Error('Failed to generate text');
  err.statusCode = 500;
  err.details = lastError ? asString(lastError.message) : 'Unknown error';
  throw err;
};
