// src/PlayerView.jsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import './PlayerView.css'; 
import { getDisplayImageUrl } from './imageUtils.js';
import { applyEffects, evaluateConditions } from './attributeEngine.js';
import { appendEvaluationLog, clearEvaluationLogs, getEvaluationLogs, getEvaluationSessionId, resetEvaluationSession } from './evaluationLog.js';
import { getStoryMemory, pickMemoryUpdateLogs, resetStoryMemory, selectFactsForScene, setStoryMemory } from './storyMemory.js';
import { getApiBaseUrl } from './apiBaseUrl.js';
import { buildGeminiKeyHeader } from './userApiKey.js';
import { resolveNodeUserPrompt } from './settingResolver.js';

export default function PlayerView({ nodes, edges, storyContext, worldBible, onExit, initialNodeId = '1' }) {
  const [currentNodeId, setCurrentNodeId] = useState(initialNodeId);
  const [history, setHistory] = useState([]);
  const [usedChoiceIds, setUsedChoiceIds] = useState(() => new Set());
  const [attributes, setAttributes] = useState({});
  const [showAttributes, setShowAttributes] = useState(() => {
    try {
      return localStorage.getItem('playerShowAttributes') === '1';
    } catch {
      return false;
    }
  });
  const attributesRef = useRef({});
  const lastEnteredNodeIdRef = useRef(null);
  const enterGateRef = useRef({ nodeId: '', enterTs: '', deadlineMs: 0 });
  const enterGateTimeoutRef = useRef(null);
  const [enterGateTick, setEnterGateTick] = useState(0);
  const [memoryEpoch, setMemoryEpoch] = useState(0);
  const [isMemoryUpdating, setIsMemoryUpdating] = useState(false);
  const [appliedNodeEffectIds, setAppliedNodeEffectIds] = useState(() => new Set());
  const [choiceFeedback, setChoiceFeedback] = useState(null);
  const choiceFeedbackTimeoutRef = useRef(null);
  const memoryUpdateTimeoutRef = useRef(null);
  const memoryUpdateInFlightRef = useRef(false);
  const memoryUpdatePendingRef = useRef(false);
  const apiBaseUrl = getApiBaseUrl();
  const playerGenAbortRef = useRef(null);
  const playerGenCacheRef = useRef(new Map());
  const imageGenAbortRef = useRef(null);
  const imageGenCacheRef = useRef(new Map());

  const [currentNode, setCurrentNode] = useState(null);
  const [currentChoices, setCurrentChoices] = useState([]);
  const [runtimeDescription, setRuntimeDescription] = useState('');
  const [isRuntimeGenerating, setIsRuntimeGenerating] = useState(false);
  const [runtimeImageUrl, setRuntimeImageUrl] = useState('');
  const [isRuntimeImageGenerating, setIsRuntimeImageGenerating] = useState(false);
  const nodesSig = useMemo(
    () => (Array.isArray(nodes) ? nodes.map((n) => String(n?.id || '')).join('|') : ''),
    [nodes],
  );

  useEffect(() => {
    attributesRef.current = attributes;
  }, [attributes]);

  useEffect(() => {
    clearEvaluationLogs();
    resetEvaluationSession();
  }, []);

  useEffect(() => () => {
    if (choiceFeedbackTimeoutRef.current) {
      window.clearTimeout(choiceFeedbackTimeoutRef.current);
      choiceFeedbackTimeoutRef.current = null;
    }
    if (memoryUpdateTimeoutRef.current) {
      window.clearTimeout(memoryUpdateTimeoutRef.current);
      memoryUpdateTimeoutRef.current = null;
    }
    if (enterGateTimeoutRef.current) {
      window.clearTimeout(enterGateTimeoutRef.current);
      enterGateTimeoutRef.current = null;
    }
    if (playerGenAbortRef.current) {
      playerGenAbortRef.current.abort();
      playerGenAbortRef.current = null;
    }
    if (imageGenAbortRef.current) {
      imageGenAbortRef.current.abort();
      imageGenAbortRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    clearEvaluationLogs();
    resetEvaluationSession();
    const exists = nodes.some((n) => n.id === initialNodeId);
    setCurrentNodeId(exists ? initialNodeId : nodes[0].id);
    setHistory([]);
    setUsedChoiceIds(new Set());
    setAttributes({});
    setMemoryEpoch(0);
    setIsMemoryUpdating(false);
    lastEnteredNodeIdRef.current = null;
    enterGateRef.current = { nodeId: '', enterTs: '', deadlineMs: 0 };
    memoryUpdatePendingRef.current = false;
    memoryUpdateInFlightRef.current = false;
    if (enterGateTimeoutRef.current) {
      window.clearTimeout(enterGateTimeoutRef.current);
      enterGateTimeoutRef.current = null;
    }
    setAppliedNodeEffectIds(new Set());
    setChoiceFeedback(null);
    setRuntimeDescription('');
    setIsRuntimeGenerating(false);
    setRuntimeImageUrl('');
    setIsRuntimeImageGenerating(false);
    playerGenCacheRef.current = new Map();
    imageGenCacheRef.current = new Map();
    resetStoryMemory();
    if (choiceFeedbackTimeoutRef.current) {
      window.clearTimeout(choiceFeedbackTimeoutRef.current);
      choiceFeedbackTimeoutRef.current = null;
    }
    if (memoryUpdateTimeoutRef.current) {
      window.clearTimeout(memoryUpdateTimeoutRef.current);
      memoryUpdateTimeoutRef.current = null;
    }
    if (playerGenAbortRef.current) {
      playerGenAbortRef.current.abort();
      playerGenAbortRef.current = null;
    }
    if (imageGenAbortRef.current) {
      imageGenAbortRef.current.abort();
      imageGenAbortRef.current = null;
    }
  }, [initialNodeId, nodesSig]);

  // Update currentNode and currentChoices whenever currentNodeId changes
  useEffect(() => {
    if (!nodes || nodes.length === 0) {
      setCurrentNode(null);
      setCurrentChoices([]);
      return;
    }
    const node = nodes.find((n) => n.id === currentNodeId);
    if (node) {
      setCurrentNode(node);
      const outgoingEdges = edges.filter((e) => e.source === currentNodeId);
      setCurrentChoices(outgoingEdges);
    } else {
      setCurrentNode(null);
      setCurrentChoices([]);
    }
  }, [currentNodeId, nodes, edges]);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    const node = nodes.find((n) => n.id === currentNodeId);
    if (!node) return;
    const effects = node?.data?.onEnterEffects;
    const effectId = `node:${node.id}`;
    if (!effects) return;
    setAppliedNodeEffectIds((prev) => {
      if (prev.has(effectId)) return prev;
      setAttributes((a) => applyEffects(a, effects));
      const next = new Set(prev);
      next.add(effectId);
      return next;
    });
  }, [currentNodeId, nodes]);

  const scheduleMemoryUpdate = () => {
    if (memoryUpdateInFlightRef.current) {
      memoryUpdatePendingRef.current = true;
      return;
    }
    if (memoryUpdateTimeoutRef.current) window.clearTimeout(memoryUpdateTimeoutRef.current);
    memoryUpdateTimeoutRef.current = window.setTimeout(async () => {
      if (memoryUpdateInFlightRef.current) return;
      const memory = getStoryMemory();
      const logs = getEvaluationLogs();
      const sessionId = getEvaluationSessionId();
      const delta = pickMemoryUpdateLogs(logs, memory.lastProcessedLogTs, 20, sessionId);
      if (!delta.length) return;
      memoryUpdateInFlightRef.current = true;
      memoryUpdatePendingRef.current = false;
      setIsMemoryUpdating(true);
      const startedAt = performance.now();
      appendEvaluationLog({
        type: 'ai_memory_update_start',
        events: delta.length,
        lastProcessedLogTs: memory.lastProcessedLogTs || '',
      });
      try {
        const eventsForMemory = delta.map((e) => {
          const type = typeof e?.type === 'string' ? e.type : '';
          if (type === 'play_enter') {
            return {
              ts: e.ts,
              type: 'play_enter',
              nodeId: e.nodeId,
              title: e.title,
              location: e.location,
              attributesSnapshot: e.attributesSnapshot,
            };
          }
          if (type === 'play_choice') {
            return {
              ts: e.ts,
              type: 'play_choice',
              fromNodeId: e.fromNodeId,
              fromTitle: e.fromTitle,
              choiceId: e.choiceId,
              choiceText: e.choiceText,
              toNodeId: e.toNodeId,
              toTitle: e.toTitle,
              attributesAfter: e.attributesAfter,
            };
          }
          if (type === 'play_restart') {
            return { ts: e.ts, type: 'play_restart' };
          }
          return { ts: e.ts, type: type || 'unknown' };
        });
        const response = await fetch(`${apiBaseUrl}/api/update-memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
          body: JSON.stringify({ memory, events: eventsForMemory }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          appendEvaluationLog({
            type: 'ai_memory_update_error',
            status: response.status,
            durationMs: Math.round(performance.now() - startedAt),
            error: errorData.details || errorData.error || 'Network response was not ok',
          });
          return;
        }
        const data = await response.json();
        const lastLogTs = typeof delta[delta.length - 1]?.ts === 'string' ? delta[delta.length - 1].ts : memory.lastProcessedLogTs;
        setStoryMemory({
          summary: data?.summary || '',
          facts: Array.isArray(data?.facts) ? data.facts : [],
          lastProcessedLogTs: lastLogTs || '',
          runId: memory.runId,
        });
        setMemoryEpoch((x) => x + 1);
        if (enterGateRef.current?.nodeId === currentNodeId) {
          setEnterGateTick((x) => x + 1);
        }
        appendEvaluationLog({
          type: 'ai_memory_update_success',
          durationMs: Math.round(performance.now() - startedAt),
          model: data?.meta?.model || '',
          factsCount: Array.isArray(data?.facts) ? data.facts.length : 0,
        });
      } catch (e) {
        appendEvaluationLog({
          type: 'ai_memory_update_error',
          durationMs: Math.round(performance.now() - startedAt),
          error: e?.message || 'Unknown error',
        });
      } finally {
        memoryUpdateInFlightRef.current = false;
        setIsMemoryUpdating(false);
        if (memoryUpdatePendingRef.current) {
          memoryUpdatePendingRef.current = false;
          scheduleMemoryUpdate();
        }
      }
    }, 900);
  };

  useEffect(() => {
    const node = nodes?.find((n) => n.id === currentNodeId);
    if (!node) return;
    if (lastEnteredNodeIdRef.current === node.id) return;
    lastEnteredNodeIdRef.current = node.id;
    const nextLogs = appendEvaluationLog({
      type: 'play_enter',
      nodeId: node.id,
      title: node?.data?.label || '',
      location: node?.data?.location || '',
      descriptionSnippet: String(node?.data?.description || '').slice(0, 220),
      attributesSnapshot: attributesRef.current,
    });
    const enterTs = typeof nextLogs?.[nextLogs.length - 1]?.ts === 'string' ? nextLogs[nextLogs.length - 1].ts : '';
    enterGateRef.current = { nodeId: node.id, enterTs, deadlineMs: performance.now() + 1800 };
    if (enterGateTimeoutRef.current) window.clearTimeout(enterGateTimeoutRef.current);
    enterGateTimeoutRef.current = window.setTimeout(() => {
      if (enterGateRef.current?.nodeId === node.id) {
        setEnterGateTick((x) => x + 1);
      }
    }, 1900);
    scheduleMemoryUpdate();
  }, [currentNodeId, nodesSig]);

  useEffect(() => {
    const node = nodes?.find((n) => n.id === currentNodeId);
    if (!node) return;
    const dynamicDescriptionEnabled = Boolean(node?.data?.dynamicDescriptionEnabled);
    if (!dynamicDescriptionEnabled) {
      if (playerGenAbortRef.current) {
        playerGenAbortRef.current.abort();
        playerGenAbortRef.current = null;
      }
      setRuntimeDescription('');
      setIsRuntimeGenerating(false);
    } else {
    const effectId = `node:${node.id}`;
    if (node?.data?.onEnterEffects && !appliedNodeEffectIds.has(effectId)) {
      setIsRuntimeGenerating(true);
      return;
    }
    const gate = enterGateRef.current;
    const memory = getStoryMemory();
    if (gate?.nodeId === node.id && gate.enterTs) {
      const processedAt = Date.parse(memory.lastProcessedLogTs || '');
      const enteredAt = Date.parse(gate.enterTs || '');
      const ready = Number.isFinite(processedAt) && Number.isFinite(enteredAt) && processedAt >= enteredAt;
      const expired = performance.now() >= (gate.deadlineMs || 0);
      if (!ready && !expired) {
        setIsRuntimeGenerating(true);
        return;
      }
      enterGateRef.current = { nodeId: '', enterTs: '', deadlineMs: 0 };
      if (enterGateTimeoutRef.current) {
        window.clearTimeout(enterGateTimeoutRef.current);
        enterGateTimeoutRef.current = null;
      }
    }
    const resolvedUserPrompt = resolveNodeUserPrompt(node?.data, attributes);
    const selectedFacts = selectFactsForScene(memory, { title: node?.data?.label || '', location: node?.data?.location || '', limit: 8 });
    const cacheKey = `${node.id}|${resolvedUserPrompt}|${JSON.stringify(attributes)}|${JSON.stringify(selectedFacts)}|${String(memory.summary || '').slice(0, 600)}`;
    const cached = playerGenCacheRef.current.get(cacheKey);
    if (cached && typeof cached === 'string') {
      setRuntimeDescription(cached);
      setIsRuntimeGenerating(false);
    } else {
      const controller = new AbortController();
      if (playerGenAbortRef.current) playerGenAbortRef.current.abort();
      playerGenAbortRef.current = controller;
      setIsRuntimeGenerating(true);
      const startedAt = performance.now();
      appendEvaluationLog({
        type: 'ai_generate_player_text_start',
        nodeId: node.id,
        title: node?.data?.label || '',
        location: node?.data?.location || '',
        storyContextLength: (storyContext || '').length,
        userPromptLength: resolvedUserPrompt.length,
        memorySummaryLength: (memory.summary || '').length,
        memoryFactsCount: Array.isArray(selectedFacts) ? selectedFacts.length : 0,
      });
      fetch(`${apiBaseUrl}/api/generate-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
        body: JSON.stringify({
          title: node?.data?.label || '',
          storyContext: storyContext || '',
          userPrompt: resolvedUserPrompt,
          worldBible: worldBible || null,
          location: node?.data?.location || '',
          memory: { summary: memory.summary, facts: selectedFacts },
          attributes,
        }),
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) {
            const errorData = await r.json().catch(() => ({}));
            throw new Error(errorData.details || errorData.error || 'Network response was not ok');
          }
          return r.json();
        })
        .then((data) => {
          const desc = typeof data?.description === 'string' ? data.description : '';
          if (desc) {
            playerGenCacheRef.current.set(cacheKey, desc);
            setRuntimeDescription(desc);
          } else {
            setRuntimeDescription('');
          }
          appendEvaluationLog({
            type: 'ai_generate_player_text_success',
            nodeId: node.id,
            title: node?.data?.label || '',
            durationMs: Math.round(performance.now() - startedAt),
            model: data?.meta?.model || '',
            memoryFactsCount: data?.meta?.memoryFactsCount,
            memorySummaryLength: data?.meta?.memorySummaryLength,
            playerStateLength: data?.meta?.playerStateLength,
          });
        })
        .catch((e) => {
          if (e?.name === 'AbortError') return;
          appendEvaluationLog({
            type: 'ai_generate_player_text_error',
            nodeId: node.id,
            title: node?.data?.label || '',
            durationMs: Math.round(performance.now() - startedAt),
            error: e?.message || 'Unknown error',
          });
          setRuntimeDescription('');
        })
        .finally(() => {
          if (playerGenAbortRef.current === controller) playerGenAbortRef.current = null;
          setIsRuntimeGenerating(false);
        });
    }
    }
  }, [currentNodeId, storyContext, worldBible, attributes, nodesSig, enterGateTick, appliedNodeEffectIds]);

  useEffect(() => {
    const node = nodes?.find((n) => n.id === currentNodeId);
    if (!node) return;

    const dynamicImageEnabled = Boolean(node?.data?.dynamicImageEnabled);
    if (!dynamicImageEnabled) {
      if (imageGenAbortRef.current) {
        imageGenAbortRef.current.abort();
        imageGenAbortRef.current = null;
      }
      setRuntimeImageUrl('');
      setIsRuntimeImageGenerating(false);
      return;
    }

    const baseDesc = (runtimeDescription || node?.data?.description || '').toString().trim();
    if (!baseDesc) return;
    const dynamicDescriptionEnabled = Boolean(node?.data?.dynamicDescriptionEnabled);
    if (isRuntimeGenerating && dynamicDescriptionEnabled) return;

    const styleKey = `${(storyContext || '').slice(0, 220)}|${(worldBible?.tone || '').slice(0, 120)}|${(worldBible?.styleGuide || '').slice(0, 160)}|${node?.data?.location || ''}`;
    const cacheKey = `${node.id}|${baseDesc}|${styleKey}`;
    const cached = imageGenCacheRef.current.get(cacheKey);
    if (cached && typeof cached === 'string') {
      setRuntimeImageUrl(cached);
      setIsRuntimeImageGenerating(false);
      return;
    }

    const controller = new AbortController();
    if (imageGenAbortRef.current) imageGenAbortRef.current.abort();
    imageGenAbortRef.current = controller;
    setIsRuntimeImageGenerating(true);
    const startedAt = performance.now();
    appendEvaluationLog({
      type: 'ai_generate_player_image_start',
      nodeId: node.id,
      title: node?.data?.label || '',
      descriptionLength: baseDesc.length,
    });
    fetch(`${apiBaseUrl}/api/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
      body: JSON.stringify({
        description: baseDesc,
        title: node?.data?.label || '',
        location: node?.data?.location || '',
        storyContext: storyContext || '',
        tone: worldBible?.tone || '',
        styleGuide: worldBible?.styleGuide || '',
      }),
      signal: controller.signal,
    })
      .then(async (r) => {
        if (!r.ok) {
          let errorData = {};
          let errorText = '';
          try {
            errorData = await r.clone().json();
          } catch {
            try {
              errorText = await r.text();
            } catch {
            }
          }
          const msg = errorData.details || errorData.error || (errorText ? errorText.slice(0, 260) : '') || `HTTP ${r.status}`;
          throw new Error(msg);
        }
        return r.json();
      })
      .then((data) => {
        const url = typeof data?.imageUrl === 'string' ? data.imageUrl : '';
        if (url) {
          imageGenCacheRef.current.set(cacheKey, url);
          setRuntimeImageUrl(url);
        } else {
          setRuntimeImageUrl('');
        }
        appendEvaluationLog({
          type: 'ai_generate_player_image_success',
          nodeId: node.id,
          title: node?.data?.label || '',
          durationMs: Math.round(performance.now() - startedAt),
        });
      })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        appendEvaluationLog({
          type: 'ai_generate_player_image_error',
          nodeId: node.id,
          title: node?.data?.label || '',
          durationMs: Math.round(performance.now() - startedAt),
          error: e?.message || 'Unknown error',
        });
        setRuntimeImageUrl('');
      })
      .finally(() => {
        if (imageGenAbortRef.current === controller) imageGenAbortRef.current = null;
        setIsRuntimeImageGenerating(false);
      });
  }, [currentNodeId, runtimeDescription, isRuntimeGenerating, nodes]);

  const getChoiceDisabledReason = (edge) => {
    if (!edge) return null;
    const locked = !evaluateConditions(attributes, edge?.data?.requirements);
    if (locked) return 'locked';
    const isSingleUse = Boolean(edge?.data?.singleUse);
    if (isSingleUse && usedChoiceIds.has(edge.id)) return 'used';
    return null;
  };

  const showChoiceFeedback = (reason) => {
    if (!reason) return;
    const msg = reason === 'used'
      ? 'This choice can only be selected once.'
      : 'This choice is locked.';
    setChoiceFeedback(msg);
    if (choiceFeedbackTimeoutRef.current) {
      window.clearTimeout(choiceFeedbackTimeoutRef.current);
      choiceFeedbackTimeoutRef.current = null;
    }
    choiceFeedbackTimeoutRef.current = window.setTimeout(() => setChoiceFeedback(null), 1800);
  };

  const handleChoiceClick = (edge) => {
    if (!edge) return;
    const reason = getChoiceDisabledReason(edge);
    if (reason) {
      showChoiceFeedback(reason);
      return;
    }
    const fromNode = nodes.find((n) => n.id === currentNodeId);
    const toNode = nodes.find((n) => n.id === edge.target);
    const nextAttributes = edge?.data?.effects ? applyEffects(attributes, edge.data.effects) : attributes;
    const isSingleUse = Boolean(edge?.data?.singleUse);
    if (isSingleUse) {
      setUsedChoiceIds((prev) => {
        const next = new Set(prev);
        next.add(edge.id);
        return next;
      });
    }
    if (edge?.data?.effects) setAttributes(nextAttributes);
    appendEvaluationLog({
      type: 'play_choice',
      fromNodeId: currentNodeId,
      fromTitle: fromNode?.data?.label || '',
      choiceId: edge.id,
      choiceText: edge.label || '',
      toNodeId: edge.target,
      toTitle: toNode?.data?.label || '',
      attributesAfter: nextAttributes,
    });
    setHistory((h) => [...h, currentNodeId]);
    setCurrentNodeId(edge.target);
    scheduleMemoryUpdate();
  };

  const handleBack = () => {
    setHistory((h) => {
      if (h.length === 0) return h;
      const prevId = h[h.length - 1];
      setCurrentNodeId(prevId);
      return h.slice(0, -1);
    });
  };

  const handleRestart = () => {
    if (!nodes || nodes.length === 0) return;
    const exists = nodes.some((n) => n.id === initialNodeId);
    setHistory([]);
    setUsedChoiceIds(new Set());
    setAttributes({});
    setAppliedNodeEffectIds(new Set());
    setChoiceFeedback(null);
    lastEnteredNodeIdRef.current = null;
    clearEvaluationLogs();
    resetEvaluationSession();
    if (choiceFeedbackTimeoutRef.current) {
      window.clearTimeout(choiceFeedbackTimeoutRef.current);
      choiceFeedbackTimeoutRef.current = null;
    }
    appendEvaluationLog({ type: 'play_restart' });
    resetStoryMemory();
    setIsMemoryUpdating(false);
    memoryUpdatePendingRef.current = false;
    memoryUpdateInFlightRef.current = false;
    setCurrentNodeId(exists ? initialNodeId : nodes[0].id);
  };

  if (!nodes || nodes.length === 0) {
    return (
      <div className="player-view">
        <div className="player-container">
          <h2>Error</h2>
          <p>No scenes found.</p>
          <button onClick={onExit} className="player-choice-button">Exit Player</button>
        </div>
      </div>
    );
  }

  if (!currentNode) {
    return (
      <div className="player-view">
        <div className="player-container">
          <h2>Error</h2>
          <p>Current scene not found.</p>
          <button onClick={onExit} className="player-choice-button">Exit Player</button>
        </div>
      </div>
    );
  }

  const dynamicDescriptionEnabled = Boolean(currentNode?.data?.dynamicDescriptionEnabled);
  const dynamicImageEnabled = Boolean(currentNode?.data?.dynamicImageEnabled);
  const showDescriptionText = dynamicDescriptionEnabled ? (!isRuntimeGenerating && runtimeDescription) : '';
  const displayedImageUrl = dynamicImageEnabled ? (runtimeImageUrl || '') : (currentNode.data.imageUrl || '');
  const isSceneBusy = (dynamicDescriptionEnabled && isRuntimeGenerating) || (dynamicImageEnabled && isRuntimeImageGenerating);
  const displayedDescription = isSceneBusy
    ? ''
    : (dynamicDescriptionEnabled ? (showDescriptionText || '') : (currentNode.data.description || ''));
  const loadingText = isRuntimeGenerating ? 'Generating text...' : (isRuntimeImageGenerating ? 'Generating image...' : 'Generating scene...');
  const handleExit = () => {
    onExit();
  };
  const handleToggleAttributes = () => {
    setShowAttributes((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('playerShowAttributes', next ? '1' : '0');
      } catch {
      }
      return next;
    });
  };

  return (
    <div className="player-view">
      <div className="player-controls">
        <button onClick={handleBack} disabled={history.length === 0} className="player-control-button">Back</button>
        <button onClick={handleRestart} className="player-control-button">Restart</button>
        <button onClick={handleToggleAttributes} className="player-control-button">{showAttributes ? 'Hide Attrs' : 'Show Attrs'}</button>
      </div>
      <button onClick={handleExit} className="exit-button">Exit Player Mode</button>
      <div className="player-container">
        {choiceFeedback ? (
          <div className="player-feedback" role="status" aria-live="polite">
            {choiceFeedback}
          </div>
        ) : null}
        <h2 className="player-title">{currentNode.data.label}</h2>
        {isMemoryUpdating ? (
          <div className="player-memory-loading" role="status" aria-live="polite">
            <div className="player-progress" />
            <div className="player-runtime-loading-text">Updating memory...</div>
          </div>
        ) : null}
        {isSceneBusy ? (
          <div className="player-runtime-loading" role="status" aria-live="polite">
            <div className="player-progress" />
            <div className="player-runtime-loading-text">{loadingText}</div>
          </div>
        ) : null}
        {displayedImageUrl ? (
          <img src={getDisplayImageUrl(displayedImageUrl)} alt={currentNode.data.label} className="player-image" />
        ) : null}
        <p className="player-description">{displayedDescription}</p>
        {showAttributes ? (
          <div className="player-debug">
            <div className="player-debug-title">Attributes</div>
            <pre className="player-debug-pre">{JSON.stringify(attributes || {}, null, 2)}</pre>
          </div>
        ) : null}

        <div className="player-choices">
          {currentChoices.length > 0 ? (
            currentChoices.map((edge) => {
              const reason = getChoiceDisabledReason(edge);
              const disabled = Boolean(reason);
              const title = reason === 'used' ? 'Already used' : (reason === 'locked' ? 'Locked' : undefined);
              return (
                <button
                  key={edge.id}
                  onClick={() => handleChoiceClick(edge)}
                  className={disabled ? 'player-choice-button is-disabled' : 'player-choice-button'}
                  aria-disabled={disabled}
                  title={title}
                >
                  {edge.label}
                </button>
              );
            })
          ) : (
            <p className="end-of-story">--- The End ---</p>
          )}
        </div>
      </div>
    </div>
  );
}
