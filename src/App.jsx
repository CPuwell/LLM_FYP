// src/App.jsx
import { useState, useCallback, useRef, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, applyNodeChanges, applyEdgeChanges, addEdge, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';

import Sidebar from './Sidebar.jsx';
import './Sidebar.css';
import CustomNode from './CustomNode.jsx'; 
import './CustomNode.css';
// --- 新增：引入 PlayerView 和它的样式 ---
import PlayerView from './PlayerView.jsx';
import './PlayerView.css';
import SaveLoadModal from './SaveLoadModal.jsx';
import WorldBibleModal from './WorldBibleModal.jsx';
import './WorldBibleModal.css';
import StoryAnalysisModal from './StoryAnalysisModal.jsx';
import './StoryAnalysisModal.css';
import GuideModal from './GuideModal.jsx';
import './GuideModal.css';
import EvaluationLogsModal from './EvaluationLogsModal.jsx';
import './EvaluationLogsModal.css';
import ChoiceEdge from './ChoiceEdge.jsx';
import SmoothStepEdge from './SmoothStepEdge.jsx';
import BezierEdge from './BezierEdge.jsx';
import DefaultEdge from './DefaultEdge.jsx';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';
import { analyzeGraph } from './analysisUtils.js';
import { getEvaluationLogs } from './evaluationLog.js';

const nodeTypes = { custom: CustomNode };
const edgeTypes = { choice: ChoiceEdge, smoothstepx: SmoothStepEdge, bezierx: BezierEdge, defaultx: DefaultEdge };

const withEdgeLayout = (eds, nodes) => {
  const edges = Array.isArray(eds) ? eds : [];
  const nodeList = Array.isArray(nodes) ? nodes : [];
  const posById = new Map(nodeList.map((n) => [n.id, n?.position]));
  const nonSelf = edges.filter((e) => typeof e?.source === 'string' && typeof e?.target === 'string' && e.source !== e.target);
  const selfLoops = edges.filter((e) => typeof e?.source === 'string' && typeof e?.target === 'string' && e.source === e.target);

  const pairGroups = new Map();
  for (const e of nonSelf) {
    const key = [e.source, e.target].sort().join('|');
    if (!pairGroups.has(key)) pairGroups.set(key, []);
    pairGroups.get(key).push(e);
  }

  const pairSpacing = 54;
  const pairOffsetById = new Map();
  for (const [, list] of pairGroups) {
    const ordered = [...list].sort((a, b) => `${a.id}`.localeCompare(`${b.id}`));
    const n = ordered.length;
    for (let i = 0; i < n; i += 1) {
      const e = ordered[i];
      const offset = Math.round((i - (n - 1) / 2) * pairSpacing);
      pairOffsetById.set(e.id, offset);
    }
  }

  const outGroups = new Map();
  for (const e of nonSelf) {
    if (!outGroups.has(e.source)) outGroups.set(e.source, []);
    outGroups.get(e.source).push(e);
  }

  const outSpacing = 20;
  const outOffsetById = new Map();
  for (const [, list] of outGroups) {
    const ordered = [...list].sort((a, b) => `${a.target}-${a.id}`.localeCompare(`${b.target}-${b.id}`));
    const n = ordered.length;
    for (let i = 0; i < n; i += 1) {
      const e = ordered[i];
      const offset = Math.round((i - (n - 1) / 2) * outSpacing);
      outOffsetById.set(e.id, offset);
    }
  }

  const labelTById = new Map();
  for (const [, list] of outGroups) {
    const ordered = [...list].sort((a, b) => `${a.target}-${a.id}`.localeCompare(`${b.target}-${b.id}`));
    const n = ordered.length;
    for (let i = 0; i < n; i += 1) {
      const e = ordered[i];
      const raw = 0.5 + (i - (n - 1) / 2) * 0.07;
      const t = Math.max(0.25, Math.min(0.75, raw));
      labelTById.set(e.id, t);
    }
  }

  const loopGroups = new Map();
  for (const e of selfLoops) {
    if (!loopGroups.has(e.source)) loopGroups.set(e.source, []);
    loopGroups.get(e.source).push(e);
  }

  const loopMetaById = new Map();
  for (const [, list] of loopGroups) {
    const ordered = [...list].sort((a, b) => `${a.id}`.localeCompare(`${b.id}`));
    const n = ordered.length;
    for (let i = 0; i < n; i += 1) {
      loopMetaById.set(ordered[i].id, { loopIndex: i, loopCount: n });
    }
  }

  const computed = edges.map((e) => {
    const baseData = e?.data && typeof e.data === 'object' ? e.data : {};
    const isSelfLoop = typeof e?.source === 'string' && e.source === e?.target;
    const pairOffset = pairOffsetById.get(e.id) || 0;
    const outOffset = outOffsetById.get(e.id) || 0;
    const baseOffset = pairOffset + outOffset;
    const sPos = posById.get(e.source);
    const tPos = posById.get(e.target);
    const isBackJump = Boolean(
      !isSelfLoop &&
      Number.isFinite(sPos?.y) &&
      Number.isFinite(tPos?.y) &&
      sPos.y > tPos.y + 1
    );
    const dir = baseOffset !== 0 ? Math.sign(baseOffset) : ((`${e.id}`.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1);
    const backJumpExtra = 140;
    const offset = isSelfLoop ? 0 : (baseOffset + (isBackJump ? dir * backJumpExtra : 0));
    const loopMeta = loopMetaById.get(e.id) || {};
    const baseStyle = e?.style && typeof e.style === 'object' ? e.style : {};
    const style = isBackJump
      ? { ...baseStyle, stroke: '#7c3aed', strokeWidth: 2, strokeDasharray: '6 4' }
      : baseStyle;
    const normalizeSourceHandle = (h) => {
      if (h === 'sR') return 'sB';
      if (h === 'sB' || h === 'sL') return h;
      return undefined;
    };
    const normalizeTargetHandle = (h) => {
      if (h === 'tL') return 'tT';
      if (h === 'tT' || h === 'tR') return h;
      return undefined;
    };
    const sourceHandle = normalizeSourceHandle(e?.sourceHandle)
      ?? (isBackJump ? 'sL' : 'sB');
    const targetHandle = normalizeTargetHandle(e?.targetHandle)
      ?? (isBackJump ? 'tR' : 'tT');
    const bundleKey = (!isSelfLoop && typeof e?.source === 'string' && typeof e?.target === 'string')
      ? `${e.source}|${e.target}|${sourceHandle}|${targetHandle}`
      : undefined;

    return {
      ...e,
      type: typeof e?.type === 'string' ? e.type : 'choice',
      style,
      sourceHandle,
      targetHandle,
      data: {
        ...baseData,
        offset,
        labelT: isSelfLoop ? undefined : (labelTById.get(e.id) || 0.5),
        isSelfLoop,
        isBackJump,
        bundleKey,
        ...(isSelfLoop ? loopMeta : {}),
      },
    };
  });
  const bundleGroups = new Map();
  for (const e of computed) {
    const key = e?.data?.bundleKey;
    if (!key) continue;
    if (!bundleGroups.has(key)) bundleGroups.set(key, []);
    bundleGroups.get(key).push(e);
  }
  for (const [, list] of bundleGroups) {
    if (list.length <= 1) continue;
    const ordered = [...list].sort((a, b) => `${a.id}`.localeCompare(`${b.id}`));
    const n = ordered.length;
    for (let i = 0; i < n; i += 1) {
      const e = ordered[i];
      e.data = { ...(e.data || {}), bundleIndex: i, bundleCount: n };
    }
  }
  for (const e of computed) {
    if (e?.data?.bundleKey) {
      const { bundleKey, ...rest } = e.data;
      e.data = rest;
    }
  }
  return computed;
};

const getInitialNodes = () => [
  { id: '1', type: 'custom', position: { x: 250, y: 50 }, data: { label: 'Story Start', description: '', imageUrl: '', location: '' } }
];

const getInitialWorldBible = () => ({
  premise: '',
  tone: '',
  rules: '',
  styleGuide: '',
  characters: [],
  locations: [],
});

const initialNodes = JSON.parse(localStorage.getItem('storyNodes')) || getInitialNodes();
const initialEdges = withEdgeLayout(JSON.parse(localStorage.getItem('storyEdges')) || [], initialNodes);
const initialContext = localStorage.getItem('storyContext') || "An interactive fantasy fiction role play game. It is dusk, and there are dangerous woodland creatures around. Make each description atmospheric.";
const initialWorldBible = JSON.parse(localStorage.getItem('worldBible')) || getInitialWorldBible();
let nodeId = initialNodes.reduce((maxId, node) => Math.max(maxId, parseInt(node.id)), 0) + 1;

const sanitizeWorldBible = (wb, fallbackWorldBible) => {
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

const sanitizeStoryData = (data, { fallbackStoryContext, fallbackWorldBible } = {}) => {
  const report = {
    nodesAdded: 0,
    nodesFixed: 0,
    nodesRemoved: 0,
    edgesFixed: 0,
    edgesRemoved: 0,
    worldBibleFixed: 0,
  };

  const rawNodes = Array.isArray(data?.nodes) ? data.nodes : [];
  const rawEdges = Array.isArray(data?.edges) ? data.edges : [];
  const storyContext = typeof data?.storyContext === 'string'
    ? data.storyContext
    : (typeof fallbackStoryContext === 'string' ? fallbackStoryContext : initialContext);
  const worldBible = sanitizeWorldBible(data?.worldBible, fallbackWorldBible);
  const beforeWorldBible = (fallbackWorldBible && typeof fallbackWorldBible === 'object') ? fallbackWorldBible : null;
  if (beforeWorldBible && JSON.stringify(beforeWorldBible) !== JSON.stringify(worldBible)) report.worldBibleFixed += 1;

  const fallbackNodes = getInitialNodes();
  const nodesInput = rawNodes.length > 0 ? rawNodes : fallbackNodes;
  if (rawNodes.length === 0) report.nodesAdded += fallbackNodes.length;

  const usedIds = new Set();
  let nextId = nodesInput.reduce((max, n) => Math.max(max, parseInt(n?.id) || 0), 0) + 1;

  const nodes = nodesInput.map((n) => {
    const originalId = n?.id;
    let id = typeof originalId === 'string' ? originalId : `${parseInt(originalId) || ''}`;
    if (!id || usedIds.has(id)) {
      id = `${nextId++}`;
      report.nodesFixed += 1;
    }
    usedIds.add(id);

    const position = {
      x: Number.isFinite(n?.position?.x) ? n.position.x : 0,
      y: Number.isFinite(n?.position?.y) ? n.position.y : 0,
    };

    const dataObj = n?.data ?? {};
    const label = typeof dataObj.label === 'string' && dataObj.label.trim() ? dataObj.label : `Scene ${id}`;
    const description = typeof dataObj.description === 'string' ? dataObj.description : '';
    const imageUrl = typeof dataObj.imageUrl === 'string' ? dataObj.imageUrl : '';
    const location = typeof dataObj.location === 'string' ? dataObj.location : '';
    const suggestedActions = Array.isArray(dataObj.suggestedActions)
      ? dataObj.suggestedActions.filter((a) => typeof a === 'string' && a.trim()).slice(0, 10)
      : undefined;

    const normalized = {
      id,
      type: n?.type === 'custom' ? 'custom' : 'custom',
      position,
      data: { label, description, imageUrl, location, ...(suggestedActions ? { suggestedActions } : {}) },
    };

    const changed =
      normalized.id !== originalId ||
      normalized.type !== n?.type ||
      normalized.position.x !== n?.position?.x ||
      normalized.position.y !== n?.position?.y ||
      normalized.data.label !== dataObj.label ||
      normalized.data.description !== dataObj.description ||
      normalized.data.imageUrl !== dataObj.imageUrl ||
      normalized.data.location !== dataObj.location;
    if (changed) report.nodesFixed += 1;

    return normalized;
  });

  const nodeIdSet = new Set(nodes.map((n) => n.id));
  const edgeIds = new Set();

  const edges = rawEdges
    .map((e, idx) => {
      const source = typeof e?.source === 'string' ? e.source : `${e?.source ?? ''}`;
      const target = typeof e?.target === 'string' ? e.target : `${e?.target ?? ''}`;
      if (!source || !target || !nodeIdSet.has(source) || !nodeIdSet.has(target)) {
        report.edgesRemoved += 1;
        return null;
      }

      let id = typeof e?.id === 'string' && e.id ? e.id : `e${source}-${target}-${idx}`;
      if (edgeIds.has(id)) {
        id = `e${source}-${target}-${idx}-${Math.random().toString(16).slice(2)}`;
        report.edgesFixed += 1;
      }
      edgeIds.add(id);

      const label = typeof e?.label === 'string' && e.label.trim() ? e.label : 'Choice...';
      if (label !== e?.label) report.edgesFixed += 1;

      return {
        id,
        source,
        target,
        label,
        type: typeof e?.type === 'string' ? e.type : 'choice',
        data: e?.data && typeof e.data === 'object' ? e.data : undefined,
        sourceHandle: typeof e?.sourceHandle === 'string' ? e.sourceHandle : undefined,
        targetHandle: typeof e?.targetHandle === 'string' ? e.targetHandle : undefined,
      };
    })
    .filter(Boolean);

  const maxId = nodes.reduce((max, node) => Math.max(max, parseInt(node.id) || 0), 0);
  const nextGlobalNodeId = maxId + 1;

  return { nodes, edges: withEdgeLayout(edges, nodes), storyContext, worldBible, report, nextGlobalNodeId };
};

function App() {
  const [nodes, setNodes] = useState(initialNodes);
  const [edges, setEdges] = useState(initialEdges);
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [storyContext, setStoryContext] = useState(initialContext);
  const [worldBible, setWorldBible] = useState(initialWorldBible);
  // --- 新增：管理播放状态 ---
  const [isPlaying, setIsPlaying] = useState(false);
  // --- 新增：管理存档模态框 ---
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isWorldBibleOpen, setIsWorldBibleOpen] = useState(false);
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(false);
  const [isGuideOpen, setIsGuideOpen] = useState(false);
  const [isLogsOpen, setIsLogsOpen] = useState(false);
  const [edgeStyleMode, setEdgeStyleMode] = useState('custom');
  const autosaveTimeoutRef = useRef(null);

  useEffect(() => {
    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    autosaveTimeoutRef.current = setTimeout(() => {
      try {
        localStorage.setItem('storyNodes', JSON.stringify(nodes));
        localStorage.setItem('storyEdges', JSON.stringify(edges));
        localStorage.setItem('storyContext', storyContext);
        localStorage.setItem('worldBible', JSON.stringify(worldBible));
      } catch (e) {
      }
    }, 600);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [nodes, edges, storyContext, worldBible]);
  
  const onNodesChange = useCallback((changes) => {
    setNodes((nds) => {
      const next = applyNodeChanges(changes, nds);
      setEdges((eds) => withEdgeLayout(eds, next));
      return next;
    });
  }, [setNodes, setEdges]);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => withEdgeLayout(applyEdgeChanges(changes, eds), nodes)),[setEdges, nodes]);
  const onConnect = useCallback((params) => {
    const edgeType = edgeStyleMode === 'smoothstep'
      ? 'smoothstepx'
      : (edgeStyleMode === 'bezier' ? 'bezierx' : (edgeStyleMode === 'defaultPlus' ? 'defaultx' : (edgeStyleMode === 'default' ? 'bezier' : 'choice')));
    setEdges((eds) => withEdgeLayout(addEdge({ ...params, label: 'Choice...', type: edgeType }, eds), nodes));
  }, [setEdges, nodes, edgeStyleMode]);

  const addNode = useCallback(() => {
    const newNode = {
      id: `${nodeId++}`,
      type: 'custom',
      position: { x: Math.random() * 400, y: Math.random() * 400 },
      data: { label: `New Scene ${nodeId - 1}`, description: '', imageUrl: '', location: '' },
    };
    setNodes((currentNodes) => [...currentNodes, newNode]);
  }, []);
  
  const addNodeFromSuggestion = useCallback((sourceNodeId, actionText) => {
    const sourceNode = nodes.find(n => n.id === sourceNodeId);
    if (!sourceNode) return;

    const newNode = {
      id: `${nodeId++}`,
      type: 'custom',
      position: { x: sourceNode.position.x, y: sourceNode.position.y + 250 },
      data: { label: actionText, description: '', imageUrl: '', location: sourceNode?.data?.location || '' },
    };

    const newEdge = {
      id: `e${sourceNodeId}-${newNode.id}`,
      source: sourceNodeId,
      target: newNode.id,
      label: actionText,
      type: edgeStyleMode === 'smoothstep'
        ? 'smoothstepx'
        : (edgeStyleMode === 'bezier' ? 'bezierx' : (edgeStyleMode === 'defaultPlus' ? 'defaultx' : (edgeStyleMode === 'default' ? 'bezier' : 'choice'))),
      sourceHandle: 'sB',
      targetHandle: 'tT',
    };

    const nextNodes = [...nodes, newNode];
    setNodes(nextNodes);
    setEdges((eds) => withEdgeLayout([...eds, newEdge], nextNodes));
  }, [nodes, edgeStyleMode]);

  const onNodeClick = useCallback((event, node) => {
    setSelectedNode(node);
    setSelectedEdge(null);
  }, []);
  
  const onEdgeClick = useCallback((event, edge) => {
    setSelectedEdge(edge);
    setSelectedNode(null);
  }, []);
  
  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setSelectedEdge(null);
  }, []);

  const onDataChange = useCallback((newData) => {
    if (!selectedNode) return;
    
    // 更新 nodes 状态
    setNodes((nds) =>
      nds.map((node) => {
        if (node.id === selectedNode.id) {
          // 返回一个新的节点对象，而不是直接修改
          return { ...node, data: { ...node.data, ...newData } };
        }
        return node;
      })
    );

    // 同时更新 selectedNode 状态，确保 Sidebar 能够接收到最新的值
    setSelectedNode((prev) => ({
      ...prev,
      data: { ...prev.data, ...newData }
    }));
  }, [selectedNode, setNodes]);

  const onEdgeLabelChange = useCallback((newLabel) => {
    if (!selectedEdge) return;
    setEdges((eds) =>
      eds.map((edge) => (edge.id === selectedEdge.id ? { ...edge, label: newLabel } : edge))
    );
    setSelectedEdge((prev) => (prev ? { ...prev, label: newLabel } : prev));
  }, [selectedEdge, setEdges]);
  
  const saveStory = useCallback(() => {
    localStorage.setItem('storyNodes', JSON.stringify(nodes));
    localStorage.setItem('storyEdges', JSON.stringify(edges));
    localStorage.setItem('storyContext', storyContext); // Also save context
    localStorage.setItem('worldBible', JSON.stringify(worldBible));
    alert('Story Saved to Browser Storage!');
  }, [nodes, edges, storyContext, worldBible]);

  // --- 新增：导出为文件 ---
  const exportStory = useCallback(() => {
    const storyData = {
      nodes,
      edges,
      storyContext,
      worldBible
    };
    const blob = new Blob([JSON.stringify(storyData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `story-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges, storyContext, worldBible]);

  const exportEvaluationPack = useCallback(() => {
    const analysis = analyzeGraph({ nodes, edges, startNodeId: '1' });
    const logs = getEvaluationLogs();
    const pack = {
      createdAt: new Date().toISOString(),
      story: { nodes, edges, storyContext, worldBible },
      analysis: {
        startId: analysis.startId,
        nodeCount: analysis.nodeCount,
        edgeCount: analysis.edgeCount,
        invalidEdgeCount: analysis.invalidEdgeCount,
        reachableCount: analysis.reachableCount,
        unreachableCount: analysis.unreachableCount,
        deadEndCount: analysis.deadEndCount,
        avgOutDegree: Number.isFinite(analysis.avgOutDegree) ? Number(analysis.avgOutDegree.toFixed(3)) : 0,
        cycles: analysis.cycles,
        unreachableNodes: analysis.unreachableNodes.map((n) => ({ id: n.id, label: n?.data?.label || '' })),
        deadEndNodes: analysis.deadEndNodes.map((n) => ({ id: n.id, label: n?.data?.label || '' })),
      },
      evaluationLogs: logs,
    };

    const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-pack-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [nodes, edges, storyContext, worldBible]);

  // --- 新增：从文件导入 ---
  const fileInputRef = useRef(null);

  const handleImportClick = () => {
    fileInputRef.current.click();
  };

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        const sanitized = sanitizeStoryData(data, { fallbackStoryContext: storyContext, fallbackWorldBible: worldBible });
        setNodes(sanitized.nodes);
        setEdges(withEdgeLayout(sanitized.edges, sanitized.nodes));
        setStoryContext(sanitized.storyContext);
        setWorldBible(sanitized.worldBible);
        setSelectedNode(null);
        setSelectedEdge(null);
        nodeId = sanitized.nextGlobalNodeId;

        const { report } = sanitized;
        const detail = [
          report.nodesFixed ? `Nodes fixed: ${report.nodesFixed}` : null,
          report.nodesAdded ? `Nodes added: ${report.nodesAdded}` : null,
          report.edgesFixed ? `Edges fixed: ${report.edgesFixed}` : null,
          report.edgesRemoved ? `Edges removed: ${report.edgesRemoved}` : null,
          report.worldBibleFixed ? `World bible updated` : null,
        ].filter(Boolean).join(', ');
        alert(detail ? `Story Loaded Successfully!\n${detail}` : 'Story Loaded Successfully!');
      } catch (error) {
        console.error("Import error:", error);
        alert('Error reading file. Please make sure it is a valid JSON file.');
      }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset input
  };

  const newStory = useCallback(() => {
    const confirmed = window.confirm("Are you sure you want to start a new story?");
    if (confirmed) {
      const freshNodes = getInitialNodes();
      setNodes(freshNodes);
      setEdges([]);
      setSelectedNode(null);
      setSelectedEdge(null);
      setStoryContext(initialContext);
      setWorldBible(getInitialWorldBible());
      localStorage.removeItem('storyNodes');
      localStorage.removeItem('storyEdges');
      localStorage.removeItem('storyContext');
      localStorage.removeItem('worldBible');
      nodeId = freshNodes.length + 1;
    }
  }, []);

  const onDeleteElement = useCallback(() => {
    if (selectedNode) {
      const nextNodes = nodes.filter((node) => node.id !== selectedNode.id);
      const nextEdges = edges.filter((edge) => edge.source !== selectedNode.id && edge.target !== selectedNode.id);
      setNodes(nextNodes);
      setEdges(withEdgeLayout(nextEdges, nextNodes));
      setSelectedNode(null);
    }
    if (selectedEdge) {
      const nextEdges = edges.filter((edge) => edge.id !== selectedEdge.id);
      setEdges(withEdgeLayout(nextEdges, nodes));
      setSelectedEdge(null);
    }
  }, [selectedNode, selectedEdge, nodes, edges, setNodes, setEdges]);

  // --- 新增：处理从备份加载 ---
  const handleLoadFromBackup = useCallback((data) => {
    const sanitized = sanitizeStoryData(data, { fallbackStoryContext: storyContext, fallbackWorldBible: worldBible });
    setNodes(sanitized.nodes);
    setEdges(withEdgeLayout(sanitized.edges, sanitized.nodes));
    setStoryContext(sanitized.storyContext);
    setWorldBible(sanitized.worldBible);
    setSelectedNode(null);
    setSelectedEdge(null);
    nodeId = sanitized.nextGlobalNodeId;

    const { report } = sanitized;
    const detail = [
      report.nodesFixed ? `Nodes fixed: ${report.nodesFixed}` : null,
      report.nodesAdded ? `Nodes added: ${report.nodesAdded}` : null,
      report.edgesFixed ? `Edges fixed: ${report.edgesFixed}` : null,
      report.edgesRemoved ? `Edges removed: ${report.edgesRemoved}` : null,
      report.worldBibleFixed ? `World bible updated` : null,
    ].filter(Boolean).join(', ');
    alert(detail ? `Backup Loaded Successfully!\n${detail}` : 'Backup Loaded Successfully!');
  }, [storyContext, worldBible]);

  // --- 主渲染逻辑的改变 ---
  // 如果处于播放模式，只渲染 PlayerView
  if (isPlaying) {
    return <PlayerView nodes={nodes} edges={edges} onExit={() => setIsPlaying(false)} initialNodeId="1" />;
  }

  // 否则，渲染我们的编辑器
  const displayedEdges = edges.map((e) => {
    const type = edgeStyleMode === 'smoothstep'
      ? 'smoothstepx'
      : (edgeStyleMode === 'bezier' ? 'bezierx' : (edgeStyleMode === 'defaultPlus' ? 'defaultx' : (edgeStyleMode === 'default' ? 'bezier' : 'choice')));
    const markerEnd = (type === 'bezier' || type === 'smoothstep') ? undefined : undefined;
    return { ...e, type, markerEnd };
  });

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      <div style={{ flexGrow: 1, position: 'relative', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px', background: '#f2f2f2', borderBottom: '1px solid #ddd' }}>
          <strong>Story Context:</strong>
          <textarea
            value={storyContext}
            onChange={(e) => setStoryContext(e.target.value)}
            rows="2"
            style={{ width: '100%', marginTop: '5px', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ flexGrow: 1, position: 'relative' }}>
          <div style={{ position: 'absolute', zIndex: 10, top: 10, left: 10, display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button onClick={addNode}>Add Scene</button>
            <button onClick={saveStory} title="Save to Browser LocalStorage">Quick Save</button>
            <button onClick={() => setIsSaveModalOpen(true)} title="Manage multiple save slots">📂 Backups</button>
            <button onClick={() => setIsWorldBibleOpen(true)} title="Edit world bible">📘 World Bible</button>
            <button onClick={() => setIsAnalysisOpen(true)} title="Analyze story graph">🔎 Analyze</button>
            <button onClick={() => setIsGuideOpen(true)} title="Quick guide">❓ Guide</button>
            <button onClick={() => setIsLogsOpen(true)} title="View evaluation logs">🧾 Logs</button>
            <select value={edgeStyleMode} onChange={(e) => setEdgeStyleMode(e.target.value)} title="Edge routing style">
              <option value="custom">Edges: Custom</option>
              <option value="default">Edges: Default</option>
              <option value="defaultPlus">Edges: Default+</option>
              <option value="bezier">Edges: Bezier</option>
              <option value="smoothstep">Edges: SmoothStep</option>
            </select>
            <button onClick={exportStory} title="Download as JSON file">Export File</button>
            <button onClick={exportEvaluationPack} title="Download story + analysis + logs">📦 Eval Pack</button>
            <button onClick={handleImportClick} title="Load from JSON file">Import File</button>
            <input 
              type="file" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              accept=".json" 
              onChange={handleFileChange} 
            />
            <div style={{ width: '1px', background: '#ccc', margin: '0 5px' }}></div>
            <button onClick={newStory} style={{ background: '#fdd', color: '#c00' }}>New Story</button>
            <button onClick={() => setIsPlaying(true)} style={{ background: '#dfd', color: '#080' }}>Play Story</button>
          </div>
          <EdgeLabelDragContext.Provider value={{ setEdges }}>
            <ReactFlow
              nodes={nodes}
              edges={displayedEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onEdgeClick={onEdgeClick}
              onPaneClick={onPaneClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              defaultEdgeOptions={{
                type: edgeStyleMode === 'smoothstep'
                  ? 'smoothstepx'
                  : (edgeStyleMode === 'bezier' ? 'bezierx' : (edgeStyleMode === 'defaultPlus' ? 'defaultx' : (edgeStyleMode === 'default' ? 'bezier' : 'choice'))),
              }}
              fitView
            >
              <Background />
              <Controls />
              <MiniMap />
            </ReactFlow>
          </EdgeLabelDragContext.Provider>
        </div>
      </div>
      <Sidebar
        selectedNode={selectedNode}
        onDataChange={onDataChange}
        selectedEdge={selectedEdge}
        onEdgeLabelChange={onEdgeLabelChange}
        storyContext={storyContext}
        worldBible={worldBible}
        addNodeFromSuggestion={addNodeFromSuggestion}
        onDeleteElement={onDeleteElement}
      />
      
      <SaveLoadModal 
        isOpen={isSaveModalOpen} 
        onClose={() => setIsSaveModalOpen(false)}
        currentData={{ nodes, edges, storyContext, worldBible }}
        onLoad={handleLoadFromBackup}
      />

      <WorldBibleModal
        isOpen={isWorldBibleOpen}
        onClose={() => setIsWorldBibleOpen(false)}
        value={worldBible}
        onChange={setWorldBible}
        onReset={() => setWorldBible(getInitialWorldBible())}
      />

      <StoryAnalysisModal
        isOpen={isAnalysisOpen}
        onClose={() => setIsAnalysisOpen(false)}
        nodes={nodes}
        edges={edges}
        startNodeId="1"
      />

      <GuideModal
        isOpen={isGuideOpen}
        onClose={() => setIsGuideOpen(false)}
      />

      <EvaluationLogsModal
        isOpen={isLogsOpen}
        onClose={() => setIsLogsOpen(false)}
      />
    </div>
  );
}
export default App;
