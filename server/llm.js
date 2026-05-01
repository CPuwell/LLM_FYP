import crypto from 'node:crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { asString, trimTo } from './strings.js';
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

const escapeRawNewlinesInJsonStrings = (input) => {
  const s = asString(input);
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        continue;
      }
      out += ch;
      continue;
    }

    out += ch;
    if (ch === '"') inString = true;
  }
  return out;
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

  const candidates = [cleaned];
  const escapedNewlines = escapeRawNewlinesInJsonStrings(cleaned);
  if (escapedNewlines !== cleaned) candidates.push(escapedNewlines);

  for (const candidate of candidates) {
    const direct = tryJson(candidate);
    if (direct) return direct;

    const first = candidate.indexOf('{');
    const last = candidate.lastIndexOf('}');
    if (first !== -1 && last !== -1 && last > first) {
      const sliced = tryJson(candidate.slice(first, last + 1));
      if (sliced) return sliced;
    }
  }

  throw new Error(lastReason ? `Invalid AI JSON output: ${lastReason}` : 'Invalid AI JSON output');
};

  const isRetryableGeminiError = (err) => {
    const msg = asString(err?.message);
    return msg.includes('429') || msg.includes('503') || msg.includes('Invalid AI JSON output') || msg.includes('MAX_TOKENS');
  };

/**
 * 使用 Gemini 将中文或零散的描述优化为适合 Imagen 的英文关键词 Prompt
 * 采用多模型回退策略以避免 404 错误
 */
export const optimizeImagePrompt = async ({ genAI, description, storyContext, worldBible }) => {
  if (!genAI) return description;
  
  const modelsToTry = ['gemini-2.0-flash-lite', 'gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-pro'];
  let lastError = null;

  const prompt = `
    You are an expert prompt engineer for AI image generation (Imagen).
    Task: Convert the user's scene description into a high-quality, descriptive English image prompt.
    
    Rules:
    1. If the input is in Chinese or another language, translate it to English.
    2. Focus on visual keywords: lighting, atmosphere, specific objects, colors, and camera angles.
    3. Keep it concise (under 100 words).
    4. Do NOT use abstract words like "beautiful" or "amazing". Use concrete nouns and adjectives.
    5. Output ONLY the optimized English prompt text. No preamble.
    
    Context: ${asString(storyContext).slice(0, 300)}
    World Tone: ${asString(worldBible?.tone).slice(0, 100)}
    User Description: ${asString(description).slice(0, 1000)}
  `;

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();
      if (text) {
        console.log(`[LLM] Image prompt optimized using ${modelName}`);
        return text;
      }
    } catch (e) {
      lastError = e;
      console.warn(`[LLM] Optimization failed with ${modelName}, trying next...`);
    }
  }

  console.warn('[LLM] All image optimization models failed, falling back to raw description. Last error:', lastError?.message);
  return description;
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
    : ['gemini-1.5-flash', 'gemini-1.5-flash-8b'];

  const wbSnippet = buildWorldBibleSnippet(
    worldBible,
    `${title || ''}\n${storyContext || ''}\n${userPrompt || ''}`,
    location,
  );

  const promptFull = buildScenePrompt({
    title,
    storyContext,
    userPrompt,
    worldBibleSnippet: wbSnippet,
    memory,
    playerState,
  });

  const wbSnippetCompact = buildWorldBibleSnippet(
    worldBible,
    `${title || ''}\n${trimTo(userPrompt, 1800)}`,
    location,
    { maxChars: 1600, locationLimit: 4, characterLimit: 4 },
  );

  const promptCompact = buildScenePrompt({
    title: trimTo(title, 120),
    storyContext: trimTo(storyContext, 6000),
    userPrompt: trimTo(userPrompt, 3500),
    worldBibleSnippet: wbSnippetCompact,
    memory: memory ? {
      summary: trimTo(memory.summary, 1000),
      facts: Array.isArray(memory.facts) ? memory.facts.slice(0, 8) : [],
    } : null,
    playerState: trimTo(playerState, 1500),
  });

  const wbSnippetTiny = buildWorldBibleSnippet(
    worldBible,
    `${trimTo(title, 160) || ''}\n${trimTo(userPrompt, 1600)}`,
    location,
    { maxChars: 700, locationLimit: 2, characterLimit: 2 },
  );

  const promptTiny = buildScenePrompt({
    title: trimTo(title, 120),
    storyContext: trimTo(storyContext, 2000),
    userPrompt: trimTo(userPrompt, 2200),
    worldBibleSnippet: wbSnippetTiny,
    memory: memory ? {
      summary: trimTo(memory.summary, 500),
      facts: Array.isArray(memory.facts) ? memory.facts.slice(0, 2) : [],
    } : null,
    playerState: trimTo(playerState, 900),
  });

  const buildJsonRepairPrompt = ({ schema, parseError, badOutput }) => [
    'You are a JSON repair tool.',
    'Return ONLY valid JSON. No markdown, no code fences, no extra keys.',
    `Schema: ${schema}`,
    `Parse error: ${trimTo(parseError, 500) || '(unknown)'}`,
    'Fix the following output into valid JSON matching the schema.',
    'Bad output:',
    trimTo(badOutput, 8000),
  ].join('\n');

  const debug = process.env.AI_DEBUG === '1';
  const variantStrategy = (process.env.AI_VARIANT_STRATEGY || '').toString().trim().toLowerCase();
  const forcedVariant = (process.env.AI_PROMPT_VARIANT || '').toString().trim().toLowerCase();
  const allVariants = variantStrategy === 'quality'
    ? [
      { name: 'full', prompt: promptFull },
      { name: 'compact', prompt: promptCompact },
      { name: 'tiny', prompt: promptTiny },
    ]
    : [
      { name: 'tiny', prompt: promptTiny },
      { name: 'compact', prompt: promptCompact },
    ];
  const variants = forcedVariant
    ? allVariants.filter((v) => v.name === forcedVariant)
    : allVariants;

  for (const modelName of modelList) {
    for (const variant of variants) {
      try {
        const generationConfig = {
          temperature: 0.5,
          topP: 0.9,
          maxOutputTokens: 2048,
          responseMimeType: 'application/json',
        };
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            ...generationConfig,
          },
        });

        const result = await model.generateContent(variant.prompt);
        const response = await result.response;
        const text = response.text();

        if (debug) {
          console.log(`\n\n[DEBUG] === ${modelName} (${variant.name}) ===`);
          console.log('[DEBUG] Finish Reason:', response.candidates?.[0]?.finishReason);
          console.log('[DEBUG] Token Count (Prompt):', response.usageMetadata?.promptTokenCount);
          console.log('[DEBUG] Token Count (Candidates):', response.usageMetadata?.candidatesTokenCount);
          console.log('[DEBUG] Token Count (Total):', response.usageMetadata?.totalTokenCount);
          console.log('[DEBUG] Max Output Tokens (Config):', generationConfig.maxOutputTokens);
          console.log('[DEBUG] Text Output Length:', text.length);
          console.log('[DEBUG] Output Snippet:\n', text.slice(-500));
          console.log('=======================\n\n');
        }

        let content;
        try {
          content = parseModelJson(text);
        } catch (e) {
          const msg = asString(e?.message);
          if (response.promptFeedback?.blockReason) {
            throw new Error(`Invalid AI JSON output: ${response.promptFeedback.blockReason}`);
          }
          if (!msg.includes('Invalid AI JSON output')) throw e;
          const repairModel = genAI.getGenerativeModel({
            model: modelName,
            generationConfig: {
              temperature: 0.0,
              topP: 0.1,
              maxOutputTokens: 1024,
              responseMimeType: 'application/json',
            },
          });
          const finishReason = response.candidates?.[0]?.finishReason;
          const repairPrompt = buildJsonRepairPrompt({
            schema: '{"description":"...","actions":["...","...","..."]}',
            parseError: finishReason ? `${msg} (finishReason=${finishReason})` : msg,
            badOutput: text,
          });
          const repairResult = await repairModel.generateContent(repairPrompt);
          const repairResponse = await repairResult.response;
          const repairedText = repairResponse.text();
          content = parseModelJson(repairedText);
        }

        return {
          ...content,
          meta: {
            requestId,
            model: modelName,
            promptVersion: PROMPT_VERSION,
            promptVariant: variant.name,
            ms: Date.now() - startedAt,
          },
        };
      } catch (error) {
        lastError = error;
        const msg = asString(error?.message).toUpperCase();
        const isMaxTokens = msg.includes('MAX_TOKENS') || msg.includes('TOKEN_LIMIT') || msg.includes('CONTEXT') || msg.includes('CONTEXT_LENGTH');
        if (isMaxTokens) {
          if (variant.name === 'tiny') break;
          continue;
        }
        
        if (isRetryableGeminiError(error)) break;
        break;
      }
    }
    if (lastError && isRetryableGeminiError(lastError)) continue;
    break;
  }

  const err = new Error('Failed to generate text');
  err.statusCode = 500;
  err.details = lastError ? asString(lastError.message) : 'Unknown error';
  throw err;
};
