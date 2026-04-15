import { trimTo } from './strings.js';

export const PROMPT_VERSION = 'scene_v2_json';

export const buildScenePrompt = ({ title, storyContext, userPrompt, worldBibleSnippet, memory, playerState }) => {
  const safeTitle = trimTo(title, 200);
  const safeStoryContext = trimTo(storyContext, 6000);
  const safeUserPrompt = trimTo(userPrompt, 4000);
  const safeWorldBible = trimTo(worldBibleSnippet, 2600);
  const safePlayerState = trimTo(playerState, 2500);
  const safeMemorySummary = trimTo(memory?.summary, 1200);
  const safeMemoryFacts = Array.isArray(memory?.facts)
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

  return [
    'You are a narrative generation engine for an interactive story graph.',
    '',
    'Global Story Context:',
    safeStoryContext || '(none)',
    '',
    'Player State (authoritative, from tool/runtime):',
    safePlayerState || '(none)',
    '',
    'Long-term Memory (from actual playthrough):',
    safeMemorySummary || '(none)',
    safeMemoryFacts.length
      ? safeMemoryFacts.map((f) => `- ${(f.topic || f.entity) ? `[${[f.topic, f.entity].filter(Boolean).join(': ')}] ` : ''}${f.text}`).join('\n')
      : '(no facts)',
    '',
    'World Bible (relevant excerpt):',
    safeWorldBible || '(none)',
    '',
    'Current Scene Title:',
    safeTitle || '(untitled)',
    '',
    'Resolved Scene Notes (facts/constraints for THIS scene):',
    safeUserPrompt || '(none)',
    '',
    'Task:',
    '1) Write ONE description for this scene. Target 100-150 words.',
    '2) Suggest EXACTLY 3 short actions the player can take next.',
    '',
    'Rules:',
    '- Treat Resolved Scene Notes as authoritative facts for THIS scene. Do not contradict them.',
    '- If notes contain IF/ELSE, resolve silently using Player State and describe ONLY the chosen branch as present facts.',
    '- Do not mention rules/variables/hypotheticals. Do not foreshadow branches that are not true.',
    '- Do not invent facts. Only use Player State, Long-term Memory, Resolved Scene Notes, and World Bible excerpt.',
    '- Do not guess gender/pronouns. Use the character name only unless explicitly stated.',
    '- No supernatural language unless explicitly established in World Bible or Resolved Scene Notes.',
    '- Output must be strict JSON: do not include raw line breaks inside JSON strings; if you need a line break, write \\n. Escape any double quotes inside strings as \\".',
    '',
    'Output:',
    '- Return ONLY valid JSON. No markdown, no code fences, no extra keys.',
    '- Use this schema exactly:',
    '{"description":"...","actions":["...","...","..."]}',
  ].join('\n');
};
