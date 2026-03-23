import React, { useCallback, useContext, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, Position, useStore } from 'reactflow';
import './ChoiceEdge.css';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';

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

const getTangent = (pos) => {
  if (pos === Position.Top || pos === 'top') return { x: 0, y: -1 };
  if (pos === Position.Bottom || pos === 'bottom') return { x: 0, y: 1 };
  if (pos === Position.Left || pos === 'left') return { x: -1, y: 0 };
  if (pos === Position.Right || pos === 'right') return { x: 1, y: 0 };
  return { x: 0, y: 1 };
};

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const getOffsetCubicPath = ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, id, labelT }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const t = Number.isFinite(labelT) ? labelT : 0.5;
  const sign = offset !== 0 ? Math.sign(offset) : ((`${id}`.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1);
  const scaledOffset = sign * clamp(Math.abs(offset) * 0.22, 0, 70);

  const nx = -dy / len;
  const ny = dx / len;

  const ts = getTangent(sourcePosition);
  const tt = getTangent(targetPosition);

  const tangentLen = clamp(len * 0.26, 40, 140) + Math.min(Math.abs(scaledOffset) * 0.18, 16);
  const midLen = tangentLen * 0.7;

  const vx = dx / len;
  const vy = dy / len;

  const mx = sourceX + dx * 0.5 + nx * scaledOffset;
  const my = sourceY + dy * 0.5 + ny * scaledOffset;

  const p0 = { x: sourceX, y: sourceY };
  const m0 = { x: mx, y: my };
  const p3 = { x: targetX, y: targetY };

  const a1 = { x: p0.x + ts.x * tangentLen, y: p0.y + ts.y * tangentLen };
  const a2 = { x: m0.x - vx * midLen, y: m0.y - vy * midLen };

  const b1 = { x: m0.x + vx * midLen, y: m0.y + vy * midLen };
  const b2 = { x: p3.x - tt.x * tangentLen, y: p3.y - tt.y * tangentLen };

  const path = `M ${p0.x},${p0.y} C ${a1.x},${a1.y} ${a2.x},${a2.y} ${m0.x},${m0.y} C ${b1.x},${b1.y} ${b2.x},${b2.y} ${p3.x},${p3.y}`;

  const sampleOnPath = (globalT) => {
    const clamped = clamp(globalT, 0, 1);
    const seg = clamped < 0.5 ? 1 : 2;
    const localT = seg === 1 ? clamped / 0.5 : (clamped - 0.5) / 0.5;
    if (seg === 1) {
      const point = cubicPoint(p0, a1, a2, m0, localT);
      const deriv = cubicDerivative(p0, a1, a2, m0, localT);
      return { point, deriv };
    }
    const point = cubicPoint(m0, b1, b2, p3, localT);
    const deriv = cubicDerivative(m0, b1, b2, p3, localT);
    return { point, deriv };
  };

  const arrowSample = sampleOnPath(0.67);
  const arrowAngle = Math.atan2(arrowSample.deriv.y, arrowSample.deriv.x) * (180 / Math.PI);

  const startSample = sampleOnPath(0.12);
  const endSample = sampleOnPath(0.88);
  const endAngle = Math.atan2(endSample.deriv.y, endSample.deriv.x) * (180 / Math.PI);

  const labelSample = sampleOnPath(t);
  const dLen = Math.hypot(labelSample.deriv.x, labelSample.deriv.y) || 1;
  const lnx = -labelSample.deriv.y / dLen;
  const lny = labelSample.deriv.x / dLen;
  const labelSide = t < 0.5 ? 1 : -1;
  const labelX = labelSample.point.x + lnx * 12 * labelSide;
  const labelY = labelSample.point.y + lny * 12 * labelSide;

  return [
    path,
    labelX,
    labelY,
    arrowSample.point.x,
    arrowSample.point.y,
    arrowAngle,
    labelSample.point.x,
    labelSample.point.y,
    startSample.point.x,
    startSample.point.y,
    endSample.point.x,
    endSample.point.y,
    endAngle,
  ];
};

const getSelfLoopPath = ({ x, y, loopIndex, loopCount }) => {
  const base = 70;
  const spread = 28;
  const k = loopCount > 1 ? (loopIndex - (loopCount - 1) / 2) : 0;
  const r = base + Math.abs(k) * spread;
  const dir = k >= 0 ? 1 : -1;

  const sx = x;
  const sy = y;
  const c1x = x + dir * r;
  const c1y = y - r;
  const c2x = x - dir * r;
  const c2y = y - r;
  const tx = x;
  const ty = y;

  const path = `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
  const labelX = x + dir * (r * 0.6);
  const labelY = y - r;

  const p0 = { x: sx, y: sy };
  const p1 = { x: c1x, y: c1y };
  const p2 = { x: c2x, y: c2y };
  const p3 = { x: tx, y: ty };

  const sampleOnLoop = (tt) => {
    const point = cubicPoint(p0, p1, p2, p3, tt);
    const deriv = cubicDerivative(p0, p1, p2, p3, tt);
    return { point, deriv };
  };

  const arrowSample = sampleOnLoop(0.5);
  const arrowAngle = Math.atan2(arrowSample.deriv.y, arrowSample.deriv.x) * (180 / Math.PI);
  const startSample = sampleOnLoop(0.18);
  const endSample = sampleOnLoop(0.82);
  const endAngle = Math.atan2(endSample.deriv.y, endSample.deriv.x) * (180 / Math.PI);

  return [
    path,
    labelX,
    labelY,
    arrowSample.point.x,
    arrowSample.point.y,
    arrowAngle,
    arrowSample.point.x,
    arrowSample.point.y,
    startSample.point.x,
    startSample.point.y,
    endSample.point.x,
    endSample.point.y,
    endAngle,
  ];
};

export default function ChoiceEdge({
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
  const isSelfLoop = Boolean(data?.isSelfLoop) || (sourceX === targetX && sourceY === targetY);
  const loopIndex = Number.isFinite(data?.loopIndex) ? data.loopIndex : 0;
  const loopCount = Number.isFinite(data?.loopCount) ? data.loopCount : 1;

  const [edgePath, labelX, labelY, arrowX, arrowY, arrowAngle, labelAnchorX, labelAnchorY, startX, startY, endX, endY, endAngle] = isSelfLoop
    ? getSelfLoopPath({ x: sourceX, y: sourceY, loopIndex, loopCount })
    : getOffsetCubicPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, id, labelT });

  const text = typeof label === 'string' ? label : '';
  const arrowColor = data?.isBackJump ? '#7c3aed' : '#555';
  const entryColor = data?.isBackJump ? '#7c3aed' : '#1f2937';

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

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="choice-edge-entry"
          style={{
            transform: `translate(-50%, -50%) translate(${startX}px,${startY}px)`,
            background: entryColor,
          }}
        />
        <div
          className="choice-edge-exit"
          style={{
            transform: `translate(-50%, -50%) translate(${endX}px,${endY}px) rotate(${endAngle}deg)`,
            borderLeftColor: arrowColor,
          }}
        />
        <div
          className="choice-edge-arrow"
          style={{
            transform: `translate(-50%, -50%) translate(${arrowX}px,${arrowY}px) rotate(${arrowAngle}deg)`,
            borderLeftColor: arrowColor,
          }}
        />
      </EdgeLabelRenderer>
      {text ? (
        <EdgeLabelRenderer>
          <div
            className="choice-edge-leader"
            style={{
              transform: `translate(${labelAnchorX}px,${labelAnchorY}px) rotate(${Math.atan2((labelY + labelDy) - labelAnchorY, (labelX + labelDx) - labelAnchorX) * (180 / Math.PI)}deg)`,
              width: `${Math.max(6, Math.hypot((labelX + labelDx) - labelAnchorX, (labelY + labelDy) - labelAnchorY))}px`,
            }}
          />
          <div
            className="choice-edge-label-pin"
            style={{
              transform: `translate(-50%, -50%) translate(${labelAnchorX}px,${labelAnchorY}px)`,
            }}
          />
          <div
            className={`${data?.isBackJump ? 'choice-edge-label choice-edge-label-backjump' : 'choice-edge-label'} nodrag nopan`}
            style={{
              transform: `translate(-50%, -50%) translate(${labelX + labelDx}px,${labelY + labelDy}px)`,
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
