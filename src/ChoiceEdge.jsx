import React from 'react';
import { BaseEdge, EdgeLabelRenderer } from 'reactflow';
import './ChoiceEdge.css';
import { clamp, cubicDerivative, cubicPoint, edgeSign, getTangent } from './edgeGeometry.js';
import { useEdgeDragHandlers } from './useEdgeDragHandlers.js';

const getOffsetCubicPath = ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, id, labelT, bendDx, bendDy }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const t = Number.isFinite(labelT) ? labelT : 0.5;
  const sign = edgeSign(id, offset);
  const scaledOffset = sign * clamp(Math.abs(offset) * 0.22, 0, 70);

  const nx = -dy / len;
  const ny = dx / len;

  const ts = getTangent(sourcePosition);
  const tt = getTangent(targetPosition);

  const tangentLen = clamp(len * 0.26, 40, 140) + Math.min(Math.abs(scaledOffset) * 0.18, 16);
  const midLen = tangentLen * 0.7;

  const vx = dx / len;
  const vy = dy / len;

  const bx = Number.isFinite(bendDx) ? bendDx : 0;
  const by = Number.isFinite(bendDy) ? bendDy : 0;
  const mx = sourceX + dx * 0.5 + nx * scaledOffset + bx;
  const my = sourceY + dy * 0.5 + ny * scaledOffset + by;

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

const getSelfLoopPath = ({ x, y, loopIndex, loopCount, bendDx, bendDy }) => {
  const base = 70;
  const spread = 28;
  const k = loopCount > 1 ? (loopIndex - (loopCount - 1) / 2) : 0;
  const r = base + Math.abs(k) * spread;
  const dir = k >= 0 ? 1 : -1;

  const bx = Number.isFinite(bendDx) ? bendDx : 0;
  const by = Number.isFinite(bendDy) ? bendDy : 0;

  const sx = x;
  const sy = y;
  const c1x = x + dir * r + bx;
  const c1y = y - r + by;
  const c2x = x - dir * r + bx;
  const c2y = y - r + by;
  const tx = x;
  const ty = y;

  const path = `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
  const labelX = x + dir * (r * 0.6) + bx;
  const labelY = y - r + by;

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
  selected,
  data,
}) {
  const offset = Number.isFinite(data?.offset) ? data.offset : 0;
  const labelT = Number.isFinite(data?.labelT) ? data.labelT : 0.5;
  const labelDx = Number.isFinite(data?.labelDx) ? data.labelDx : 0;
  const labelDy = Number.isFinite(data?.labelDy) ? data.labelDy : 0;
  const bendDx = Number.isFinite(data?.bendDx) ? data.bendDx : 0;
  const bendDy = Number.isFinite(data?.bendDy) ? data.bendDy : 0;
  const isSelfLoop = Boolean(data?.isSelfLoop) || (sourceX === targetX && sourceY === targetY);
  const loopIndex = Number.isFinite(data?.loopIndex) ? data.loopIndex : 0;
  const loopCount = Number.isFinite(data?.loopCount) ? data.loopCount : 1;
  const { dragging, bendDragging, labelHandlers, bendHandlers } = useEdgeDragHandlers({
    id,
    labelDx,
    labelDy,
    bendDx,
    bendDy,
  });

  const bendBase = (() => {
    if (isSelfLoop) {
      const base = 70;
      const spread = 28;
      const k = loopCount > 1 ? (loopIndex - (loopCount - 1) / 2) : 0;
      const r = base + Math.abs(k) * spread;
      const dir = k >= 0 ? 1 : -1;
      return { x: sourceX + dir * (r * 0.6), y: sourceY - r };
    }
    const dx = targetX - sourceX;
    const dy = targetY - sourceY;
    const len = Math.hypot(dx, dy) || 1;
    const sign = edgeSign(id, offset);
    const scaledOffset = sign * clamp(Math.abs(offset) * 0.22, 0, 70);
    const nx = -dy / len;
    const ny = dx / len;
    return { x: sourceX + dx * 0.5 + nx * scaledOffset, y: sourceY + dy * 0.5 + ny * scaledOffset };
  })();

  const bendX = bendBase.x + bendDx;
  const bendY = bendBase.y + bendDy;

  const [edgePath, labelX, labelY, arrowX, arrowY, arrowAngle, labelAnchorX, labelAnchorY, startX, startY, endX, endY, endAngle] = isSelfLoop
    ? getSelfLoopPath({ x: sourceX, y: sourceY, loopIndex, loopCount, bendDx, bendDy })
    : getOffsetCubicPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, offset, id, labelT, bendDx, bendDy });

  const text = typeof label === 'string' ? label : '';
  const arrowColor = data?.isBackJump ? '#7c3aed' : '#555';
  const entryColor = data?.isBackJump ? '#7c3aed' : '#1f2937';

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
        {(selected || bendDragging) ? (
          <div
            className="edge-bend-handle nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${bendX}px,${bendY}px)`,
              boxShadow: bendDragging ? '0 2px 10px rgba(83, 91, 242, 0.45)' : undefined,
            }}
            {...bendHandlers}
            role="button"
            tabIndex={0}
          />
        ) : null}
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
            {...labelHandlers}
          >
            {text}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
