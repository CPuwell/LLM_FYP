import React, { useMemo } from 'react';
import { analyzeGraph } from './analysisUtils.js';

export default function StoryAnalysisModal({ isOpen, onClose, nodes, edges, startNodeId = '1' }) {
  const report = useMemo(() => analyzeGraph({ nodes, edges, startNodeId }), [nodes, edges, startNodeId]);

  const handleCopy = async () => {
    const payload = {
      startId: report.startId,
      nodeCount: report.nodeCount,
      edgeCount: report.edgeCount,
      invalidEdgeCount: report.invalidEdgeCount,
      reachableCount: report.reachableCount,
      unreachableCount: report.unreachableCount,
      deadEndCount: report.deadEndCount,
      avgOutDegree: Number.isFinite(report.avgOutDegree) ? Number(report.avgOutDegree.toFixed(3)) : 0,
      cycles: report.cycles,
      unreachableNodes: report.unreachableNodes.map((n) => ({ id: n.id, label: n?.data?.label || '' })),
      deadEndNodes: report.deadEndNodes.map((n) => ({ id: n.id, label: n?.data?.label || '' })),
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      alert('Analysis copied to clipboard.');
    } catch (e) {
      alert('Copy failed.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="story-analysis-modal-overlay">
      <div className="story-analysis-modal">
        <div className="modal-header">
          <h2>Story Graph Analysis</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="story-analysis-actions">
          <button className="copy-btn" onClick={handleCopy}>Copy</button>
        </div>

        <div className="story-analysis-body">
          <div className="story-analysis-grid">
            <div className="story-analysis-kv">
              <div className="k">Start node</div>
              <div className="v">{report.startId || 'None'}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Nodes</div>
              <div className="v">{report.nodeCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Edges</div>
              <div className="v">{report.edgeCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Reachable</div>
              <div className="v">{report.reachableCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Unreachable</div>
              <div className="v">{report.unreachableCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Dead ends</div>
              <div className="v">{report.deadEndCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Invalid edges</div>
              <div className="v">{report.invalidEdgeCount}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Avg out-degree</div>
              <div className="v">{Number.isFinite(report.avgOutDegree) ? report.avgOutDegree.toFixed(2) : '0.00'}</div>
            </div>
            <div className="story-analysis-kv">
              <div className="k">Cycles</div>
              <div className="v">{report.cycles.length}</div>
            </div>
          </div>

          <div className="story-analysis-section">
            <h3>Unreachable nodes</h3>
            {report.unreachableNodes.length === 0 ? (
              <div className="story-analysis-empty">None</div>
            ) : (
              <ul className="story-analysis-list">
                {report.unreachableNodes.slice(0, 50).map((n) => (
                  <li key={n.id}>
                    <span className="id">{n.id}</span>
                    <span className="label">{n?.data?.label || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="story-analysis-section">
            <h3>Dead-end nodes</h3>
            {report.deadEndNodes.length === 0 ? (
              <div className="story-analysis-empty">None</div>
            ) : (
              <ul className="story-analysis-list">
                {report.deadEndNodes.slice(0, 50).map((n) => (
                  <li key={n.id}>
                    <span className="id">{n.id}</span>
                    <span className="label">{n?.data?.label || ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="story-analysis-section">
            <h3>Cycles</h3>
            {report.cycles.length === 0 ? (
              <div className="story-analysis-empty">None</div>
            ) : (
              <ul className="story-analysis-list">
                {report.cycles.slice(0, 20).map((c, idx) => (
                  <li key={idx}>
                    <span className="label">{c.join(' → ')}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
