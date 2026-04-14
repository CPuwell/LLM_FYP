// src/Sidebar.jsx
import React, { useEffect, useRef, useState } from 'react';
import { getDisplayImageUrl } from './imageUtils.js';
import { appendEvaluationLog } from './evaluationLog.js';
import { getStoryMemory, selectFactsForScene } from './storyMemory.js';
import { buildGeminiKeyHeader } from './userApiKey.js';

// accept new prop: onDeleteElement
export default function Sidebar({ selectedNode, onDataChange, selectedEdge, onEdgeLabelChange, onEdgeDataChange, storyContext, worldBible, attributeKeyOptions, sidebarWidth, onSidebarWidthChange, addNodeFromSuggestion, onDeleteElement }) {
  const [isTextLoading, setIsTextLoading] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [isPlayerPreviewLoading, setIsPlayerPreviewLoading] = useState(false);
  const [playerPreviewText, setPlayerPreviewText] = useState('');
  const [playerPreviewAttributesRaw, setPlayerPreviewAttributesRaw] = useState(() => localStorage.getItem('playerPreviewAttributes') || '{}');
  const [nodeOnEnterEffects, setNodeOnEnterEffects] = useState([]);
  const [edgeRequirements, setEdgeRequirements] = useState([]);
  const [edgeRequirementsMode, setEdgeRequirementsMode] = useState('all');
  const [edgeEffects, setEdgeEffects] = useState([]);
  const resizeRef = useRef(null);
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
  const locationOptions = Array.from(new Set((worldBible?.locations || []).map((l) => (l?.name || '').trim()).filter(Boolean)));
  const attributeKeys = Array.isArray(attributeKeyOptions) ? attributeKeyOptions : [];

  useEffect(() => {
    if (selectedNode) {
      const v = selectedNode?.data?.onEnterEffects;
      setNodeOnEnterEffects(Array.isArray(v) ? v.map((e) => ({
        key: typeof e?.key === 'string' ? e.key : '',
        op: typeof e?.op === 'string' ? e.op : 'set',
        valueKind: (typeof e?.value === 'boolean') ? 'boolean' : (typeof e?.value === 'number' ? 'number' : 'text'),
        value: e?.value,
      })) : []);
    } else {
      setNodeOnEnterEffects([]);
    }
    setPlayerPreviewText('');
  }, [selectedNode?.id]);

  useEffect(() => {
    if (selectedEdge) {
      const r = selectedEdge?.data?.requirements;
      const e = selectedEdge?.data?.effects;
      const mode = (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.any)) ? 'any' : 'all';
      const conds = Array.isArray(r)
        ? r
        : (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.any))
          ? r.any
          : (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.all))
            ? r.all
            : (r && typeof r === 'object' && !Array.isArray(r) && Array.isArray(r.conditions))
              ? r.conditions
              : [];
      setEdgeRequirementsMode(mode);
      setEdgeRequirements(Array.isArray(conds) ? conds.map((c) => ({
        key: typeof c?.key === 'string' ? c.key : '',
        op: typeof c?.op === 'string' ? c.op : 'truthy',
        valueKind: (typeof c?.value === 'boolean') ? 'boolean' : (typeof c?.value === 'number' ? 'number' : 'text'),
        value: c?.value,
      })) : []);
      setEdgeEffects(Array.isArray(e) ? e.map((eff) => ({
        key: typeof eff?.key === 'string' ? eff.key : '',
        op: typeof eff?.op === 'string' ? eff.op : 'set',
        valueKind: (typeof eff?.value === 'boolean') ? 'boolean' : (typeof eff?.value === 'number' ? 'number' : 'text'),
        value: eff?.value,
      })) : []);
    } else {
      setEdgeRequirements([]);
      setEdgeRequirementsMode('all');
      setEdgeEffects([]);
    }
  }, [selectedEdge?.id]);

  const handleNodeDataChange = (event) => {
    onDataChange({ [event.target.name]: event.target.value });
  };

  const handleEdgeLabelChange = (event) => {
    onEdgeLabelChange(event.target.value);
  };

  const handleEdgeSingleUseChange = (event) => {
    if (!onEdgeDataChange) return;
    onEdgeDataChange({ singleUse: event.target.checked });
  };

  const needsValueForCondition = (op) => ['==', '!=', '>', '>=', '<', '<='].includes(op);
  const needsValueForEffect = (op) => ['set', 'inc', 'dec'].includes(op);

  const normalizeValueByKind = (kind, value, fallback = '') => {
    if (kind === 'boolean') return Boolean(value);
    if (kind === 'number') {
      const n = typeof value === 'number' ? value : Number(value);
      return Number.isFinite(n) ? n : 0;
    }
    if (value === undefined || value === null) return fallback;
    return `${value}`;
  };

  const commitNodeEffects = (list) => {
    const clean = list
      .filter((r) => typeof r?.key === 'string' && r.key.trim())
      .map((r) => {
        const op = typeof r?.op === 'string' ? r.op : 'set';
        if (!needsValueForEffect(op) || op === 'toggle' || op === 'unset') {
          return { key: r.key.trim(), op };
        }
        const kind = r?.valueKind === 'number' ? 'number' : (r?.valueKind === 'boolean' ? 'boolean' : 'text');
        const fallback = op === 'inc' || op === 'dec' ? 1 : '';
        return { key: r.key.trim(), op, value: normalizeValueByKind(kind, r.value, fallback) };
      });
    onDataChange({ onEnterEffects: clean.length ? clean : undefined });
  };

  const commitEdgeReqs = (list, mode) => {
    if (!onEdgeDataChange) return;
    const clean = list
      .filter((r) => typeof r?.key === 'string' && r.key.trim())
      .map((r) => {
        const op = typeof r?.op === 'string' ? r.op : 'truthy';
        if (!needsValueForCondition(op)) return { key: r.key.trim(), op };
        const kind = r?.valueKind === 'number' ? 'number' : (r?.valueKind === 'boolean' ? 'boolean' : 'text');
        return { key: r.key.trim(), op, value: normalizeValueByKind(kind, r.value) };
      });
    const m = mode === 'any' ? 'any' : 'all';
    if (!clean.length) {
      onEdgeDataChange({ requirements: undefined });
      return;
    }
    onEdgeDataChange({ requirements: m === 'any' ? { any: clean } : clean });
  };

  const commitEdgeEffs = (list) => {
    if (!onEdgeDataChange) return;
    const clean = list
      .filter((r) => typeof r?.key === 'string' && r.key.trim())
      .map((r) => {
        const op = typeof r?.op === 'string' ? r.op : 'set';
        if (!needsValueForEffect(op) || op === 'toggle' || op === 'unset') return { key: r.key.trim(), op };
        const kind = r?.valueKind === 'number' ? 'number' : (r?.valueKind === 'boolean' ? 'boolean' : 'text');
        return { key: r.key.trim(), op, value: normalizeValueByKind(kind, r.value, op === 'inc' || op === 'dec' ? 1 : '') };
      });
    onEdgeDataChange({ effects: clean.length ? clean : undefined });
  };

  const handleTextGenerate = async () => {  
    setIsTextLoading(true);
    const startedAt = performance.now();
    const memory = getStoryMemory();
    const selectedFacts = selectFactsForScene(memory, { title: selectedNode.data.label, location: selectedNode?.data?.location || '', limit: 8 });
    const requestBody = { 
      title: selectedNode.data.label, 
      storyContext: storyContext,
      userPrompt: selectedNode.data.setting || '',
      worldBible: worldBible,
      location: selectedNode?.data?.location || '',
      memory: { summary: memory.summary, facts: selectedFacts }
    };
    appendEvaluationLog({
      type: 'ai_generate_text_start',
      nodeId: selectedNode.id,
      title: selectedNode.data.label,
      storyContextLength: (storyContext || '').length,
      userPromptLength: (selectedNode.data.setting || '').length,
      worldBibleCharactersCount: Array.isArray(worldBible?.characters) ? worldBible.characters.length : 0,
      worldBibleLocationsCount: Array.isArray(worldBible?.locations) ? worldBible.locations.length : 0,
      location: selectedNode?.data?.location || '',
      memorySummaryLength: (memory.summary || '').length,
      memoryFactsCount: Array.isArray(selectedFacts) ? selectedFacts.length : 0,
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
        // Send the current description as context
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        appendEvaluationLog({
          type: 'ai_generate_text_error',
          nodeId: selectedNode.id,
          title: selectedNode.data.label,
          location: selectedNode?.data?.location || '',
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
        location: selectedNode?.data?.location || '',
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

  const handlePlayerPreviewGenerate = async () => {
    const startedAt = performance.now();
    let attrs = {};
    try {
      const parsed = JSON.parse(playerPreviewAttributesRaw || '{}');
      attrs = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
    } catch {
      alert('Preview attributes must be valid JSON object, e.g. {"hp":10,"hasKey":true}');
      return;
    }

    setIsPlayerPreviewLoading(true);
    const memory = getStoryMemory();
    const selectedFacts = selectFactsForScene(memory, { title: selectedNode.data.label, location: selectedNode?.data?.location || '', limit: 8 });
    appendEvaluationLog({
      type: 'ai_preview_player_text_start',
      nodeId: selectedNode.id,
      title: selectedNode.data.label,
      location: selectedNode?.data?.location || '',
      durationMs: 0,
      memorySummaryLength: (memory.summary || '').length,
      memoryFactsCount: Array.isArray(selectedFacts) ? selectedFacts.length : 0,
    });
    try {
      const response = await fetch(`${apiBaseUrl}/api/generate-player`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
        body: JSON.stringify({
          title: selectedNode.data.label,
          storyContext,
          userPrompt: selectedNode.data.setting || '',
          worldBible,
          location: selectedNode?.data?.location || '',
          memory: { summary: memory.summary, facts: selectedFacts },
          attributes: attrs,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        appendEvaluationLog({
          type: 'ai_preview_player_text_error',
          nodeId: selectedNode.id,
          title: selectedNode.data.label,
          status: response.status,
          durationMs: Math.round(performance.now() - startedAt),
          error: errorData.details || errorData.error || 'Network response was not ok',
        });
        throw new Error(errorData.details || errorData.error || 'Network response was not ok');
      }
      const data = await response.json();
      setPlayerPreviewText(typeof data?.description === 'string' ? data.description : '');
      appendEvaluationLog({
        type: 'ai_preview_player_text_success',
        nodeId: selectedNode.id,
        title: selectedNode.data.label,
        durationMs: Math.round(performance.now() - startedAt),
        model: data?.meta?.model || '',
      });
    } catch (e) {
      alert(`Preview generation failed: ${e?.message || 'Unknown error'}`);
    } finally {
      setIsPlayerPreviewLoading(false);
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
        headers: { 'Content-Type': 'application/json', ...buildGeminiKeyHeader() },
        body: JSON.stringify({
          description: selectedNode.data.description,
          title: selectedNode.data.label,
          location: selectedNode?.data?.location || '',
          storyContext: storyContext || '',
          tone: worldBible?.tone || '',
          styleGuide: worldBible?.styleGuide || '',
        }),
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

  const onResizePointerDown = (e) => {
    if (typeof onSidebarWidthChange !== 'function') return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = Number.isFinite(sidebarWidth) ? sidebarWidth : 420;
    resizeRef.current = { startX, startW, pid: e.pointerId };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
    }
  };

  const onResizePointerMove = (e) => {
    const d = resizeRef.current;
    if (!d) return;
    if (typeof onSidebarWidthChange !== 'function') return;
    e.preventDefault();
    e.stopPropagation();
    const deltaX = e.clientX - d.startX;
    const nextW = Math.max(340, Math.min(700, d.startW - deltaX));
    onSidebarWidthChange(nextW, false);
  };

  const onResizePointerUp = (e) => {
    const d = resizeRef.current;
    if (!d) return;
    resizeRef.current = null;
    try {
      e.currentTarget.releasePointerCapture(d.pid);
    } catch {
    }
    if (typeof onSidebarWidthChange === 'function') {
      const currentW = Number.isFinite(sidebarWidth) ? sidebarWidth : 420;
      onSidebarWidthChange(currentW, true);
    }
  };

  if (selectedNode) {
    const dynamicDescriptionEnabled = Boolean(selectedNode?.data?.dynamicDescriptionEnabled);
    const dynamicImageEnabled = Boolean(selectedNode?.data?.dynamicImageEnabled);
    return (
      <aside className="sidebar" style={{ width: Number.isFinite(sidebarWidth) ? `${sidebarWidth}px` : undefined }}>
        <div
          className="sidebar-resizer"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
        />
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

        <label>Setting:</label>
        <textarea
          name="setting"
          rows="5"
          value={selectedNode.data.setting || ''}
          onChange={handleNodeDataChange}
          placeholder="Author intent, constraints, must-happen beats, state-based rules..."
        />

        <label>Dynamic Description (Player Mode):</label>
        <input
          type="checkbox"
          checked={dynamicDescriptionEnabled}
          onChange={(e) => onDataChange({ dynamicDescriptionEnabled: e.target.checked })}
        />

        <label>Dynamic Image (Player Mode):</label>
        <input
          type="checkbox"
          checked={dynamicImageEnabled}
          onChange={(e) => onDataChange({ dynamicImageEnabled: e.target.checked })}
        />

        <label>Description:</label>
        <div className="description-header">
          <button onClick={handleTextGenerate} disabled={isTextLoading} className="generate-btn">
            {isTextLoading ? 'Generating...' : '✨ Generate with AI'}
          </button>
        </div>
        <textarea name="description" rows="8" value={selectedNode.data.description || ''} onChange={handleNodeDataChange} />

        <label>Player Preview Attributes (JSON):</label>
        <textarea
          rows="3"
          value={playerPreviewAttributesRaw}
          onChange={(e) => {
            const v = e.target.value;
            setPlayerPreviewAttributesRaw(v);
            try { localStorage.setItem('playerPreviewAttributes', v); } catch { }
          }}
          placeholder='{"hp":10,"hasKey":true}'
        />
        <button onClick={handlePlayerPreviewGenerate} disabled={isPlayerPreviewLoading} className="generate-btn">
          {isPlayerPreviewLoading ? 'Previewing...' : '👁 Preview Player Description'}
        </button>
        {playerPreviewText ? (
          <textarea rows="6" value={playerPreviewText} readOnly />
        ) : null}

        <datalist id="attr-keys">
          {attributeKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        <label>On Enter Effects:</label>
        <div className="attr-list">
          {nodeOnEnterEffects.map((row, idx) => {
            const op = typeof row?.op === 'string' ? row.op : 'set';
            const showValue = needsValueForEffect(op);
            const kind = row?.valueKind === 'number' ? 'number' : (row?.valueKind === 'boolean' ? 'boolean' : 'text');
            const valueKindLocked = op === 'inc' || op === 'dec';
            const effKind = valueKindLocked ? 'number' : kind;
            const value = normalizeValueByKind(effKind, row?.value, valueKindLocked ? 1 : '');
            return (
              <div className="attr-row" key={idx}>
                <input
                  list="attr-keys"
                  value={row?.key || ''}
                  onChange={(e) => {
                    const next = nodeOnEnterEffects.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r));
                    setNodeOnEnterEffects(next);
                    commitNodeEffects(next);
                  }}
                  placeholder="key"
                />
                <select
                  value={op}
                  onChange={(e) => {
                    const nextOp = e.target.value;
                    const next = nodeOnEnterEffects.map((r, i) => (i === idx ? { ...r, op: nextOp, valueKind: (nextOp === 'inc' || nextOp === 'dec') ? 'number' : r.valueKind } : r));
                    setNodeOnEnterEffects(next);
                    commitNodeEffects(next);
                  }}
                >
                  <option value="set">Set</option>
                  <option value="toggle">Toggle</option>
                  <option value="inc">Increase</option>
                  <option value="dec">Decrease</option>
                  <option value="unset">Unset</option>
                </select>
                {showValue ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!valueKindLocked ? (
                      <select
                        value={effKind}
                        onChange={(e) => {
                          const nextKind = e.target.value;
                          const nextVal = nextKind === 'boolean' ? Boolean(row?.value) : (nextKind === 'number' ? Number(row?.value ?? 0) : `${row?.value ?? ''}`);
                          const next = nodeOnEnterEffects.map((r, i) => (i === idx ? { ...r, valueKind: nextKind, value: nextVal } : r));
                          setNodeOnEnterEffects(next);
                          commitNodeEffects(next);
                        }}
                      >
                        <option value="boolean">Bool</option>
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                      </select>
                    ) : null}
                    {effKind === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => {
                          const next = nodeOnEnterEffects.map((r, i) => (i === idx ? { ...r, value: e.target.checked, valueKind: 'boolean' } : r));
                          setNodeOnEnterEffects(next);
                          commitNodeEffects(next);
                        }}
                        style={{ width: 18, height: 18 }}
                      />
                    ) : (
                      <input
                        type={effKind === 'number' ? 'number' : 'text'}
                        value={effKind === 'number' ? String(value) : value}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextValue = effKind === 'number' ? Number(raw) : raw;
                          const next = nodeOnEnterEffects.map((r, i) => (i === idx ? { ...r, value: nextValue, valueKind: effKind } : r));
                          setNodeOnEnterEffects(next);
                          commitNodeEffects(next);
                        }}
                        placeholder={effKind === 'number' ? '0' : 'value'}
                      />
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  className="attr-remove"
                  onClick={() => {
                    const next = nodeOnEnterEffects.filter((_, i) => i !== idx);
                    setNodeOnEnterEffects(next);
                    commitNodeEffects(next);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="attr-actions">
          <button
            type="button"
            className="attr-add"
            onClick={() => {
              const next = [...nodeOnEnterEffects, { key: '', op: 'set', valueKind: 'boolean', value: true }];
              setNodeOnEnterEffects(next);
              commitNodeEffects(next);
            }}
          >
            + Add Effect
          </button>
        </div>

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
                      location: selectedNode?.data?.location || '',
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
      <aside className="sidebar" style={{ width: Number.isFinite(sidebarWidth) ? `${sidebarWidth}px` : undefined }}>
        <div
          className="sidebar-resizer"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
        />
        <h3>Edit Choice</h3>
        <label>Label:</label>
        <input value={selectedEdge.label} onChange={handleEdgeLabelChange} />

        <div className="sidebar-checkbox-row">
          <input
            className="sidebar-checkbox"
            id="edge-single-use"
            type="checkbox"
            checked={Boolean(selectedEdge?.data?.singleUse)}
            onChange={handleEdgeSingleUseChange}
          />
          <label className="sidebar-checkbox-label" htmlFor="edge-single-use">Single-use (choose once)</label>
        </div>

        <datalist id="attr-keys">
          {attributeKeys.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>

        <label>Requirements:</label>
        <select
          value={edgeRequirementsMode}
          onChange={(e) => {
            const nextMode = e.target.value === 'any' ? 'any' : 'all';
            setEdgeRequirementsMode(nextMode);
            commitEdgeReqs(edgeRequirements, nextMode);
          }}
        >
          <option value="all">Match ALL (AND)</option>
          <option value="any">Match ANY (OR)</option>
        </select>
        <div className="attr-list">
          {edgeRequirements.map((row, idx) => {
            const op = typeof row?.op === 'string' ? row.op : 'truthy';
            const showValue = needsValueForCondition(op);
            const valueKindLocked = op === '>' || op === '>=' || op === '<' || op === '<=';
            const kind = row?.valueKind === 'number' ? 'number' : (row?.valueKind === 'boolean' ? 'boolean' : 'text');
            const condKind = valueKindLocked ? 'number' : kind;
            const value = normalizeValueByKind(condKind, row?.value, '');
            return (
              <div className="attr-row" key={idx}>
                <input
                  list="attr-keys"
                  value={row?.key || ''}
                  onChange={(e) => {
                    const next = edgeRequirements.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r));
                    setEdgeRequirements(next);
                    commitEdgeReqs(next, edgeRequirementsMode);
                  }}
                  placeholder="key"
                />
                <select
                  value={op}
                  onChange={(e) => {
                    const nextOp = e.target.value;
                    const next = edgeRequirements.map((r, i) => (i === idx ? { ...r, op: nextOp, valueKind: (nextOp === '>' || nextOp === '>=' || nextOp === '<' || nextOp === '<=') ? 'number' : r.valueKind } : r));
                    setEdgeRequirements(next);
                    commitEdgeReqs(next, edgeRequirementsMode);
                  }}
                >
                  <option value="truthy">is true</option>
                  <option value="falsy">is false</option>
                  <option value="exists">exists</option>
                  <option value="!exists">not exists</option>
                  <option value="==">equals</option>
                  <option value="!=">not equals</option>
                  <option value=">">{'>'}</option>
                  <option value=">=">{'>='}</option>
                  <option value="<">{'<'}</option>
                  <option value="<=">{'<='}</option>
                </select>
                {showValue ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!valueKindLocked ? (
                      <select
                        value={condKind}
                        onChange={(e) => {
                          const nextKind = e.target.value;
                          const nextVal = nextKind === 'boolean' ? Boolean(row?.value) : (nextKind === 'number' ? Number(row?.value ?? 0) : `${row?.value ?? ''}`);
                          const next = edgeRequirements.map((r, i) => (i === idx ? { ...r, valueKind: nextKind, value: nextVal } : r));
                          setEdgeRequirements(next);
                          commitEdgeReqs(next, edgeRequirementsMode);
                        }}
                      >
                        <option value="boolean">Bool</option>
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                      </select>
                    ) : null}
                    {condKind === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => {
                          const next = edgeRequirements.map((r, i) => (i === idx ? { ...r, value: e.target.checked, valueKind: 'boolean' } : r));
                          setEdgeRequirements(next);
                          commitEdgeReqs(next, edgeRequirementsMode);
                        }}
                        style={{ width: 18, height: 18 }}
                      />
                    ) : (
                      <input
                        type={condKind === 'number' ? 'number' : 'text'}
                        value={condKind === 'number' ? String(value) : value}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextValue = condKind === 'number' ? Number(raw) : raw;
                          const next = edgeRequirements.map((r, i) => (i === idx ? { ...r, value: nextValue, valueKind: condKind } : r));
                          setEdgeRequirements(next);
                          commitEdgeReqs(next, edgeRequirementsMode);
                        }}
                        placeholder={condKind === 'number' ? '0' : 'value'}
                      />
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  className="attr-remove"
                  onClick={() => {
                    const next = edgeRequirements.filter((_, i) => i !== idx);
                    setEdgeRequirements(next);
                    commitEdgeReqs(next, edgeRequirementsMode);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="attr-actions">
          <button
            type="button"
            className="attr-add"
            onClick={() => {
              const next = [...edgeRequirements, { key: '', op: 'truthy', valueKind: 'boolean', value: true }];
              setEdgeRequirements(next);
              commitEdgeReqs(next, edgeRequirementsMode);
            }}
          >
            + Add Condition
          </button>
        </div>

        <label>Effects:</label>
        <div className="attr-list">
          {edgeEffects.map((row, idx) => {
            const op = typeof row?.op === 'string' ? row.op : 'set';
            const showValue = needsValueForEffect(op);
            const kind = row?.valueKind === 'number' ? 'number' : (row?.valueKind === 'boolean' ? 'boolean' : 'text');
            const valueKindLocked = op === 'inc' || op === 'dec';
            const effKind = valueKindLocked ? 'number' : kind;
            const value = normalizeValueByKind(effKind, row?.value, valueKindLocked ? 1 : '');
            return (
              <div className="attr-row" key={idx}>
                <input
                  list="attr-keys"
                  value={row?.key || ''}
                  onChange={(e) => {
                    const next = edgeEffects.map((r, i) => (i === idx ? { ...r, key: e.target.value } : r));
                    setEdgeEffects(next);
                    commitEdgeEffs(next);
                  }}
                  placeholder="key"
                />
                <select
                  value={op}
                  onChange={(e) => {
                    const nextOp = e.target.value;
                    const next = edgeEffects.map((r, i) => (i === idx ? { ...r, op: nextOp, valueKind: (nextOp === 'inc' || nextOp === 'dec') ? 'number' : r.valueKind } : r));
                    setEdgeEffects(next);
                    commitEdgeEffs(next);
                  }}
                >
                  <option value="set">Set</option>
                  <option value="toggle">Toggle</option>
                  <option value="inc">Increase</option>
                  <option value="dec">Decrease</option>
                  <option value="unset">Unset</option>
                </select>
                {showValue ? (
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    {!valueKindLocked ? (
                      <select
                        value={effKind}
                        onChange={(e) => {
                          const nextKind = e.target.value;
                          const nextVal = nextKind === 'boolean' ? Boolean(row?.value) : (nextKind === 'number' ? Number(row?.value ?? 0) : `${row?.value ?? ''}`);
                          const next = edgeEffects.map((r, i) => (i === idx ? { ...r, valueKind: nextKind, value: nextVal } : r));
                          setEdgeEffects(next);
                          commitEdgeEffs(next);
                        }}
                      >
                        <option value="boolean">Bool</option>
                        <option value="number">Number</option>
                        <option value="text">Text</option>
                      </select>
                    ) : null}
                    {effKind === 'boolean' ? (
                      <input
                        type="checkbox"
                        checked={Boolean(value)}
                        onChange={(e) => {
                          const next = edgeEffects.map((r, i) => (i === idx ? { ...r, value: e.target.checked, valueKind: 'boolean' } : r));
                          setEdgeEffects(next);
                          commitEdgeEffs(next);
                        }}
                        style={{ width: 18, height: 18 }}
                      />
                    ) : (
                      <input
                        type={effKind === 'number' ? 'number' : 'text'}
                        value={effKind === 'number' ? String(value) : value}
                        onChange={(e) => {
                          const raw = e.target.value;
                          const nextValue = effKind === 'number' ? Number(raw) : raw;
                          const next = edgeEffects.map((r, i) => (i === idx ? { ...r, value: nextValue, valueKind: effKind } : r));
                          setEdgeEffects(next);
                          commitEdgeEffs(next);
                        }}
                        placeholder={effKind === 'number' ? '0' : 'value'}
                      />
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <button
                  type="button"
                  className="attr-remove"
                  onClick={() => {
                    const next = edgeEffects.filter((_, i) => i !== idx);
                    setEdgeEffects(next);
                    commitEdgeEffs(next);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
        <div className="attr-actions">
          <button
            type="button"
            className="attr-add"
            onClick={() => {
              const next = [...edgeEffects, { key: '', op: 'set', valueKind: 'boolean', value: true }];
              setEdgeEffects(next);
              commitEdgeEffs(next);
            }}
          >
            + Add Effect
          </button>
        </div>

        {/* --- Delete button --- */}
        <div className="sidebar-separator"></div>
        <button onClick={onDeleteElement} className="delete-btn">Delete Choice</button>
      </aside>
    );
  }

  return null;
}
