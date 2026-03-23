import React, { useEffect, useMemo, useState } from 'react';

export default function WorldBibleModal({ isOpen, onClose, value, onChange, onReset }) {
  const empty = useMemo(() => ({
    premise: '',
    tone: '',
    rules: '',
    styleGuide: '',
    characters: [],
    locations: [],
  }), []);

  const [draft, setDraft] = useState(value || empty);

  useEffect(() => {
    if (isOpen) setDraft(value || empty);
  }, [isOpen, value, empty]);

  const update = (next) => {
    setDraft(next);
    onChange?.(next);
  };

  const updateField = (key, nextValue) => {
    update({ ...draft, [key]: nextValue });
  };

  const addEntry = (key) => {
    const arr = Array.isArray(draft[key]) ? draft[key] : [];
    update({ ...draft, [key]: [...arr, { name: '', description: '' }] });
  };

  const updateEntry = (key, index, patch) => {
    const arr = Array.isArray(draft[key]) ? draft[key] : [];
    const nextArr = arr.map((e, i) => (i === index ? { ...e, ...patch } : e));
    update({ ...draft, [key]: nextArr });
  };

  const deleteEntry = (key, index) => {
    const arr = Array.isArray(draft[key]) ? draft[key] : [];
    update({ ...draft, [key]: arr.filter((_, i) => i !== index) });
  };

  const handleReset = () => {
    onReset?.();
    update(empty);
  };

  if (!isOpen) return null;

  return (
    <div className="world-bible-modal-overlay">
      <div className="world-bible-modal">
        <div className="modal-header">
          <h2>World Bible</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="world-bible-actions">
          <button className="reset-btn" onClick={handleReset}>Reset</button>
        </div>

        <div className="world-bible-body">
          <label>Premise</label>
          <textarea value={draft.premise || ''} onChange={(e) => updateField('premise', e.target.value)} rows="2" />

          <label>Tone</label>
          <textarea value={draft.tone || ''} onChange={(e) => updateField('tone', e.target.value)} rows="2" />

          <label>World Rules</label>
          <textarea value={draft.rules || ''} onChange={(e) => updateField('rules', e.target.value)} rows="4" />

          <label>Style Guide</label>
          <textarea value={draft.styleGuide || ''} onChange={(e) => updateField('styleGuide', e.target.value)} rows="4" />

          <div className="world-bible-section-header">
            <h3>Locations</h3>
            <button className="add-btn" onClick={() => addEntry('locations')}>Add</button>
          </div>
          <div className="world-bible-list">
            {(draft.locations || []).map((loc, idx) => (
              <div key={idx} className="world-bible-item">
                <div className="world-bible-item-top">
                  <input
                    value={loc?.name || ''}
                    placeholder="Name"
                    onChange={(e) => updateEntry('locations', idx, { name: e.target.value })}
                  />
                  <button className="delete-btn-small" onClick={() => deleteEntry('locations', idx)}>Delete</button>
                </div>
                <textarea
                  value={loc?.description || ''}
                  placeholder="Description"
                  rows="3"
                  onChange={(e) => updateEntry('locations', idx, { description: e.target.value })}
                />
              </div>
            ))}
          </div>

          <div className="world-bible-section-header">
            <h3>Characters</h3>
            <button className="add-btn" onClick={() => addEntry('characters')}>Add</button>
          </div>
          <div className="world-bible-list">
            {(draft.characters || []).map((ch, idx) => (
              <div key={idx} className="world-bible-item">
                <div className="world-bible-item-top">
                  <input
                    value={ch?.name || ''}
                    placeholder="Name"
                    onChange={(e) => updateEntry('characters', idx, { name: e.target.value })}
                  />
                  <button className="delete-btn-small" onClick={() => deleteEntry('characters', idx)}>Delete</button>
                </div>
                <textarea
                  value={ch?.description || ''}
                  placeholder="Description"
                  rows="3"
                  onChange={(e) => updateEntry('characters', idx, { description: e.target.value })}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

