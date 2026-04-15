import React, { useEffect, useMemo, useState } from 'react';
import { clearEvaluationLogs, getEvaluationLogs, getEvaluationSessionId, resetEvaluationSession } from './evaluationLog.js';

export default function EvaluationLogsModal({ isOpen, onClose }) {
  const [refreshKey, setRefreshKey] = useState(0);
  const logs = useMemo(() => getEvaluationLogs(), [refreshKey]);
  const sessionId = useMemo(() => getEvaluationSessionId(), [refreshKey]);

  const handleRefresh = () => setRefreshKey((x) => x + 1);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ sessionId, logs }, null, 2));
      alert('Logs copied to clipboard.');
    } catch {
      alert('Copy failed.');
    }
  };

  const handleDownload = () => {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessionId, logs }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `evaluation-logs-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClear = () => {
    const ok = window.confirm('Clear all evaluation logs?');
    if (!ok) return;
    clearEvaluationLogs();
    handleRefresh();
  };

  const handleNewSession = () => {
    const ok = window.confirm('Start a new evaluation session and clear logs?');
    if (!ok) return;
    clearEvaluationLogs();
    resetEvaluationSession();
    handleRefresh();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    const onUpdated = () => handleRefresh();
    window.addEventListener('evaluationLogsUpdated', onUpdated);
    handleRefresh();
    return () => window.removeEventListener('evaluationLogsUpdated', onUpdated);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="evaluation-logs-modal-overlay">
      <div className="evaluation-logs-modal">
        <div className="modal-header">
          <h2>Evaluation Logs</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="evaluation-logs-actions">
          <button className="secondary-btn" onClick={handleRefresh}>Refresh</button>
          <button className="secondary-btn" onClick={handleNewSession}>New Session</button>
          <button className="secondary-btn" onClick={handleCopy}>Copy</button>
          <button className="secondary-btn" onClick={handleDownload}>Download</button>
          <button className="danger-btn" onClick={handleClear}>Clear</button>
        </div>

        <div className="evaluation-logs-body">
          <div className="evaluation-logs-meta">
            <div><strong>Session:</strong> <span className="mono">{sessionId}</span></div>
            <div><strong>Entries:</strong> {logs.length}</div>
          </div>

          <pre className="evaluation-logs-pre">{JSON.stringify(logs.slice(-200), null, 2)}</pre>
          <div className="evaluation-logs-hint">Showing last 200 entries.</div>
        </div>
      </div>
    </div>
  );
}
