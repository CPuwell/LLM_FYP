import React, { useCallback, useContext, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useStore } from 'reactflow';
import './ChoiceEdge.css';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const cubicPoint = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
};

const cubicDerivative = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return {
    x: 3 * u * u * (p1.x - p0.x) + 6 * u * t * (p2.x - p1.x) + 3 * t * t * (p3.x - p2.x),
    y: 3 * u * u * (p1.y - p0.y) + 6 * u * t * (p2.y - p1.y) + 3 * t * t * (p3.y - p2.y),
  };
};

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
  data,
}) {
  const ctx = useContext(EdgeLabelDragContext);
  const setEdges = ctx?.setEdges;
  const zoom = useStore((s) => s.transform[2]);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  const offset = Number.isFinite(data?.offset) ? data.offset : 0;
  const labelT = Number.isFinite(data?.labelT) ? data.labelT : 0.5;
  const labelDx = Number.isFinite(data?.labelDx) ? data.labelDx : 0;
  const labelDy = Number.isFinite(data?.labelDy) ? data.labelDy : 0;

  const [edgePath] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.25,
  });

  const text = typeof label === 'string' ? label : '';
  const isBackJump = Boolean(data?.isBackJump);

  const parse = /^M\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*C\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*(-?\d+\.?\d*),\s*(-?\d+\.?\d*)\s*$/.exec(edgePath);
  if (!parse) {
    return <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />;
  }

  const nums = parse.slice(1).map((n) => Number(n));
  const p0 = { x: nums[0], y: nums[1] };
  const p1 = { x: nums[2], y: nums[3] };
  const p2 = { x: nums[4], y: nums[5] };
  const p3 = { x: nums[6], y: nums[7] };

  const t = clamp(labelT, 0.2, 0.8);
  const pt = cubicPoint(p0, p1, p2, p3, t);
  const dt = cubicDerivative(p0, p1, p2, p3, t);
  const dLen = Math.hypot(dt.x, dt.y) || 1;
  const nx = -dt.y / dLen;
  const ny = dt.x / dLen;

  const sign = offset !== 0 ? Math.sign(offset) : ((`${id}`.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1);
  const baseNudge = 10;
  const baseLabelX = pt.x + nx * baseNudge * sign;
  const baseLabelY = pt.y + ny * baseNudge * sign;

  const startT = 0.12;
  const endT = 0.88;
  const pStart = cubicPoint(p0, p1, p2, p3, startT);
  const pEnd = cubicPoint(p0, p1, p2, p3, endT);
  const dEnd = cubicDerivative(p0, p1, p2, p3, endT);
  const endAngle = Math.atan2(dEnd.y, dEnd.x) * (180 / Math.PI);

  const stroke = (style && typeof style === 'object' && typeof style.stroke === 'string') ? style.stroke : '#555';
  const arrowColor = stroke;
  const entryColor = isBackJump ? '#7c3aed' : '#1f2937';

  const onLabelPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    dragRef.current = { x: e.clientX, y: e.clientY, dx: labelDx, dy: labelDy, z, pid: e.pointerId };
    setDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
    }
  }, [zoom, labelDx, labelDy]);

  const onLabelPointerMove = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    if (!setEdges) return;
    e.preventDefault();
    e.stopPropagation();
    const nextDx = d.dx + (e.clientX - d.x) / d.z;
    const nextDy = d.dy + (e.clientY - d.y) / d.z;
    setEdges((eds) => eds.map((edge) => (
      edge.id === id
        ? { ...edge, data: { ...(edge.data && typeof edge.data === 'object' ? edge.data : {}), labelDx: nextDx, labelDy: nextDy } }
        : edge
    )));
  }, [id, setEdges]);

  const onLabelPointerUp = useCallback((e) => {
    const d = dragRef.current;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = null;
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(d.pid);
    } catch (err) {
    }
  }, []);

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
            onPointerDown={onLabelPointerDown}
            onPointerMove={onLabelPointerMove}
            onPointerUp={onLabelPointerUp}
            onPointerCancel={onLabelPointerUp}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

