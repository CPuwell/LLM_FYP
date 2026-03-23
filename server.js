import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

dotenv.config();

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
}

const genAI = apiKey
  ? new GoogleGenerativeAI(apiKey)
  : null;

const parseModelJson = (rawText) => {
  const cleaned = (rawText ?? '')
    .toString()
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  const normalize = (obj) => {
    const description = typeof obj?.description === 'string' ? obj.description : '';
    const actions = Array.isArray(obj?.actions)
      ? obj.actions.filter((a) => typeof a === 'string' && a.trim()).slice(0, 3)
      : [];
    if (!description.trim()) throw new Error('Missing description');
    if (actions.length === 0) throw new Error('Missing actions');
    return { description, actions };
  };

  try {
    return normalize(JSON.parse(cleaned));
  } catch {
  }

  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return normalize(JSON.parse(cleaned.slice(first, last + 1)));
    } catch {
    }
  }

  const descMatch = cleaned.match(/"description"\s*:\s*"([\s\S]*?)"\s*,/i);
  const actionsMatch = cleaned.match(/"actions"\s*:\s*\[([\s\S]*?)\]/i);
  if (descMatch && actionsMatch) {
    const description = descMatch[1].replace(/\\"/g, '"').trim();
    const items = actionsMatch[1]
      .split(',')
      .map((s) => s.trim().replace(/^"+|"+$/g, '').replace(/\\"/g, '"'))
      .filter((s) => s.trim())
      .slice(0, 3);
    if (description && items.length) {
      return { description, actions: items };
    }
  }

  throw new Error('Invalid AI JSON output');
};

const normalizeWorldBible = (wb) => {
  const src = (wb && typeof wb === 'object') ? wb : {};
  const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
    .map((e) => ({
      name: typeof e?.name === 'string' ? e.name.trim() : '',
      description: typeof e?.description === 'string' ? e.description.trim() : '',
    }))
    .filter((e) => e.name || e.description)
    .slice(0, 100);

  return {
    premise: typeof src.premise === 'string' ? src.premise.trim() : '',
    tone: typeof src.tone === 'string' ? src.tone.trim() : '',
    rules: typeof src.rules === 'string' ? src.rules.trim() : '',
    styleGuide: typeof src.styleGuide === 'string' ? src.styleGuide.trim() : '',
    characters: cleanList(src.characters),
    locations: cleanList(src.locations),
  };
};

const buildWorldBibleSnippet = (wb, queryText, selectedLocationName) => {
  const q = (queryText ?? '').toString().toLowerCase();
  const data = normalizeWorldBible(wb);
  const selected = (selectedLocationName ?? '').toString().trim();
  const selectedLower = selected.toLowerCase();
  const selectedLocation = selectedLower
    ? data.locations.find((l) => (l?.name ?? '').toString().toLowerCase() === selectedLower)
    : null;

  const scoreEntry = (e) => {
    const name = (e?.name ?? '').toString().toLowerCase();
    if (!name) return 0;
    if (q.includes(name)) return 10;
    const parts = name.split(/[^a-z0-9]+/).filter((p) => p.length >= 3);
    let score = 0;
    for (const p of parts) {
      if (q.includes(p)) score += 1;
    }
    return score;
  };

  const top = (arr, limit) => arr
    .map((e) => ({ e, s: scoreEntry(e) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.e);

  const topLocations = top(data.locations, 5);
  const topCharacters = top(data.characters, 5);

  const lines = [];
  if (data.premise) lines.push(`Premise: ${data.premise}`);
  if (data.tone) lines.push(`Tone: ${data.tone}`);
  if (data.rules) lines.push(`World Rules: ${data.rules}`);
  if (data.styleGuide) lines.push(`Style Guide: ${data.styleGuide}`);
  if (selected) lines.push(`Selected Location: ${selected}`);

  if (topLocations.length) {
    lines.push('Relevant Locations:');
    const ordered = selectedLocation
      ? [selectedLocation, ...topLocations.filter((l) => l?.name !== selectedLocation?.name)]
      : topLocations;
    for (const l of ordered) {
      lines.push(`- ${l.name}${l.description ? `: ${l.description}` : ''}`);
    }
  }

  if (topCharacters.length) {
    lines.push('Relevant Characters:');
    for (const c of topCharacters) {
      lines.push(`- ${c.name}${c.description ? `: ${c.description}` : ''}`);
    }
  }

  return lines.join('\n');
};

// 1. 文本生成 API
app.post('/api/generate', async (req, res) => {
  const { title, storyContext, userPrompt, worldBible, location } = req.body;
  console.log(`[Text Gen] Request for: ${title}`);

  if (!genAI) {
    return res.status(500).json({
      error: 'AI is not configured',
      details: 'Missing GEMINI_API_KEY on the backend'
    });
  }

  // Model fallback list: prioritize 2.0-flash, then 2.0-flash-lite (lighter), then 2.5-flash (if available)
  const modelsToTry = ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-2.5-flash"];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`[Text Gen] Attempting with model: ${modelName}`);
      const model = genAI.getGenerativeModel({ model: modelName });

      const wbSnippet = buildWorldBibleSnippet(worldBible, `${title || ''}\n${storyContext || ''}\n${userPrompt || ''}`, location);

      const prompt = `
      Global Story Context: ${storyContext}
      ${wbSnippet ? `World Bible:\n${wbSnippet}` : `World Bible: None`}
      Current Scene Title: ${title}
      User Notes/Draft: ${userPrompt || "None"}
      
      Task: 
      1. Write a atmospheric description for this scene (max 100 words).
      2. Suggest 3 short actions the player can take next.
      
      IMPORTANT INSTRUCTION:
      - If "User Notes/Draft" is provided, prioritize it over the "Global Story Context". 
      - For example, if the Context says "scary" but User Notes say "peaceful", make it peaceful.
      - The "Global Story Context" is background information, but the "Current Scene Title" and "User Notes" define the specific reality of THIS scene.
      
      Output strictly valid JSON format like this, without markdown code blocks:
      {
        "description": "...",
        "actions": ["action1", "action2", "action3"]
      }
      `;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      let text = response.text();
      
      // 清理可能存在的 Markdown 代码块标记
      text = text.replace(/```json/g, '').replace(/```/g, '').trim();

      const content = parseModelJson(text);
      return res.json({ ...content, meta: { model: modelName } });

    } catch (error) {
      console.error(`[Text Gen] Error with ${modelName}:`, error.message);
      lastError = error;
      
      // If error is 429 (Quota) or 503 (Service Unavailable), we continue to next model
      if (error.message.includes('429') || error.message.includes('503') || error.message.includes('Invalid AI JSON output')) {
        console.log(`[Text Gen] Switching to next model...`);
        continue;
      } else {
        // If it's a different error (e.g., bad request), stop trying
        break;
      }
    }
  }

  // If we get here, all models failed
  console.error('All Gemini models failed.');
  res.status(500).json({ 
    error: 'Failed to generate text', 
    details: lastError ? lastError.message : 'Unknown error'
  });
});

// 2. 图片生成 API
app.post('/api/generate-image', async (req, res) => {
  const { description } = req.body;
  console.log(`[Image Gen] Request received for: ${description.substring(0, 30)}...`);

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
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.status}`);

    const buffer = await response.arrayBuffer();
    const bufferData = Buffer.from(buffer);

    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.send(bufferData);
  } catch (error) {
    console.error('Proxy Error:', error.message);
    res.status(500).send('Failed to proxy image');
  }
});

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
