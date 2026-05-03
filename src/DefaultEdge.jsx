import React from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from 'reactflow';
import './ChoiceEdge.css';
import {
  bendCubicPath,
  clamp,
  cubicDerivative,
  cubicPoint,
  edgeSign,
  parseCubicPath,
} from './edgeGeometry.js';
import { useEdgeDragHandlers } from './useEdgeDragHandlers.js';

export default function DefaultEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style,
  markerEnd,
  selected,
  data,
}) {
  const offset = Number.isFinite(data?.offset) ? data.offset : 0;
  const labelT = Number.isFinite(data?.labelT) ? data.labelT : 0.5;
  const labelDx = Number.isFinite(data?.labelDx) ? data.labelDx : 0;
  const labelDy = Number.isFinite(data?.labelDy) ? data.labelDy : 0;
  const bendDx = Number.isFinite(data?.bendDx) ? data.bendDx : 0;
  const bendDy = Number.isFinite(data?.bendDy) ? data.bendDy : 0;

  const { dragging, bendDragging, labelHandlers, bendHandlers } = useEdgeDragHandlers({
    id,
    labelDx,
    labelDy,
    bendDx,
    bendDy,
  });

  const [basePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const edgePath = bendCubicPath(basePath, bendDx, bendDy);
  const text = typeof label === 'string' ? label : '';
  const isBackJump = Boolean(data?.isBackJump);
  const points = parseCubicPath(edgePath);

  if (!points) {
    return <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />;
  }

  const [p0, p1, p2, p3] = points;
  const bendPt = cubicPoint(p0, p1, p2, p3, 0.5);
  const t = clamp(labelT, 0.2, 0.8);
  const pt = cubicPoint(p0, p1, p2, p3, t);
  const dt = cubicDerivative(p0, p1, p2, p3, t);
  const dLen = Math.hypot(dt.x, dt.y) || 1;
  const nx = -dt.y / dLen;
  const ny = dt.x / dLen;
  const baseNudge = 10;
  const baseLabelX = pt.x + nx * baseNudge * edgeSign(id, offset);
  const baseLabelY = pt.y + ny * baseNudge * edgeSign(id, offset);
  const pStart = cubicPoint(p0, p1, p2, p3, 0.12);
  const pEnd = cubicPoint(p0, p1, p2, p3, 0.88);
  const dEnd = cubicDerivative(p0, p1, p2, p3, 0.88);
  const endAngle = Math.atan2(dEnd.y, dEnd.x) * (180 / Math.PI);
  const stroke = (style && typeof style === 'object' && typeof style.stroke === 'string') ? style.stroke : '#555';
  const labelX = baseLabelX + labelDx;
  const labelY = baseLabelY + labelDy;
  const leaderAngle = Math.atan2(labelY - pt.y, labelX - pt.x) * (180 / Math.PI);
  const leaderLen = Math.hypot(labelX - pt.x, labelY - pt.y);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="choice-edge-entry"
            style={{
              transform: `translate(-50%, -50%) translate(${pStart.x}px,${pStart.y}px)`,
              background: isBackJump ? '#7c3aed' : '#1f2937',
            }}
          />
          <div
            className="choice-edge-exit"
            style={{
              transform: `translate(-50%, -50%) translate(${pEnd.x}px,${pEnd.y}px) rotate(${endAngle}deg)`,
              borderLeftColor: stroke,
            }}
          />
          <div
            className="choice-edge-leader"
            style={{
              transform: `translate(${pt.x}px,${pt.y}px) rotate(${leaderAngle}deg)`,
              width: `${Math.max(6, leaderLen)}px`,
            }}
          />
          <div
            className="choice-edge-label-pin"
            style={{
              transform: `translate(-50%, -50%) translate(${pt.x}px,${pt.y}px)`,
            }}
          />
          <div
            className={`${isBackJump ? 'choice-edge-label choice-edge-label-backjump' : 'choice-edge-label'} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              boxShadow: dragging ? '0 2px 6px rgba(0,0,0,0.25)' : undefined,
            }}
            {...labelHandlers}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
      {(selected || bendDragging) ? (
        <EdgeLabelRenderer>
          <div
            className="edge-bend-handle nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${bendPt.x}px,${bendPt.y}px)`,
              boxShadow: bendDragging ? '0 2px 10px rgba(83, 91, 242, 0.45)' : undefined,
            }}
            {...bendHandlers}
            role="button"
            tabIndex={0}
          />
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
