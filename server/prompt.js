import { trimTo } from './strings.js';

export const PROMPT_VERSION = 'scene_v2_json';

export const buildScenePrompt = ({ title, storyContext, userPrompt, worldBibleSnippet, memory, playerState }) => {
  const safeTitle = trimTo(title, 200);
  const safeStoryContext = trimTo(storyContext, 12000);
  const safeUserPrompt = trimTo(userPrompt, 6000);
  const safeWorldBible = trimTo(worldBibleSnippet, 4000);
  const safePlayerState = trimTo(playerState, 3000);
  const safeMemorySummary = trimTo(memory?.summary, 2000);
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
    'User Notes/Draft (highest priority for this scene):',
    safeUserPrompt || '(none)',
    '',
    'Task:',
    '1) Write ONE atmospheric description for this scene. Max 100 words.',
    '2) Suggest EXACTLY 3 short actions the player can take next.',
    '',
    'Rules:',
    '- If User Notes/Draft is provided, it overrides Global Story Context for this scene.',
    '- Keep actions concrete and distinct.',
    '',
    'Output:',
    '- Return ONLY valid JSON. No markdown, no code fences, no extra keys.',
    '- Use this schema exactly:',
    '{"description":"...","actions":["...","...","..."]}',
  ].join('\n');
};
