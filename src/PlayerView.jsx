// src/PlayerView.jsx
import React, { useState, useEffect } from 'react';
import './PlayerView.css'; 
import { getDisplayImageUrl } from './imageUtils.js';
import { applyEffects, evaluateConditions } from './attributeEngine.js';

export default function PlayerView({ nodes, edges, onExit, initialNodeId = '1' }) {
  const [currentNodeId, setCurrentNodeId] = useState(initialNodeId);
  const [history, setHistory] = useState([]);
  const [usedChoiceIds, setUsedChoiceIds] = useState(() => new Set());
  const [attributes, setAttributes] = useState({});
  const [appliedNodeEffectIds, setAppliedNodeEffectIds] = useState(() => new Set());
  const [choiceFeedback, setChoiceFeedback] = useState(null);

  const [currentNode, setCurrentNode] = useState(null);
  const [currentChoices, setCurrentChoices] = useState([]);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    const exists = nodes.some((n) => n.id === initialNodeId);
    setCurrentNodeId(exists ? initialNodeId : nodes[0].id);
    setHistory([]);
    setUsedChoiceIds(new Set());
    setAttributes({});
    setAppliedNodeEffectIds(new Set());
    setChoiceFeedback(null);
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
    window.clearTimeout(showChoiceFeedback._t);
    showChoiceFeedback._t = window.setTimeout(() => setChoiceFeedback(null), 1800);
  };

  const handleChoiceClick = (edge) => {
    if (!edge) return;
    const reason = getChoiceDisabledReason(edge);
    if (reason) {
      showChoiceFeedback(reason);
      return;
    }
    const isSingleUse = Boolean(edge?.data?.singleUse);
    if (isSingleUse) {
      setUsedChoiceIds((prev) => {
        const next = new Set(prev);
        next.add(edge.id);
        return next;
      });
    }
    if (edge?.data?.effects) {
      setAttributes((a) => applyEffects(a, edge.data.effects));
    }
    setHistory((h) => [...h, currentNodeId]);
    setCurrentNodeId(edge.target);
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
        <p className="player-description">{currentNode.data.description}</p>

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
