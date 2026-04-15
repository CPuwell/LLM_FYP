import { evaluateConditions } from './attributeEngine.js';

const asString = (v) => (v === undefined || v === null) ? '' : `${v}`;

const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const stripBullet = (s) => asString(s).trim().replace(/^[-*•]\s*/, '');

const parseScalar = (raw) => {
  const s = asString(raw).trim();
  const lower = s.toLowerCase();
  if (lower === 'true' || lower === 'ture') return true;
  if (lower === 'false') return false;
  const n = Number(s);
  if (Number.isFinite(n) && s !== '') return n;
  return s.replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1');
};

const normalizeWhen = (when) => {
  if (!when) return null;
  if (Array.isArray(when)) return when;
  if (!isPlainObject(when)) return when;

  const asKey = (x) => asString(x).trim();
  const cmp = (op, arr) => {
    if (!Array.isArray(arr) || arr.length < 2) return null;
    const key = asKey(arr[0]);
    if (!key) return null;
    return [{ key, op, value: arr[1] }];
  };
  const unary = (op, arr) => {
    if (!Array.isArray(arr) || arr.length < 1) return null;
    const key = asKey(arr[0]);
    if (!key) return null;
    return [{ key, op }];
  };

  if (Object.prototype.hasOwnProperty.call(when, 'eq')) return cmp('==', when.eq);
  if (Object.prototype.hasOwnProperty.call(when, 'ne')) return cmp('!=', when.ne);
  if (Object.prototype.hasOwnProperty.call(when, 'gt')) return cmp('>', when.gt);
  if (Object.prototype.hasOwnProperty.call(when, 'gte')) return cmp('>=', when.gte);
  if (Object.prototype.hasOwnProperty.call(when, 'lt')) return cmp('<', when.lt);
  if (Object.prototype.hasOwnProperty.call(when, 'lte')) return cmp('<=', when.lte);
  if (Object.prototype.hasOwnProperty.call(when, 'truthy')) return unary('truthy', when.truthy);
  if (Object.prototype.hasOwnProperty.call(when, 'falsy')) return unary('falsy', when.falsy);
  if (Object.prototype.hasOwnProperty.call(when, 'exists')) return unary('exists', when.exists);
  if (Object.prototype.hasOwnProperty.call(when, 'notExists')) return unary('!exists', when.notExists);
  if (Object.prototype.hasOwnProperty.call(when, '!exists')) return unary('!exists', when['!exists']);

  return when;
};

const parseLenientJson = (input) => {
  const raw = asString(input).trim();
  if (!raw) return null;
  const looksJson = raw.startsWith('{') || raw.startsWith('[');
  if (!looksJson) return null;

  const fixTrailingCommas = (s) => s.replace(/,\s*([}\]])/g, '$1');

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  const direct = tryParse(fixTrailingCommas(raw));
  if (direct) return direct;

  const wrapped = raw.startsWith('[') ? raw : `[${raw}]`;
  const wrappedParsed = tryParse(fixTrailingCommas(wrapped));
  if (wrappedParsed) return wrappedParsed;

  return null;
};

const resolveFromBlocks = (blocks, attributes) => {
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const out = [];
  for (const b of Array.isArray(blocks) ? blocks : []) {
    if (!b) continue;
    const text = asString(b?.text || b?.value).trim();
    if (!text) continue;
    const whenRaw = b?.when ?? b?.requirements ?? b?.conditions ?? b?.if;
    const when = normalizeWhen(whenRaw);
    if (!when || evaluateConditions(attrs, when)) out.push(text);
  }
  return out.join('\n').trim();
};

const parseConditionText = (condRaw) => {
  const cond = asString(condRaw).trim();
  if (!cond) return null;

  const mIs = cond.match(/^([a-zA-Z0-9_.-]+)\s+is\s+(true|ture|false)\s*$/i);
  if (mIs) {
    return [{ key: mIs[1], op: '==', value: parseScalar(mIs[2]) }];
  }

  const mCmp = cond.match(/^([a-zA-Z0-9_.-]+)\s*(==|!=|<=|>=|<|>|=)\s*(.+)\s*$/);
  if (mCmp) {
    const op = mCmp[2] === '=' ? '==' : mCmp[2];
    return [{ key: mCmp[1], op, value: parseScalar(mCmp[3]) }];
  }

  const mTruthy = cond.match(/^([a-zA-Z0-9_.-]+)\s*$/);
  if (mTruthy) return [{ key: mTruthy[1], op: 'truthy' }];

  return null;
};

const parseSettingRules = (settingText) => {
  const raw = asString(settingText);
  const lines = raw.split(/\r?\n/).map(stripBullet).map((l) => l.trim()).filter(Boolean);
  const rules = [];
  let last = null;
  for (const line of lines) {
    const mIf = line.match(/^if\s+(.+?)\s*:\s*(.+)$/i);
    if (mIf) {
      const cond = parseConditionText(mIf[1]);
      const thenText = mIf[2].trim();
      if (cond && thenText) {
        last = { cond, thenText, elseText: '' };
        rules.push(last);
        continue;
      }
    }
    const mElse = line.match(/^else\s*:\s*(.+)$/i);
    if (mElse && last) {
      last.elseText = mElse[1].trim();
      last = null;
      continue;
    }
    rules.push({ cond: null, thenText: line.trim(), elseText: '' });
    last = null;
  }
  return rules;
};

const resolveFromRules = (rules, attributes) => {
  const out = [];
  for (const r of rules) {
    if (!r?.thenText) continue;
    if (!r.cond) {
      out.push(r.thenText);
      continue;
    }
    const ok = evaluateConditions(attributes, r.cond);
    if (ok) out.push(r.thenText);
    else if (r.elseText) out.push(r.elseText);
  }
  return out.join('\n').trim();
};

export const resolveNodeUserPrompt = (nodeData, attributes) => {
  const data = (nodeData && typeof nodeData === 'object') ? nodeData : {};
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const blocks = Array.isArray(data.settingBlocks) ? data.settingBlocks : null;
  if (blocks && blocks.length) {
    return resolveFromBlocks(blocks, attrs);
  }
  const raw = asString(data.setting || '');
  if (!raw.trim()) return '';
  const json = parseLenientJson(raw);
  if (json) {
    const list = Array.isArray(json) ? json : [json];
    const resolved = resolveFromBlocks(list, attrs);
    if (resolved) return resolved;
  }
  const rules = parseSettingRules(raw);
  const resolved = resolveFromRules(rules, attrs);
  return resolved || raw.trim();
};
