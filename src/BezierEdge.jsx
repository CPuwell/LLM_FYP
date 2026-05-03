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

export default function BezierEdge({
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
  const curvature = Number.isFinite(data?.curvature) ? data.curvature : 0.25;
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
    curvature,
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
  const t = clamp(isBackJump ? 0.33 : labelT, 0.2, 0.8);
  const pt = cubicPoint(p0, p1, p2, p3, t);
  const dt = cubicDerivative(p0, p1, p2, p3, t);
  const dLen = Math.hypot(dt.x, dt.y) || 1;
  const nx = -dt.y / dLen;
  const ny = dt.x / dLen;
  const labelDist = Math.min(70, Math.max(12, Math.abs(offset) * 0.25));
  const labelX = pt.x + nx * labelDist * edgeSign(id, offset);
  const labelY = pt.y + ny * labelDist * edgeSign(id, offset);
  const pStart = cubicPoint(p0, p1, p2, p3, 0.12);
  const pEnd = cubicPoint(p0, p1, p2, p3, 0.88);
  const dEnd = cubicDerivative(p0, p1, p2, p3, 0.88);
  const endAngle = Math.atan2(dEnd.y, dEnd.x) * (180 / Math.PI);
  const arrowColor = isBackJump ? '#7c3aed' : '#555';
  const entryColor = isBackJump ? '#7c3aed' : '#1f2937';

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="choice-edge-entry"
          style={{
            transform: `translate(-50%, -50%) translate(${pStart.x}px,${pStart.y}px)`,
            background: entryColor,
          }}
        />
        <div
          className="choice-edge-exit"
          style={{
            transform: `translate(-50%, -50%) translate(${pEnd.x}px,${pEnd.y}px) rotate(${endAngle}deg)`,
            borderLeftColor: arrowColor,
          }}
        />
      </EdgeLabelRenderer>
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="choice-edge-leader"
            style={{
              transform: `translate(${pt.x}px,${pt.y}px) rotate(${Math.atan2((labelY + labelDy) - pt.y, (labelX + labelDx) - pt.x) * (180 / Math.PI)}deg)`,
              width: `${Math.max(6, Math.hypot((labelX + labelDx) - pt.x, (labelY + labelDy) - pt.y))}px`,
            }}
          />
          <div
            className={`${isBackJump ? 'choice-edge-label choice-edge-label-backjump' : 'choice-edge-label'} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + labelDx}px,${labelY + labelDy}px)`,
              boxShadow: dragging ? '0 2px 6px rgba(0,0,0,0.25)' : undefined,
            }}
            {...labelHandlers}
          >
            {text}
          </div>
          <div
            className="choice-edge-label-pin"
            style={{
              transform: `translate(-50%, -50%) translate(${pt.x}px,${pt.y}px)`,
            }}
          />
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
