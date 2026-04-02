import dns from 'node:dns/promises';
import net from 'node:net';
import { Readable } from 'node:stream';
import { asString, clampInt } from './strings.js';

const isPrivateIpv4 = (ip) => {
  const parts = ip.split('.').map((x) => Number.parseInt(x, 10));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n) || n < 0 || n > 255)) return true;
  const [a, b] = parts;
  if (a === 0) return true;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
};

const isPrivateIpv6 = (ip) => {
  const v = ip.toLowerCase();
  if (v === '::1') return true;
  if (v.startsWith('fc') || v.startsWith('fd')) return true;
  if (v.startsWith('fe8') || v.startsWith('fe9') || v.startsWith('fea') || v.startsWith('feb')) return true;
  if (v === '::') return true;
  return false;
};

const isPrivateIp = (ip) => {
  const t = net.isIP(ip);
  if (t === 4) return isPrivateIpv4(ip);
  if (t === 6) return isPrivateIpv6(ip);
  return true;
};

const validatePublicUrl = async (urlString, opts = {}) => {
  const allowHttp = Boolean(opts.allowHttp);
  let u;
  try {
    u = new URL(urlString);
  } catch {
    const err = new Error('Invalid url');
    err.statusCode = 400;
    throw err;
  }

  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) {
    const err = new Error('Only https URLs are allowed');
    err.statusCode = 400;
    throw err;
  }

  const port = u.port ? clampInt(u.port, 1, 65535, 0) : (u.protocol === 'https:' ? 443 : 80);
  if (![80, 443].includes(port)) {
    const err = new Error('Only ports 80/443 are allowed');
    err.statusCode = 400;
    throw err;
  }

  const hostname = asString(u.hostname).trim();
  if (!hostname) {
    const err = new Error('Invalid hostname');
    err.statusCode = 400;
    throw err;
  }

  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      const err = new Error('Blocked target');
      err.statusCode = 403;
      throw err;
    }
    return u;
  }

  const records = await dns.lookup(hostname, { all: true });
  for (const r of records) {
    if (isPrivateIp(r.address)) {
      const err = new Error('Blocked target');
      err.statusCode = 403;
      throw err;
    }
  }

  return u;
};

const readBodyWithLimit = async (response, maxBytes) => {
  const body = response.body;
  if (!body) return Buffer.alloc(0);

  const stream = Readable.fromWeb(body);
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > maxBytes) {
      const err = new Error('Image too large');
      err.statusCode = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks, total);
};

export const fetchProxiedImage = async (urlString, opts = {}) => {
  const maxRedirects = Number.isFinite(opts.maxRedirects) ? opts.maxRedirects : 2;
  const maxBytes = Number.isFinite(opts.maxBytes) ? opts.maxBytes : 5 * 1024 * 1024;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 8000;

  let current = await validatePublicUrl(urlString, { allowHttp: false });

  for (let i = 0; i <= maxRedirects; i += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(current.toString(), {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'llm-fyp-proxy/1.0',
          Accept: 'image/*',
        },
      });

      const isRedirect = resp.status >= 300 && resp.status < 400;
      if (isRedirect) {
        const loc = resp.headers.get('location');
        if (!loc) {
          const err = new Error('Invalid redirect');
          err.statusCode = 502;
          throw err;
        }
        current = await validatePublicUrl(new URL(loc, current).toString(), { allowHttp: false });
        continue;
      }

      if (!resp.ok) {
        const err = new Error(`Failed to fetch image: ${resp.status}`);
        err.statusCode = 502;
        throw err;
      }

      const contentType = asString(resp.headers.get('content-type')).toLowerCase();
      if (!contentType.startsWith('image/')) {
        const err = new Error('Only image content is allowed');
        err.statusCode = 415;
        throw err;
      }

      const buffer = await readBodyWithLimit(resp, maxBytes);
      return { buffer, contentType: contentType || 'image/jpeg' };
    } catch (e) {
      if (e?.name === 'AbortError') {
        const err = new Error('Proxy timeout');
        err.statusCode = 504;
        throw err;
      }
      throw e;
    } finally {
      clearTimeout(timeout);
    }
  }

  const err = new Error('Too many redirects');
  err.statusCode = 502;
  throw err;
};

