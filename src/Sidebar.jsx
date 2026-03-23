// src/Sidebar.jsx
import React, { useState } from 'react';
import { getDisplayImageUrl } from './imageUtils.js';
import { appendEvaluationLog } from './evaluationLog.js';

// accept new prop: onDeleteElement
export default function Sidebar({ selectedNode, onDataChange, selectedEdge, onEdgeLabelChange, storyContext, worldBible, addNodeFromSuggestion, onDeleteElement }) {
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const locationOptions = Array.from(new Set((worldBible?.locations || []).map((l) => (l?.name || '').trim()).filter(Boolean)));

  const handleNodeDataChange = (event) => {
    onDataChange({ [event.target.name]: event.target.value });
  };

  const handleEdgeLabelChange = (event) => {
    onEdgeLabelChange(event.target.value);
  };

  const handleTextGenerate = async () => {  
    setIsTextLoading(true);
    const startedAt = performance.now();
    const requestBody = { 
      title: selectedNode.data.label, 
      storyContext: storyContext,
      userPrompt: selectedNode.data.description,
      worldBible: worldBible,
      location: selectedNode?.data?.location || ''
    };
    appendEvaluationLog({
      type: 'ai_generate_text_start',
      nodeId: selectedNode.id,
      title: selectedNode.data.label,
      storyContextLength: (storyContext || '').length,
      userPromptLength: (selectedNode.data.description || '').length,
      worldBibleCharactersCount: Array.isArray(worldBible?.characters) ? worldBible.characters.length : 0,
      worldBibleLocationsCount: Array.isArray(worldBible?.locations) ? worldBible.locations.length : 0,
      location: selectedNode?.data?.location || '',
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // 发送当前输入框里的 description 作为参考
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        appendEvaluationLog({
          type: 'ai_generate_text_error',
          nodeId: selectedNode.id,
          title: selectedNode.data.label,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          error: errorData.details || errorData.error || 'Network response was not ok',
        });
        throw new Error(errorData.details || errorData.error || 'Network response was not ok');
      }
      
      const data = await response.json();
      onDataChange({ description: data.description, suggestedActions: data.actions });
      appendEvaluationLog({
        type: 'ai_generate_text_success',
        nodeId: selectedNode.id,
        title: selectedNode.data.label,
        durationMs: Math.round(performance.now() - startedAt),
        model: data?.meta?.model || '',
        actionsCount: Array.isArray(data.actions) ? data.actions.length : 0,
      });
    } catch (error) {
      console.error("Failed to generate content:", error);
      
      let friendlyMessage = `Error generating content: ${error.message}`;
      if (error.message.includes('429') || error.message.includes('Quota')) {
        friendlyMessage = "⚠️ AI Usage Limit Reached (429).\nPlease wait a minute before trying again, or check your API key quota.";
      } else if (error.message.includes('503') || error.message.includes('Overloaded')) {
         friendlyMessage = "⚠️ AI Service Overloaded.\nThe servers are busy right now. Please try again shortly.";
      }
      
      alert(friendlyMessage);
    } finally {
      setIsTextLoading(false);
    }
  };

  const handleImageGenerate = async () => { 
    if (!selectedNode.data.description) {
      alert("Please generate a description first.");
      return;
    }
    setIsImageLoading(true);
    const startedAt = performance.now();
    appendEvaluationLog({
      type: 'ai_generate_image_start',
      nodeId: selectedNode.id,
      title: selectedNode.data.label,
      descriptionLength: (selectedNode.data.description || '').length,
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: selectedNode.data.description }),
      });
      if (!response.ok) {
        appendEvaluationLog({
          type: 'ai_generate_image_error',
          nodeId: selectedNode.id,
          title: selectedNode.data.label,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          error: 'Network response was not ok',
        });
        throw new Error('Network response was not ok');
      }
      const data = await response.json();
      onDataChange({ imageUrl: data.imageUrl });
      appendEvaluationLog({
        type: 'ai_generate_image_success',
        nodeId: selectedNode.id,
        title: selectedNode.data.label,
        durationMs: Math.round(performance.now() - startedAt),
        imageUrl: data.imageUrl,
      });
    } catch (error) {
      console.error("Failed to generate image:", error);
      alert("Error generating image.");
    } finally {
      setIsImageLoading(false);
    }
  };

  if (selectedNode) {
    return (
      <aside className="sidebar">
        <h3>Edit Scene</h3>
        <label>Title:</label>
        <input name="label" value={selectedNode.data.label} onChange={handleNodeDataChange} />

        <label>Location:</label>
        <select name="location" value={selectedNode.data.location || ''} onChange={handleNodeDataChange}>
          <option value="">(None)</option>
          {locationOptions.map((name) => (
            <option key={name} value={name}>{name}</option>
          ))}
        </select>

        <label>Image URL:</label>
        <div className="input-with-button">
          <input name="imageUrl" value={selectedNode.data.imageUrl || ''} onChange={handleNodeDataChange} />
          <button onClick={handleImageGenerate} disabled={isImageLoading} className="generate-btn-small">
            {isImageLoading ? '...' : '🎨'}
          </button>
        </div>
        {selectedNode.data.imageUrl && <img src={getDisplayImageUrl(selectedNode.data.imageUrl)} alt="Preview" style={{ width: '100%', marginTop: '10px', borderRadius: '4px' }} />}

        <label>Description:</label>
        <div className="description-header">
          <button onClick={handleTextGenerate} disabled={isTextLoading} className="generate-btn">
            {isTextLoading ? 'Generating...' : '✨ Generate with AI'}
          </button>
        </div>
        <textarea name="description" rows="8" value={selectedNode.data.description || ''} onChange={handleNodeDataChange} />

        {selectedNode.data.suggestedActions && (
          <div className="suggestions-container">
            <h4>AI Suggested Actions:</h4>
            <ul>
              {selectedNode.data.suggestedActions.map((action, index) => (
                <li key={index}>
                  <span>{action}</span>
                  <button onClick={() => {
                    appendEvaluationLog({
                      type: 'apply_suggested_action',
                      nodeId: selectedNode.id,
                      title: selectedNode.data.label,
                      action,
                    });
                    addNodeFromSuggestion(selectedNode.id, action);
                  }} title="Create node and connect">+</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* --- Delete button --- */}
        <div className="sidebar-separator"></div>
        <button onClick={onDeleteElement} className="delete-btn">Delete Scene</button>

      </aside>
    );
  }

  if (selectedEdge) {
    return (
      <aside className="sidebar">
        <h3>Edit Choice</h3>
        <label>Label:</label>
        <input value={selectedEdge.label} onChange={handleEdgeLabelChange} />

        {/* --- Delete button --- */}
        <div className="sidebar-separator"></div>
        <button onClick={onDeleteElement} className="delete-btn">Delete Choice</button>
      </aside>
    );
  }

  return null;
}
