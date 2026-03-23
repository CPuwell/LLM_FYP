export const analyzeGraph = ({ nodes, edges, startNodeId }) => {
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const edgeList = Array.isArray(edges) ? edges : [];

  const nodeIds = new Set(nodeList.map((n) => n?.id).filter(Boolean));
  const startId = nodeIds.has(startNodeId) ? startNodeId : (nodeList[0]?.id || null);

  const invalidEdges = [];
  const outgoing = new Map();
  for (const n of nodeList) outgoing.set(n.id, []);

  for (const e of edgeList) {
    const source = e?.source;
    const target = e?.target;
    if (!nodeIds.has(source) || !nodeIds.has(target)) {
      invalidEdges.push(e);
      continue;
    }
    outgoing.get(source).push(target);
  }

  const reachable = new Set();
  if (startId) {
    const queue = [startId];
    reachable.add(startId);
    for (let i = 0; i < queue.length; i += 1) {
      const cur = queue[i];
      const next = outgoing.get(cur) || [];
      for (const t of next) {
        if (!reachable.has(t)) {
          reachable.add(t);
          queue.push(t);
        }
      }
    }
  }

  const unreachableNodes = nodeList.filter((n) => !reachable.has(n.id));
  const deadEndNodes = nodeList.filter((n) => (outgoing.get(n.id) || []).length === 0);

  const totalOutDegree = nodeList.reduce((sum, n) => sum + (outgoing.get(n.id) || []).length, 0);
  const avgOutDegree = nodeList.length ? totalOutDegree / nodeList.length : 0;

  const color = new Map();
  const parent = new Map();
  const cycles = [];

  const dfs = (u) => {
    color.set(u, 1);
    const next = outgoing.get(u) || [];
    for (const v of next) {
      const c = color.get(v) || 0;
      if (c === 0) {
        parent.set(v, u);
        dfs(v);
      } else if (c === 1) {
        const cycle = [v];
        let cur = u;
        const guard = new Set([v]);
        while (cur && !guard.has(cur)) {
          cycle.push(cur);
          guard.add(cur);
          cur = parent.get(cur);
        }
        cycle.reverse();
        cycles.push(cycle);
      }
    }
    color.set(u, 2);
  };

  for (const n of nodeList) {
    if ((color.get(n.id) || 0) === 0) dfs(n.id);
  }

  return {
    startId,
    nodeCount: nodeList.length,
    edgeCount: edgeList.length,
    invalidEdgeCount: invalidEdges.length,
    reachableCount: reachable.size,
    unreachableCount: unreachableNodes.length,
    deadEndCount: deadEndNodes.length,
    avgOutDegree,
    cycles,
    unreachableNodes,
    deadEndNodes,
    invalidEdges,
  };
};

