import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createGeminiClient, generateSceneText } from './server/llm.js';
import { validateGenerateRequest } from './server/validate.js';
import { updateLongTermMemory } from './server/memory.js';
import { fetchProxiedImage } from './server/proxyImage.js';

const preDotenvKey = process.env.GEMINI_API_KEY;
dotenv.config({ override: true });
const postDotenvKey = process.env.GEMINI_API_KEY;
if (preDotenvKey && postDotenvKey && preDotenvKey !== postDotenvKey) {
  console.log('[dotenv] GEMINI_API_KEY overridden from .env');
}

const app = express();
const port = process.env.PORT || 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.join(__dirname, 'generated');
const distDir = path.join(__dirname, 'dist');

// 允许跨域请求，因为前端在 5173，后端在 3001
app.use(cors());
app.use(express.json());
fs.mkdirSync(generatedDir, { recursive: true });
app.use('/generated', express.static(generatedDir));

// 在生产环境下提供前端静态文件
if (fs.existsSync(distDir)) {
  console.log('[Server] Serving static files from dist');
  app.use(express.static(distDir));
}

const serverOrigin = process.env.SERVER_ORIGIN || `http://localhost:${port}`;
const geminiImageModel = process.env.GEMINI_IMAGE_MODEL || 'imagen-4.0-fast-generate-001';

const getExtFromContentType = (contentType) => {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/svg+xml')) return 'svg';
  return 'bin';
};

const sniffImageContentType = (buffer) => {
  if (!buffer || buffer.length < 12) return 'application/octet-stream';
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) return 'image/png';
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) return 'image/jpeg';
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) return 'image/webp';
  return 'application/octet-stream';
};

const saveBufferToGenerated = (buffer, contentType) => {
  const ext = getExtFromContentType(contentType);
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const outPath = path.join(generatedDir, name);
  fs.writeFileSync(outPath, buffer);
  return `/generated/${name}`;
};

// 配置 Google Gemini API
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.error("❌ Error: GEMINI_API_KEY is missing in .env file");
} else {
  const fingerprint = crypto.createHash('sha256').update(apiKey).digest('hex').slice(0, 10);
  const suffix = apiKey.slice(-6);
  console.log(`[Gemini] GEMINI_API_KEY loaded (sha256[0..10]=${fingerprint}, suffix=...${suffix})`);
}

const genAI = createGeminiClient(apiKey);

const getGeminiKeyFromRequest = (req) => {
  const direct = (req.get('x-gemini-api-key') || '').trim();
  if (direct) return { key: direct, source: 'x-gemini-api-key' };

  const auth = (req.get('authorization') || '').trim();
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (m && m[1] && m[1].trim()) return { key: m[1].trim(), source: 'authorization' };

  const envKey = (process.env.GEMINI_API_KEY || '').trim();
  if (envKey) return { key: envKey, source: 'env' };

  return { key: '', source: 'none' };
};

const getGenAIForRequest = (req) => { 
  const { key, source } = getGeminiKeyFromRequest(req);
  if (!key) return { genAI: null, keySource: source };
  if (source === 'env') return { genAI, keySource: source };
  return { genAI: createGeminiClient(key), keySource: source };
};

app.get('/api/debug-gemini', async (req, res) => {
  const { key, source } = getGeminiKeyFromRequest(req);
  const fingerprint = key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 10) : '';
  const suffix = key && source === 'env' ? key.slice(-6) : '';
  const envOverrode = Boolean(preDotenvKey && postDotenvKey && preDotenvKey !== postDotenvKey);

  if (!key) {
    return res.status(500).json({
      ok: false,
      error: 'Missing GEMINI_API_KEY',
      keyFingerprint: '',
      keySuffix: '',
      keySource: source,
      envOverrode,
    });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: controller.signal });
    const text = await r.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 800) };
    }

    const models = Array.isArray(data?.models)
      ? data.models.map((m) => (typeof m?.name === 'string' ? m.name : '')).filter(Boolean).slice(0, 50)
      : [];

    return res.status(200).json({
      ok: r.ok,
      status: r.status,
      keyFingerprint: fingerprint,
      keySuffix: suffix ? `...${suffix}` : '',
      keySource: source,
      envOverrode,
      modelsCount: models.length,
      models,
      error: data?.error ? { code: data.error.code, status: data.error.status, message: data.error.message } : null,
    });
  } catch (e) {
    const isAbort = e?.name === 'AbortError';
    return res.status(200).json({
      ok: false,
      status: isAbort ? 504 : 500,
      keyFingerprint: fingerprint,
      keySuffix: suffix ? `...${suffix}` : '',
      keySource: source,
      envOverrode,
      modelsCount: 0,
      models: [],
      error: { message: isAbort ? 'Timeout calling models list' : (e?.message || 'Unknown error') },
    });
  } finally {
    clearTimeout(timeout);
  }
});

app.get('/api/debug-generate', async (req, res) => {
  const { key, source } = getGeminiKeyFromRequest(req);
  const { genAI: reqGenAI } = getGenAIForRequest(req);
  const fingerprint = key ? crypto.createHash('sha256').update(key).digest('hex').slice(0, 10) : '';
  const envOverrode = Boolean(preDotenvKey && postDotenvKey && preDotenvKey !== postDotenvKey);
  const modelName = typeof req.query.model === 'string' && req.query.model.trim() ? req.query.model.trim() : 'gemini-2.5-flash';

  if (!reqGenAI || !key) {
    return res.status(500).json({
      ok: false,
      status: 500,
      model: modelName,
      keyFingerprint: fingerprint,
      keySource: source,
      envOverrode,
      error: 'Missing GEMINI_API_KEY',
    });
  }

  const startedAt = Date.now();
  try {
    const model = reqGenAI.getGenerativeModel({
      model: modelName,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
      },
    });
    const result = await model.generateContent('Return only JSON: {"ok":true}');
    const response = await result.response;
    const text = response.text();
    return res.status(200).json({
      ok: true,
      status: 200,
      model: modelName,
      keyFingerprint: fingerprint,
      keySource: source,
      envOverrode,
      ms: Date.now() - startedAt,
      sample: text.slice(0, 300),
    });
  } catch (e) {
    return res.status(200).json({
      ok: false,
      status: 200,
      model: modelName,
      keyFingerprint: fingerprint,
      keySource: source,
      envOverrode,
      ms: Date.now() - startedAt,
      error: e?.message || 'Unknown error',
    });
  }
});

// 1. 文本生成 API
app.post('/api/generate', async (req, res) => {
  try {
    const { genAI: reqGenAI } = getGenAIForRequest(req);
    if (!reqGenAI) {
      const err = new Error('Missing GEMINI_API_KEY');
      err.statusCode = 500;
      throw err;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { title, storyContext, userPrompt, worldBible, location } = validateGenerateRequest(body);
    const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
    const out = await generateSceneText({
      genAI: reqGenAI,
      modelsToTry,
      title,
      storyContext,
      userPrompt,
      worldBible,
      location,
      memory: null, // Make sure memory will not affect the static scene generation
    });
    return res.json(out);
  } catch (error) {
    const status = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
    return res.status(status).json({
      error: status === 400 ? 'Bad request' : 'Failed to generate text',
      details: error?.details || error?.message || 'Unknown error',
    });
  }
});

app.post('/api/generate-player', async (req, res) => {
  try {
    const { genAI: reqGenAI } = getGenAIForRequest(req);
    if (!reqGenAI) {
      const err = new Error('Missing GEMINI_API_KEY');
      err.statusCode = 500;
      throw err;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const { title, storyContext, userPrompt, worldBible, location, memory } = validateGenerateRequest(body);
    const attributes = body?.attributes && typeof body.attributes === 'object' ? body.attributes : {};
    const playerState = `Attributes: ${JSON.stringify(attributes).slice(0, 2500)}`;
    const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
    const out = await generateSceneText({
      genAI: reqGenAI,
      modelsToTry,
      title,
      storyContext,
      userPrompt,
      worldBible,
      location,
      memory,
      playerState,
    });
    return res.json(out);
  } catch (error) {
    const status = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
    return res.status(status).json({
      error: status === 400 ? 'Bad request' : 'Failed to generate player text',
      details: error?.details || error?.message || 'Unknown error',
    });
  }
});

app.post('/api/update-memory', async (req, res) => {
  try {
    const { genAI: reqGenAI } = getGenAIForRequest(req);
    if (!reqGenAI) {
      const err = new Error('Missing GEMINI_API_KEY');
      err.statusCode = 500;
      throw err;
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const memory = body?.memory && typeof body.memory === 'object' ? body.memory : {};
    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) {
      return res.status(400).json({ error: 'Bad request', details: 'events is required' });
    }
    const modelsToTry = ["gemini-2.5-flash-lite", "gemini-2.5-flash"];
    const out = await updateLongTermMemory({ genAI: reqGenAI, modelsToTry, memory, events });
    return res.json(out);
  } catch (error) {
    const status = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
    return res.status(status).json({
      error: status === 400 ? 'Bad request' : 'Failed to update memory',
      details: error?.details || error?.message || 'Unknown error',
    });
  }
});

// 2. 图片生成 API
app.post('/api/generate-image', async (req, res) => {
  try {
    const body = (req.body && typeof req.body === 'object') ? req.body : {};
    const { description } = body;
    console.log(`[Image Gen] Request received for: ${String(description ?? '').slice(0, 30)}...`);

    const rawDesc = (description ?? '').toString();
    // 改用更宽松的策略：仅移除不可见的控制字符，保留所有可见字符（包括所有语言和标点）
    const cleanStr = (s) => s.replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ').replace(/\s+/g, ' ').trim();

    const descClean = cleanStr(rawDesc).slice(0, 800);
    const storyClean = cleanStr(body?.storyContext ?? '').slice(0, 420);
    const titleClean = cleanStr(body?.title ?? '').slice(0, 120);
    const locationClean = cleanStr(body?.location ?? '').slice(0, 120);
    const toneClean = cleanStr(body?.tone ?? '').slice(0, 180);
    const styleGuideClean = cleanStr(body?.styleGuide ?? '').slice(0, 280);

    const stylePreset = 'Cinematic, gritty survival horror. Nighttime. Low-key lighting. Desaturated color palette. 35mm film look, subtle film grain. Realistic. No text, no logos, no watermarks.';

    const parts = [
      `STYLE: ${stylePreset}`,
      storyClean ? `STORY CONTEXT: ${storyClean}` : '',
      toneClean ? `TONE: ${toneClean}` : '',
      styleGuideClean ? `STYLE GUIDE: ${styleGuideClean}` : '',
      titleClean ? `SCENE: ${titleClean}` : '',
      locationClean ? `LOCATION: ${locationClean}` : '',
      descClean ? `VISUAL DESCRIPTION: ${descClean}` : '',
    ].filter(Boolean);

    const prompt = parts.join('\n').slice(0, 1500);

    console.log('--- [Image Gen Prompt v2: Permissive] ---');
    console.log(prompt);
    console.log('---------------------------');

    const tryGeminiImagen = async () => {
      const { key } = getGeminiKeyFromRequest(req);
      if (!key) return null;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiImageModel)}:predict`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'x-goog-api-key': key,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instances: [{ prompt }],
            parameters: { sampleCount: 1 },
          }),
          signal: controller.signal,
        });
        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          data = { raw: text.slice(0, 800) };
        }
        if (!response.ok) {
          const msg = data?.error?.message || data?.error || data?.raw || `Gemini Imagen status ${response.status}`;
          throw new Error(msg);
        }

        const pickB64 = (obj) => {
          if (!obj || typeof obj !== 'object') return '';
          const b64 =
            obj?.bytesBase64Encoded ||
            obj?.imageBytes ||
            obj?.image?.imageBytes ||
            obj?.image?.bytesBase64Encoded;
          return typeof b64 === 'string' ? b64 : '';
        };

        const b64 =
          (Array.isArray(data?.predictions) && data.predictions.length ? pickB64(data.predictions[0]) : '') ||
          (Array.isArray(data?.generatedImages) && data.generatedImages.length ? pickB64(data.generatedImages[0]) : '') ||
          (Array.isArray(data?.generated_images) && data.generated_images.length ? pickB64(data.generated_images[0]) : '') ||
          '';

        if (!b64) throw new Error('Gemini Imagen returned no image bytes');
        const buffer = Buffer.from(b64, 'base64');
        const contentType = sniffImageContentType(buffer);
        return saveBufferToGenerated(buffer, contentType);
      } catch (e) {
        if (e?.name === 'AbortError') throw new Error('Gemini Imagen timeout');
        throw e;
      } finally {
        clearTimeout(timeout);
      }
    };

    let imageUrl = null;
    try {
      imageUrl = await tryGeminiImagen();
      if (imageUrl) return res.json({ imageUrl, prompt }); // 返回 prompt 以便前端调试
    } catch (e) {
      console.warn(`[Image Gen] Gemini Imagen failed: ${e.message}`);
    }
    return res.status(502).json({ error: 'Failed to generate image', details: 'Gemini Imagen failed' });

  } catch (error) {
    console.error('Image Gen Error:', error);
    res.status(500).json({ error: 'Failed to generate image' });
  }
});

// 3. 图片代理 API (解决混合内容/CORS 问题)
app.get('/api/proxy-image', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send('Missing url parameter');

  try {
    const { buffer, contentType } = await fetchProxiedImage(String(url));
    res.setHeader('Content-Type', contentType || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.send(buffer);
  } catch (error) {
    const status = Number.isFinite(error?.statusCode) ? error.statusCode : 500;
    console.error('Proxy Error:', error?.message || error);
    res.status(status).send(status === 403 ? 'Blocked url' : 'Failed to proxy image');
  }
});

// SPA 路由兜底：处理所有未匹配的请求
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Not Found (and no frontend build found)');
  }
});

app.listen(port, () => {
  console.log(`Backend server running at port ${port}`);
});
