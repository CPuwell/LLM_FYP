// src/PlayerView.jsx
import React, { useState, useEffect } from 'react';
import './PlayerView.css'; 
import { getDisplayImageUrl } from './imageUtils.js';

export default function PlayerView({ nodes, edges, onExit, initialNodeId = '1' }) {
  const [currentNodeId, setCurrentNodeId] = useState(initialNodeId);
  const [history, setHistory] = useState([]);

  const [currentNode, setCurrentNode] = useState(null);
  const [currentChoices, setCurrentChoices] = useState([]);

  useEffect(() => {
    if (!nodes || nodes.length === 0) return;
    const exists = nodes.some((n) => n.id === initialNodeId);
    setCurrentNodeId(exists ? initialNodeId : nodes[0].id);
    setHistory([]);
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

  const handleChoiceClick = (targetNodeId) => {
    setHistory((h) => [...h, currentNodeId]);
    setCurrentNodeId(targetNodeId);
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
        {currentNode.data.imageUrl && (
          <img src={getDisplayImageUrl(currentNode.data.imageUrl)} alt={currentNode.data.label} className="player-image" />
        )}
        <h2 className="player-title">{currentNode.data.label}</h2>
        <p className="player-description">{currentNode.data.description}</p>

        <div className="player-choices">
          {currentChoices.length > 0 ? (
            currentChoices.map((edge) => (
              <button key={edge.id} onClick={() => handleChoiceClick(edge.target)} className="player-choice-button">
                {edge.label}
              </button>
            ))
          ) : (
            <p className="end-of-story">--- The End ---</p>
          )}
        </div>
      </div>
    </div>
  );
}
