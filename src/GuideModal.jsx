import React from 'react';

export default function GuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="guide-modal-overlay">
      <div className="guide-modal">
        <div className="modal-header">
          <h2>Quick Guide</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="guide-body">
          <h3>Graph Editor</h3>
          <ul>
            <li>Node = Location/Scene</li>
            <li>Edge = Action/Choice between scenes</li>
            <li>Click a node/edge to edit details in the right sidebar</li>
            <li>Resize the sidebar by dragging its left edge</li>
          </ul>

          <h3>Story Context</h3>
          <ul>
            <li>High-level background for this story run</li>
            <li>Keep it short: genre, mood, player role, core goal</li>
            <li>Example: "Dark fantasy at dusk. You are a lost courier. Goal: reach the watchtower without being seen."</li>
          </ul>

          <h3>World Bible</h3>
          <ul>
            <li>Structured, reusable canon: rules, tone, style, characters, locations</li>
            <li>Prefer putting detailed facts here to avoid repetition in Story Context</li>
            <li>Generation prioritizes World Bible constraints when relevant</li>
            <li>Example (Rules): "No visible magic. Firearms are rare and unreliable."</li>
            <li>Example (Character): "Captain Rhea: one-eyed scout leader; distrusts outsiders; speaks in short sentences."</li>
            <li>Example (Location): "Watchtower of Lorn: crumbling stone tower; blue lantern at the top; wolves avoid it."</li>
          </ul>

          <h3>AI Generate</h3>
          <ul>
            <li>✨ Generates a scene description and three suggested actions</li>
            <li>Use + on a suggestion to create a new node and connect it</li>
          </ul>

          <h3>Attributes / Conditions</h3>
          <ul>
            <li>Each scene can apply effects when entered (On Enter Effects)</li>
            <li>Each choice can require conditions (Requirements) and apply effects (Effects)</li>
            <li>Locked choices are disabled in Player Mode</li>
            <li>Common examples: hasKey (bool), injured (bool), health (number)</li>
          </ul>

          <h3>Choice Rules</h3>
          <ul>
            <li>Single-use choices can be selected only once in Player Mode</li>
          </ul>

          <h3>Edge Routing</h3>
          <ul>
            <li>Select an edge to reveal a draggable midpoint control</li>
            <li>Drag it to adjust the edge path and improve readability</li>
          </ul>

          <h3>Images</h3>
          <ul>
            <li>🎨 Generate an image from the current scene description</li>
            <li>External image URLs are displayed via backend proxy to reduce CORS/mixed-content issues</li>
          </ul>

          <h3>Analyze</h3>
          <ul>
            <li>Shows reachability, dead ends, invalid edges, average branching, cycles</li>
            <li>Copy metrics as JSON for evaluation write-up</li>
          </ul>

          <h3>Eval Pack / Logs</h3>
          <ul>
            <li>🧾 Logs: records generation attempts, outcomes, durations, and which AI suggestions were applied</li>
            <li>📦 Eval Pack: exports story + analysis + logs as one JSON for evaluation evidence</li>
            <li>Use New Session to separate different participants or experiment runs</li>
          </ul>

          <h3>Backups / Import / Export</h3>
          <ul>
            <li>Backups: multiple save slots in the browser</li>
            <li>Export: download a JSON file (includes World Bible)</li>
            <li>Import: load JSON and auto-fix common issues</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
