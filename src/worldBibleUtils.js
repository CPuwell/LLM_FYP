export const getInitialWorldBible = () => ({
  premise: '',
  tone: '',
  rules: '',
  styleGuide: '',
  characters: [],
  locations: [],
});

export const sanitizeWorldBible = (wb, fallbackWorldBible) => {
  const base = (fallbackWorldBible && typeof fallbackWorldBible === 'object') ? fallbackWorldBible : getInitialWorldBible();
  const src = (wb && typeof wb === 'object') ? wb : base;

  const cleanList = (arr) => (Array.isArray(arr) ? arr : [])
    .map((e) => ({
      name: typeof e?.name === 'string' ? e.name : '',
      description: typeof e?.description === 'string' ? e.description : '',
    }))
    .filter((e) => e.name.trim() || e.description.trim())
    .slice(0, 100);

  return {
    premise: typeof src.premise === 'string' ? src.premise : '',
    tone: typeof src.tone === 'string' ? src.tone : '',
    rules: typeof src.rules === 'string' ? src.rules : '',
    styleGuide: typeof src.styleGuide === 'string' ? src.styleGuide : '',
    characters: cleanList(src.characters),
    locations: cleanList(src.locations),
  };
};
