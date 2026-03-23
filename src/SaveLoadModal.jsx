import React, { useState, useEffect } from 'react';
import './SaveLoadModal.css';

export default function SaveLoadModal({ isOpen, onClose, currentData, onLoad }) {
  const [saves, setSaves] = useState([]);
  const [newSaveName, setNewSaveName] = useState('');

  // Load saves from localStorage when modal opens
  useEffect(() => {
    if (isOpen) {
      const savedStories = JSON.parse(localStorage.getItem('llm_fyp_saves') || '[]');
      setSaves(savedStories);
      setNewSaveName(`Story Backup ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
    }
  }, [isOpen]);

  const handleSave = () => {
    if (!newSaveName.trim()) return;

    const newSave = {
      id: Date.now(),
      name: newSaveName,
      date: new Date().toISOString(),
      data: currentData
    };

    const updatedSaves = [newSave, ...saves];
    setSaves(updatedSaves);
    localStorage.setItem('llm_fyp_saves', JSON.stringify(updatedSaves));
    setNewSaveName(''); // Clear input, or keep it for easy sequential saving? Better clear or reset.
    // Reset to a new default name
    setNewSaveName(`Story Backup ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`);
  };

  const handleDelete = (id) => {
    if (window.confirm('Are you sure you want to delete this backup?')) {
      const updatedSaves = saves.filter(save => save.id !== id);
      setSaves(updatedSaves);
      localStorage.setItem('llm_fyp_saves', JSON.stringify(updatedSaves));
    }
  };

  const handleLoad = (save) => {
    if (window.confirm(`Load "${save.name}"? Current unsaved changes will be lost.`)) {
      onLoad(save.data);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="save-load-modal-overlay">
      <div className="save-load-modal">
        <div className="modal-header">
          <h2>Story Backups</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="new-save-section">
          <input 
            type="text" 
            value={newSaveName} 
            onChange={(e) => setNewSaveName(e.target.value)}
            placeholder="Enter backup name..."
          />
          <button className="save-btn" onClick={handleSave} disabled={!newSaveName.trim()}>
            Create Backup
          </button>
        </div>

        <div className="saves-list">
          {saves.length === 0 ? (
            <div className="empty-state">No backups found. Create one above!</div>
          ) : (
            saves.map(save => (
              <div key={save.id} className="save-item">
                <div className="save-info">
                  <span className="save-name">{save.name}</span>
                  <span className="save-date">{new Date(save.date).toLocaleString()}</span>
                  <span className="save-details">{save.data.nodes.length} Scenes</span>
                </div>
                <div className="save-actions">
                  <button className="load-btn" onClick={() => handleLoad(save)}>Load</button>
                  <button className="delete-btn-small" onClick={() => handleDelete(save.id)}>Delete</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
