import React, { useEffect, useState } from 'react';
import './ApiKeyModal.css';
import { buildGeminiKeyHeader, clearUserGeminiApiKey, getUserGeminiApiKey, setUserGeminiApiKey } from './userApiKey.js';

export default function ApiKeyModal({ isOpen, onClose }) {
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState('');
  const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');

  useEffect(() => {
    if (!isOpen) return;
    setValue(getUserGeminiApiKey());
    setShow(false);
    setIsTesting(false);
    setTestResult('');
  }, [isOpen]);

  const handleSave = () => {
    setUserGeminiApiKey(value);
    setTestResult('Saved.');
  };

  const handleClear = () => {
    clearUserGeminiApiKey();
    setValue('');
    setTestResult('Cleared.');
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult('');
    try {
      const k = value.trim();
      const headers = k ? { 'X-Gemini-Api-Key': k } : buildGeminiKeyHeader();
      const r = await fetch(`${apiBaseUrl}/api/debug-generate?model=gemini-2.5-flash`, { headers });
      const data = await r.json().catch(() => ({}));
      if (!data?.ok) {
        setTestResult(data?.error?.message || data?.error || data?.details || 'Test failed.');
        return;
      }
      setTestResult(`OK (model=${data?.model || 'unknown'}, ms=${data?.ms || ''})`);
    } catch (e) {
      setTestResult(e?.message || 'Test failed.');
    } finally {
      setIsTesting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="api-key-modal-overlay">
      <div className="api-key-modal">
        <div className="modal-header">
          <h2>API Key</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="api-key-modal-body">
          <label className="api-key-label">
            Gemini API Key (stored in your browser)
            <input
              type={show ? 'text' : 'password'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="AIza..."
              autoComplete="off"
            />
          </label>
          <label className="api-key-inline">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show key
          </label>
          <div className="api-key-actions">
            <button onClick={handleSave} disabled={!value.trim()}>Save</button>
            <button onClick={handleClear} disabled={!getUserGeminiApiKey() && !value.trim()}>Clear</button>
            <button onClick={handleTest} disabled={isTesting || !value.trim()}>Test</button>
          </div>
          {testResult ? <div className="api-key-result">{testResult}</div> : null}
        </div>
      </div>
    </div>
  );
}
