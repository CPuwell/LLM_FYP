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
          <section>
            <h3>🔑 Getting Started (AI Setup)</h3>
            <ul>
              <li>To use AI features, click the <strong>Key icon</strong> at the top right to enter your <strong>Gemini API Key</strong>.</li>
              <li>Your key is stored only in your browser's local storage and is sent to the backend only when an AI request needs it.</li>
            </ul>
          </section>

          <section>
            <h3>🎮 Editor vs Player Mode</h3>
            <ul>
              <li><strong>Editor Mode</strong>: Build your world by adding nodes (scenes) and edges (choices).</li>
              <li><strong>Player Mode</strong>: Click <strong>Play Story</strong> at the top to test your story as a player.</li>
              <li>In Player Mode, you can see how attributes change and how the AI describes the scene based on your past actions.</li>
            </ul>
          </section>

          <section>
            <h3>📝 Core Concepts</h3>
            <ul>
              <li><strong>Node</strong>: Represents a specific Location or Scene.</li>
              <li><strong>Edge</strong>: Represents a Choice or Action leading from one scene to another.</li>
              <li><strong>World Bible</strong>: Your story's "source of truth". Define global rules, character traits, and location details here so the AI can use them as guidance.</li>
            </ul>
          </section>

          <section>
            <h3>🧠 Long-term Memory</h3>
            <ul>
              <li>The system automatically tracks important facts and events as you play.</li>
              <li>These "Facts" are summarized by the AI and injected into future scene generations, allowing the world to remember your past choices even if they weren't explicitly coded as attributes.</li>
              <li>You can view the current memory state in Player Mode.</li>
            </ul>
          </section>

          <section>
            <h3>⚡ Attributes & Conditions</h3>
            <ul>
              <li><strong>On Enter Effects</strong>: Change attributes (e.g., <code>health -= 10</code>) when a player enters a scene.</li>
              <li><strong>Edge Requirements</strong>: Hide or lock choices if conditions aren't met (e.g., <code>hasKey == true</code>).</li>
              <li><strong>Edge Effects</strong>: Change attributes when a choice is selected.</li>
              <li><strong>Single-use</strong>: Mark a choice as "Single-use" to prevent players from repeating it (useful for unique items or irreversible actions).</li>
            </ul>
          </section>

          <section>
            <h3>🖋️ Setting (Scene Notes)</h3>
            <ul>
              <li>Use the Setting field to provide specific details for a scene.</li>
              <li>You can use <strong>Conditional Logic</strong> to change what the AI knows based on attributes:</li>
            </ul>
            <pre className="guide-code">{`[
  { "text": "A dusty library." },
  { "when": { "eq": ["hasTorch", true] }, "text": "Your torch illuminates ancient runes on the walls." },
  { "when": { "lt": ["sanity", 5] }, "text": "The shadows seem to whisper your name." }
]`}</pre>
          </section>

          <section>
            <h3>✨ AI Generation & Suggestions</h3>
            <ul>
              <li><strong>Generate Content</strong>: The AI can write a detailed scene description based on your Setting and World Bible.</li>
              <li><strong>Action Suggestions</strong>: After generating a description, the AI suggests 3 possible next actions.</li>
              <li><strong>Quick Build</strong>: Click the <strong>+</strong> button on an AI suggestion to automatically create a new scene and connect it with an edge.</li>
            </ul>
          </section>

          <section>
            <h3>📐 Layout & Visuals</h3>
            <ul>
              <li><strong>Edge Bending</strong>: Click an edge to see a midpoint handle. Drag it to curve the line and keep your graph clean.</li>
              <li><strong>Images</strong>: Click "Generate Image" to create a visual for the current scene. External images are safely proxied to avoid loading issues.</li>
            </ul>
          </section>

          <section>
            <h3>📊 Analysis & Evaluation</h3>
            <ul>
              <li><strong>Analyze</strong>: Use the Analyze tool to check your story for <strong>reachability</strong>, <strong>dead ends</strong>, and invalid connections to ensure a smooth player experience.</li>
              <li><strong>Logs</strong>: Access detailed logs of AI interactions, including prompts, responses, and performance metrics, to debug and refine your story logic.</li>
              <li><strong>Eval Pack</strong>: Export a complete <strong>Evaluation Package</strong> containing your story, analysis results, and interaction logs. This is ideal for gathering feedback or providing academic evidence.</li>
            </ul>
          </section>

          <section>
            <h3>💾 Backups & Data Management</h3>
            <ul>
              <li><strong>Backups</strong>: Save multiple versions of your work directly in your browser's local storage using the Backups manager.</li>
              <li><strong>Export/Import</strong>: Download your entire story as a JSON file to share with others or move between different computers.</li>
              <li><strong>New Story</strong>: Quickly reset the workspace to start a fresh project.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
