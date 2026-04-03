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
const port = 3001;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const generatedDir = path.join(__dirname, 'generated');

// 允许跨域请求，因为前端在 5173，后端在 3001
app.use(cors());
app.use(express.json());
fs.mkdirSync(generatedDir, { recursive: true });
app.use('/generated', express.static(generatedDir));

const serverOrigin = process.env.SERVER_ORIGIN || `http://localhost:${port}`;
const hfToken = process.env.HF_TOKEN || '';
const hfImageModel = process.env.HF_IMAGE_MODEL || 'stabilityai/stable-diffusion-2-1';
const cfAccountId = process.env.CF_ACCOUNT_ID || '';
const cfApiToken = process.env.CF_API_TOKEN || '';
const cfImageModel = process.env.CF_IMAGE_MODEL || '@cf/stabilityai/stable-diffusion-xl-base-1.0';

const getExtFromContentType = (contentType) => {
  const ct = (contentType || '').toLowerCase();
  if (ct.includes('image/png')) return 'png';
  if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return 'jpg';
  if (ct.includes('image/webp')) return 'webp';
  if (ct.includes('image/svg+xml')) return 'svg';
  return 'bin';
};

const saveBufferToGenerated = (buffer, contentType) => {
  const ext = getExtFromContentType(contentType);
  const name = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}.${ext}`;
  const outPath = path.join(generatedDir, name);
  fs.writeFileSync(outPath, buffer);
  return `${serverOrigin}/generated/${name}`;
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
    const { title, storyContext, userPrompt, worldBible, location, memory } = validateGenerateRequest(req.body);
    console.log(`[Text Gen] Request for: ${title}`);
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite-001"];
    const out = await generateSceneText({
      genAI: reqGenAI,
      modelsToTry,
      title,
      storyContext,
      userPrompt,
      worldBible,
      location,
      memory,
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
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite-001"];
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
    const modelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite-001"];
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
  const { description } = req.body;
  console.log(`[Image Gen] Request received for: ${String(description ?? '').slice(0, 30)}...`);

  try {
    const raw = (description ?? '').toString();
    const cleaned = raw.replace(/[^\w\s,.'"-]/g, ' ').replace(/\s+/g, ' ').trim();
    const prompt = cleaned.slice(0, 400);

    const generateProceduralSvg = () => {
      const h = crypto.createHash('sha256').update(prompt || 'scene').digest();
      const r = (i) => h[i] / 255;
      const skyHue = Math.floor(190 + r(0) * 50);
      const skySat = Math.floor(45 + r(1) * 25);
      const skyLum1 = Math.floor(20 + r(2) * 25);
      const skyLum2 = Math.floor(35 + r(3) * 25);
      const sunX = Math.floor(80 + r(4) * 340);
      const sunY = Math.floor(70 + r(5) * 170);
      const sunR = Math.floor(28 + r(6) * 26);
      const groundHue = Math.floor(90 + r(7) * 40);
      const groundSat = Math.floor(25 + r(8) * 35);
      const groundLum = Math.floor(12 + r(9) * 18);
      const accentHue = Math.floor(10 + r(10) * 40);
      const accentSat = Math.floor(70 + r(11) * 25);
      const accentLum = Math.floor(55 + r(12) * 20);
      const hasVillage = /village|town|tavern|market|street|inn/i.test(prompt);
      const hasForest = /forest|woods|tree|woodland/i.test(prompt);
      const hasMountain = /mountain|hill|cliff/i.test(prompt);

      const houses = hasVillage
        ? Array.from({ length: 6 }, (_, i) => {
            const x = 50 + i * 75 + Math.floor(r(13 + i) * 18);
            const y = 320 + Math.floor(r(19 + i) * 40);
            const w = 44 + Math.floor(r(25 + i) * 18);
            const h1 = 34 + Math.floor(r(31 + i) * 26);
            const roof = `M ${x - 2} ${y} L ${x + w / 2} ${y - 22} L ${x + w + 2} ${y} Z`;
            const body = `<rect x="${x}" y="${y}" width="${w}" height="${h1}" rx="3" fill="rgba(20,20,22,0.65)" stroke="rgba(255,255,255,0.12)" />`;
            const roofEl = `<path d="${roof}" fill="rgba(10,10,12,0.75)" stroke="rgba(255,255,255,0.10)" />`;
            const winX = x + 10 + Math.floor(r(37 + i) * 8);
            const winY = y + 10 + Math.floor(r(43 + i) * 10);
            const win = `<rect x="${winX}" y="${winY}" width="10" height="10" rx="2" fill="hsl(${accentHue} ${accentSat}% ${accentLum}%)" opacity="0.9" />`;
            return `${roofEl}${body}${win}`;
          }).join('')
        : '';

      const trees = hasForest
        ? Array.from({ length: 10 }, (_, i) => {
            const x = 20 + i * 55 + Math.floor(r(49 + i) * 20);
            const y = 260 + Math.floor(r(59 + i) * 70);
            const cr = 14 + Math.floor(r(69 + i) * 18);
            const trunkH = 18 + Math.floor(r(79 + i) * 18);
            const trunkW = 6 + Math.floor(r(89 + i) * 4);
            const trunk = `<rect x="${x - trunkW / 2}" y="${y + cr - 4}" width="${trunkW}" height="${trunkH}" rx="2" fill="rgba(40,28,20,0.65)" />`;
            const crown = `<circle cx="${x}" cy="${y}" r="${cr}" fill="rgba(15,35,20,0.55)" stroke="rgba(255,255,255,0.08)" />`;
            return `${crown}${trunk}`;
          }).join('')
        : '';

      const mountains = hasMountain
        ? `<path d="M 0 330 L 120 210 L 240 330 Z" fill="rgba(18,18,22,0.45)" />
           <path d="M 170 350 L 320 200 L 470 350 Z" fill="rgba(18,18,22,0.35)" />
           <path d="M 360 340 L 470 235 L 610 340 Z" fill="rgba(18,18,22,0.40)" />`
        : `<path d="M 0 350 C 140 300 240 380 360 330 C 470 285 560 360 640 320 L 640 512 L 0 512 Z" fill="rgba(18,18,22,0.35)" />`;

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${skyHue} ${skySat}% ${skyLum2}%)"/>
      <stop offset="100%" stop-color="hsl(${skyHue} ${Math.max(0, skySat - 10)}% ${skyLum1}%)"/>
    </linearGradient>
    <linearGradient id="ground" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="hsl(${groundHue} ${groundSat}% ${groundLum + 6}%)"/>
      <stop offset="100%" stop-color="hsl(${groundHue} ${groundSat}% ${groundLum}%)"/>
    </linearGradient>
    <radialGradient id="sun" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="hsl(${accentHue} ${accentSat}% ${Math.min(85, accentLum + 20)}%)" stop-opacity="1"/>
      <stop offset="100%" stop-color="hsl(${accentHue} ${accentSat}% ${accentLum}%)" stop-opacity="0"/>
    </radialGradient>
    <filter id="blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="1.6" />
    </filter>
  </defs>
  <rect width="512" height="512" fill="url(#sky)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR * 2.2}" fill="url(#sun)" opacity="0.85" filter="url(#blur)"/>
  <circle cx="${sunX}" cy="${sunY}" r="${sunR}" fill="hsl(${accentHue} ${accentSat}% ${accentLum}%)" opacity="0.9"/>
  ${mountains}
  <rect y="330" width="512" height="182" fill="url(#ground)"/>
  <g opacity="0.95">${trees}</g>
  <g opacity="0.95">${houses}</g>
</svg>`;

      return svg;
    };

    const tryCloudflare = async () => {
      if (!cfAccountId || !cfApiToken) return null;
      const url = `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/${cfImageModel}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${cfApiToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ prompt })
      });
      if (!response.ok) throw new Error(`Cloudflare status ${response.status}`);
      const contentType = response.headers.get('content-type') || 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return saveBufferToGenerated(buffer, contentType);
    };

    const tryHuggingFace = async () => {
      if (!hfToken) return null;
      const url = `https://api-inference.huggingface.co/models/${hfImageModel}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${hfToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ inputs: prompt })
      });
      if (!response.ok) throw new Error(`HuggingFace status ${response.status}`);
      const contentType = response.headers.get('content-type') || 'image/png';
      const buffer = Buffer.from(await response.arrayBuffer());
      return saveBufferToGenerated(buffer, contentType);
    };

    let imageUrl = null;
    try {
      imageUrl = await tryCloudflare();
      if (imageUrl) return res.json({ imageUrl });
    } catch (e) {
      console.warn(`[Image Gen] Cloudflare failed: ${e.message}`);
    }

    try {
      imageUrl = await tryHuggingFace();
      if (imageUrl) return res.json({ imageUrl });
    } catch (e) {
      console.warn(`[Image Gen] HuggingFace failed: ${e.message}`);
    }

    const svg = generateProceduralSvg();
    const svgUrl = saveBufferToGenerated(Buffer.from(svg, 'utf8'), 'image/svg+xml');
    return res.json({ imageUrl: svgUrl });

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

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
