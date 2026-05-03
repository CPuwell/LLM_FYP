// src/CustomNode.jsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import './CustomNode.css'; // We'll create this file next
import { getDisplayImageUrl } from './imageUtils.js';

// `memo` is a performance optimization for React components
function CustomNode({ data }) {
  return (
    <div className="custom-node">
      <Handle id="tT" type="target" position={Position.Top} className="custom-handle custom-handle-target" style={{ top: -6 }} />
      <Handle id="sB" type="source" position={Position.Bottom} className="custom-handle custom-handle-source" style={{ bottom: -6 }} />
      <Handle id="sL" type="source" position={Position.Left} className="custom-handle custom-handle-source" style={{ top: '55%', left: -6 }} />
      <Handle id="tR" type="target" position={Position.Right} className="custom-handle custom-handle-target" style={{ top: '55%', right: -6 }} />

      <div className="node-content">
        <div className="node-title">{data.label}</div>
        <div className="node-image-container">
          {data.imageUrl ? (
            <img src={getDisplayImageUrl(data.imageUrl)} alt={data.label} className="node-image" />
          ) : (
            <div className="node-image-placeholder">No Image</div>
          )}
        </div>
      </div>

    </div>
  );
}

export default memo(CustomNode);
