const isPlainObject = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

const getByPath = (obj, path) => {
  if (!obj || !path) return undefined;
  const parts = `${path}`.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
};

const normalizeOp = (op) => {
  const o = (op ?? '').toString().trim().toLowerCase();
  if (!o) return 'truthy';
  if (o === '=' || o === 'eq') return '==';
  if (o === '!=' || o === 'ne') return '!=';
  if (o === 'gt') return '>';
  if (o === 'gte') return '>=';
  if (o === 'lt') return '<';
  if (o === 'lte') return '<=';
  if (o === 'exists') return 'exists';
  if (o === '!exists' || o === 'notexists') return '!exists';
  if (o === 'truthy' || o === 'true') return 'truthy';
  if (o === 'falsy' || o === 'false') return 'falsy';
  return o;
};

export const normalizeConditions = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((c) => isPlainObject(c) && typeof c.key === 'string' && c.key.trim())
      .map((c) => ({ key: c.key.trim(), op: normalizeOp(c.op), value: c.value }));
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([k]) => typeof k === 'string' && k.trim())
      .map(([k, v]) => ({ key: k.trim(), op: '==', value: v }));
  }
  return [];
};

export const evaluateConditions = (attributes, conditions) => {
  const attrs = (attributes && typeof attributes === 'object') ? attributes : {};
  const conds = normalizeConditions(conditions);
  for (const c of conds) {
    const actual = getByPath(attrs, c.key);
    const op = normalizeOp(c.op);
    if (op === 'exists') {
      if (actual === undefined) return false;
      continue;
    }
    if (op === '!exists') {
      if (actual !== undefined) return false;
      continue;
    }
    if (op === 'truthy') {
      if (!actual) return false;
      continue;
    }
    if (op === 'falsy') {
      if (actual) return false;
      continue;
    }
    if (op === '==') {
      if (actual !== c.value) return false;
      continue;
    }
    if (op === '!=') {
      if (actual === c.value) return false;
      continue;
    }
    if (op === '>' || op === '>=' || op === '<' || op === '<=') {
      const a = typeof actual === 'number' ? actual : Number(actual);
      const b = typeof c.value === 'number' ? c.value : Number(c.value);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
      if (op === '>' && !(a > b)) return false;
      if (op === '>=' && !(a >= b)) return false;
      if (op === '<' && !(a < b)) return false;
      if (op === '<=' && !(a <= b)) return false;
      continue;
    }
    return false;
  }
  return true;
};

const normalizeEffectOp = (op) => {
  const o = (op ?? '').toString().trim().toLowerCase();
  if (!o) return 'set';
  if (o === '+=' || o === 'add' || o === 'inc') return 'inc';
  if (o === '-=' || o === 'dec') return 'dec';
  if (o === 'unset' || o === 'delete' || o === 'remove') return 'unset';
  if (o === 'toggle') return 'toggle';
  if (o === 'set' || o === '=') return 'set';
  return o;
};

export const normalizeEffects = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .filter((e) => isPlainObject(e) && typeof e.key === 'string' && e.key.trim())
      .map((e) => ({ key: e.key.trim(), op: normalizeEffectOp(e.op), value: e.value }));
  }
  if (isPlainObject(value)) {
    return Object.entries(value)
      .filter(([k]) => typeof k === 'string' && k.trim())
      .map(([k, v]) => ({ key: k.trim(), op: 'set', value: v }));
  }
  return [];
};

export const applyEffects = (attributes, effects) => {
  const prev = (attributes && typeof attributes === 'object') ? attributes : {};
  const next = { ...prev };
  const effs = normalizeEffects(effects);
  for (const e of effs) {
    const op = normalizeEffectOp(e.op);
    if (op === 'set') {
      next[e.key] = e.value;
      continue;
    }
    if (op === 'unset') {
      delete next[e.key];
      continue;
    }
    if (op === 'toggle') {
      next[e.key] = !Boolean(next[e.key]);
      continue;
    }
    if (op === 'inc' || op === 'dec') {
      const cur = typeof next[e.key] === 'number' ? next[e.key] : Number(next[e.key] ?? 0);
      const delta = typeof e.value === 'number' ? e.value : Number(e.value ?? 1);
      const safeCur = Number.isFinite(cur) ? cur : 0;
      const safeDelta = Number.isFinite(delta) ? delta : 1;
      next[e.key] = op === 'inc' ? safeCur + safeDelta : safeCur - safeDelta;
      continue;
    }
  }
  return next;
};

