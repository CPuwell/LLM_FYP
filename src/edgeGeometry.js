export const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export const cubicPoint = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

export const cubicDerivative = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

export const getTangent = (pos) => {
  if (pos === 'top') return { x: 0, y: -1 };
  if (pos === 'bottom') return { x: 0, y: 1 };
  if (pos === 'left') return { x: -1, y: 0 };
  if (pos === 'right') return { x: 1, y: 0 };
  return { x: 0, y: 1 };
};

export const edgeSign = (id, offset = 0) => (
  offset !== 0 ? Math.sign(offset) : ((`${id}`.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1)
);

const numberPattern = '(-?(?:\\d+\\.?\\d*|\\.\\d+))';
const cubicPathPattern = new RegExp(
  `^M\\s*${numberPattern},\\s*${numberPattern}\\s*C\\s*${numberPattern},\\s*${numberPattern}\\s*${numberPattern},\\s*${numberPattern}\\s*${numberPattern},\\s*${numberPattern}\\s*$`,
);

export const parseCubicPath = (path) => {
  const match = cubicPathPattern.exec(path);
  if (!match) return null;
  const nums = match.slice(1).map((n) => Number(n));
  return [
    { x: nums[0], y: nums[1] },
    { x: nums[2], y: nums[3] },
    { x: nums[4], y: nums[5] },
    { x: nums[6], y: nums[7] },
  ];
};

export const formatCubicPath = ([p0, p1, p2, p3]) => (
  `M ${p0.x},${p0.y} C ${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`
);

export const bendCubicPath = (basePath, bendDx, bendDy) => {
  const points = parseCubicPath(basePath);
  if (!points) return basePath;
  const [p0, p1, p2, p3] = points;
  return formatCubicPath([
    p0,
    { x: p1.x + bendDx, y: p1.y + bendDy },
    { x: p2.x + bendDx, y: p2.y + bendDy },
    p3,
  ]);
};
