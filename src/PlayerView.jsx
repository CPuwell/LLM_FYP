// src/PlayerView.jsx
import React, { useState, useEffect, useRef } from 'react';
import './PlayerView.css'; 
import { getDisplayImageUrl } from './imageUtils.js';
import { applyEffects, evaluateConditions } from './attributeEngine.js';
import { appendEvaluationLog, getEvaluationLogs } from './evaluationLog.js';
import { getStoryMemory, pickMemoryUpdateLogs, resetStoryMemory, selectFactsForScene, setStoryMemory } from './storyMemory.js';
import { buildGeminiKeyHeader } from './userApiKey.js';

export default function PlayerView({ nodes, edges, storyContext, worldBible, onExit, initialNodeId = '1' }) {
  const [currentNodeId, setCurrentNodeId] = useState(initialNodeId);
  const [history, setHistory] = useState([]);
  const [usedChoiceIds, setUsedChoiceIds] = useState(() => new Set());
  const [attributes, setAttributes] = useState({});
  const attributesRef = useRef({});
  const [appliedNodeEffectIds, setAppliedNodeEffectIds] = useState(() => new Set());
  const [choiceFeedback, setChoiceFeedback] = useState(null);
  const choiceFeedbackTimeoutRef = useRef(null);
  const memoryUpdateTimeoutRef = useRef(null);
  const memoryUpdateInFlightRef = useRef(false);
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const playerGenAbortRef = useRef(null);
  const playerGenCacheRef = useRef(new Map());

  const [currentNode, setCurrentNode] = useState(null);
  const [currentChoices, setCurrentChoices] = useState([]);
  const [runtimeDescription, setRuntimeDescription] = useState('');
  const [isRuntimeGenerating, setIsRuntimeGenerating] = useState(false);

  useEffect(() => {
    attributesRef.current = attributes;
  }, [attributes]);

  useEffect(() => () => {
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
  }, []);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    const exists = nodes.some((n) => n.id === initialNodeId);
    setCurrentNodeId(exists ? initialNodeId : nodes[0].id);
    setHistory([]);
    setUsedChoiceIds(new Set());
    setAttributes({});
    setAppliedNodeEffectIds(new Set());
    setChoiceFeedback(null);
    setRuntimeDescription('');
    setIsRuntimeGenerating(false);
    playerGenCacheRef.current = new Map();
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
  }, [initialNodeId, nodes]);

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
    if (memoryUpdateTimeoutRef.current) window.clearTimeout(memoryUpdateTimeoutRef.current);
    memoryUpdateTimeoutRef.current = window.setTimeout(async () => {
      if (memoryUpdateInFlightRef.current) return;
      const memory = getStoryMemory();
      const logs = getEvaluationLogs();
      const delta = pickMemoryUpdateLogs(logs, memory.lastProcessedLogTs, 20);
      if (!delta.length) return;
      memoryUpdateInFlightRef.current = true;
      const startedAt = performance.now();
      appendEvaluationLog({
        type: 'ai_memory_update_start',
        events: delta.length,
        lastProcessedLogTs: memory.lastProcessedLogTs || '',
      });
      try {
        const response = await fetch(`${apiBaseUrl}/api/update-memory`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
          body: JSON.stringify({ memory, events: delta }),
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
      }
    }, 900);
  };

  useEffect(() => {
    const node = nodes?.find((n) => n.id === currentNodeId);
    if (!node) return;
    const dynamicDescriptionEnabled = node?.data?.dynamicDescriptionEnabled !== false;
    if (!dynamicDescriptionEnabled) {
      if (playerGenAbortRef.current) {
        playerGenAbortRef.current.abort();
        playerGenAbortRef.current = null;
      }
      setRuntimeDescription('');
      setIsRuntimeGenerating(false);
    } else {
    const memory = getStoryMemory();
    const selectedFacts = selectFactsForScene(memory, { title: node?.data?.label || '', location: node?.data?.location || '', limit: 8 });
    const cacheKey = `${node.id}|${JSON.stringify(attributesRef.current)}|${JSON.stringify(selectedFacts)}`;
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
        memorySummaryLength: (memory.summary || '').length,
        memoryFactsCount: Array.isArray(selectedFacts) ? selectedFacts.length : 0,
      });
      fetch(`${apiBaseUrl}/api/generate-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
        body: JSON.stringify({
          title: node?.data?.label || '',
          storyContext: storyContext || '',
          userPrompt: node?.data?.setting || '',
          worldBible: worldBible || null,
          location: node?.data?.location || '',
          memory: { summary: memory.summary, facts: selectedFacts },
          attributes: attributesRef.current,
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
    appendEvaluationLog({
      type: 'play_enter',
      nodeId: node.id,
      title: node?.data?.label || '',
      location: node?.data?.location || '',
      descriptionSnippet: String(node?.data?.description || '').slice(0, 220),
      attributesSnapshot: attributesRef.current,
    });
    scheduleMemoryUpdate();
  }, [currentNodeId]);

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
    if (choiceFeedbackTimeoutRef.current) {
      window.clearTimeout(choiceFeedbackTimeoutRef.current);
      choiceFeedbackTimeoutRef.current = null;
    }
    appendEvaluationLog({ type: 'play_restart' });
    resetStoryMemory();
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

  return (
    <div className="player-view">
      <div className="player-controls">
        <button onClick={handleBack} disabled={history.length === 0} className="player-control-button">Back</button>
        <button onClick={handleRestart} className="player-control-button">Restart</button>
      </div>
      <button onClick={onExit} className="exit-button">Exit Player Mode</button>
      <div className="player-container">
        {choiceFeedback ? (
          <div className="player-feedback" role="status" aria-live="polite">
            {choiceFeedback}
          </div>
        ) : null}
        {currentNode.data.imageUrl && (
          <img src={getDisplayImageUrl(currentNode.data.imageUrl)} alt={currentNode.data.label} className="player-image" />
        )}
        <h2 className="player-title">{currentNode.data.label}</h2>
        {isRuntimeGenerating ? (
          <div className="player-runtime-loading" role="status" aria-live="polite">
            <div className="player-progress" />
            <div className="player-runtime-loading-text">Generating scene...</div>
          </div>
        ) : null}
        <p className="player-description">{runtimeDescription || currentNode.data.description}</p>

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
