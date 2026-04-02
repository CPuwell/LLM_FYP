import { asString, trimTo } from './strings.js';

export const normalizeWorldBible = (wb) => {
  const src = (wb && typeof wb === 'object') ? wb : {};
  const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
    .map((e) => ({
      name: trimTo(e?.name, 120),
      description: trimTo(e?.description, 800),
    }))
    .map((e) => ({
      name: e.name.trim(),
      description: e.description.trim(),
    }))
    .filter((e) => e.name || e.description)
    .slice(0, 200);

  return {
    premise: trimTo(src.premise, 2000),
    tone: trimTo(src.tone, 800),
    rules: trimTo(src.rules, 2500),
    styleGuide: trimTo(src.styleGuide, 2500),
    characters: cleanList(src.characters),
    locations: cleanList(src.locations),
  };
};

const terms = (s) => {
  const t = asString(s).toLowerCase();
  return Array.from(new Set(t.split(/[^a-z0-9]+/).filter((p) => p.length >= 4)));
};

export const buildWorldBibleSnippet = (wb, queryText, selectedLocationName, opts = {}) => {
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : 2600;
  const locationLimit = Number.isFinite(opts.locationLimit) ? opts.locationLimit : 6;
  const characterLimit = Number.isFinite(opts.characterLimit) ? opts.characterLimit : 6;

  const q = asString(queryText).toLowerCase();
  const data = normalizeWorldBible(wb);
  const selected = asString(selectedLocationName).trim();
  const selectedLower = selected.toLowerCase();
  const selectedLocation = selectedLower
    ? data.locations.find((l) => asString(l?.name).toLowerCase() === selectedLower)
    : null;

  const scoreEntry = (e) => {
    const name = asString(e?.name).toLowerCase();
    const desc = asString(e?.description).toLowerCase();
    if (!name && !desc) return 0;
    let score = 0;
    if (name && q.includes(name)) score += 16;
    for (const p of terms(name)) {
      if (q.includes(p)) score += 3;
    }
    for (const p of terms(desc)) {
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

  const topLocations = top(data.locations, locationLimit);
  const topCharacters = top(data.characters, characterLimit);

  const lines = [];
  if (data.premise) lines.push(`Premise: ${data.premise}`);
  if (data.tone) lines.push(`Tone: ${data.tone}`);
  if (data.rules) lines.push(`World Rules: ${data.rules}`);
  if (data.styleGuide) lines.push(`Style Guide: ${data.styleGuide}`);
  if (selected) lines.push(`Selected Location: ${selected}`);

  if (topLocations.length) {
    lines.push('Relevant Locations:');
    const ordered = selectedLocation
      ? [selectedLocation, ...topLocations.filter((l) => asString(l?.name) !== asString(selectedLocation?.name))]
      : topLocations;
    for (const l of ordered) {
      const name = asString(l?.name).trim();
      const description = asString(l?.description).trim();
      if (!name && !description) continue;
      lines.push(`- ${name || '(unnamed)'}${description ? `: ${description}` : ''}`);
    }
  }

  if (topCharacters.length) {
    lines.push('Relevant Characters:');
    for (const c of topCharacters) {
      const name = asString(c?.name).trim();
      const description = asString(c?.description).trim();
      if (!name && !description) continue;
      lines.push(`- ${name || '(unnamed)'}${description ? `: ${description}` : ''}`);
    }
  }

  const out = lines.join('\n').trim();
  return out.length > maxChars ? out.slice(0, maxChars) : out;
};

