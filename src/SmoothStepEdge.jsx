import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useStore } from 'reactflow';
import './ChoiceEdge.css';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const getTangent = (pos) => {
  if (pos === 'top') return { x: 0, y: -1 };
  if (pos === 'bottom') return { x: 0, y: 1 };
  if (pos === 'left') return { x: -1, y: 0 };
  if (pos === 'right') return { x: 1, y: 0 };
  return { x: 0, y: 1 };
};

const getBendCubicPath = ({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, bendX, bendY }) => {
  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const len = Math.hypot(dx, dy) || 1;
  const vx = dx / len;
  const vy = dy / len;
  const ts = getTangent(sourcePosition);
  const tt = getTangent(targetPosition);
  const tangentLen = clamp(len * 0.26, 40, 140);
  const midLen = tangentLen * 0.7;

  const p0 = { x: sourceX, y: sourceY };
  const m0 = { x: bendX, y: bendY };
  const p3 = { x: targetX, y: targetY };

  const a1 = { x: p0.x + ts.x * tangentLen, y: p0.y + ts.y * tangentLen };
  const a2 = { x: m0.x - vx * midLen, y: m0.y - vy * midLen };
  const b1 = { x: m0.x + vx * midLen, y: m0.y + vy * midLen };
  const b2 = { x: p3.x - tt.x * tangentLen, y: p3.y - tt.y * tangentLen };

  return `M ${p0.x},${p0.y} C ${a1.x},${a1.y} ${a2.x},${a2.y} ${m0.x},${m0.y} C ${b1.x},${b1.y} ${b2.x},${b2.y} ${p3.x},${p3.y}`;
};

export default function SmoothStepEdge({
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
  const ctx = useContext(EdgeLabelDragContext);
  const setEdges = ctx?.setEdges;
  const zoom = useStore((s) => s.transform[2]);
  const dragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const bendDragRef = useRef(null);
  const [bendDragging, setBendDragging] = useState(false);

  const offset = Number.isFinite(data?.offset) ? data.offset : 0;
  const labelT = Number.isFinite(data?.labelT) ? data.labelT : 0.5;
  const labelDx = Number.isFinite(data?.labelDx) ? data.labelDx : 0;
  const labelDy = Number.isFinite(data?.labelDy) ? data.labelDy : 0;
  const bendDx = Number.isFinite(data?.bendDx) ? data.bendDx : 0;
  const bendDy = Number.isFinite(data?.bendDy) ? data.bendDy : 0;
  const bendBaseX = (sourceX + targetX) / 2;
  const bendBaseY = (sourceY + targetY) / 2;
  const bendX = bendBaseX + bendDx;
  const bendY = bendBaseY + bendDy;

  const hasBend = Math.abs(bendDx) > 0.01 || Math.abs(bendDy) > 0.01;
  const [smoothPath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    offset,
    borderRadius: 14,
  });
  const edgePath = hasBend
    ? getBendCubicPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, bendX, bendY })
    : smoothPath;

  const pathRef = useRef(null);
  const [layout, setLayout] = useState(null);

  const labelColorClass = data?.isBackJump ? 'choice-edge-label choice-edge-label-backjump' : 'choice-edge-label';
  const sign = offset !== 0 ? Math.sign(offset) : ((`${id}`.charCodeAt(0) || 0) % 2 === 0 ? 1 : -1);
  const labelDist = useMemo(() => {
    const mag = Math.min(80, Math.max(12, Math.abs(offset) * 0.35));
    return mag;
  }, [offset]);

  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el) return;
    try {
      const total = el.getTotalLength();
      const startAt = Math.max(0, Math.min(total, total * 0.12));
      const endAt = Math.max(0, Math.min(total, total * 0.88));

      const sp = el.getPointAtLength(startAt);
      const sp2 = el.getPointAtLength(Math.min(total, startAt + 1));
      const svx = sp2.x - sp.x;
      const svy = sp2.y - sp.y;
      const sAngle = Math.atan2(svy, svx) * (180 / Math.PI);

      const ep = el.getPointAtLength(endAt);
      const ep2 = el.getPointAtLength(Math.min(total, endAt + 1));
      const evx = ep2.x - ep.x;
      const evy = ep2.y - ep.y;
      const eAngle = Math.atan2(evy, evx) * (180 / Math.PI);

      const atRatio = data?.isBackJump ? 0.33 : (0.35 + 0.45 * labelT);
      const at = Math.max(0, Math.min(total, total * atRatio));
      const p = el.getPointAtLength(at);
      const p2 = el.getPointAtLength(Math.min(total, at + 1));
      const vx = p2.x - p.x;
      const vy = p2.y - p.y;
      const vlen = Math.hypot(vx, vy) || 1;
      const nx = -vy / vlen;
      const ny = vx / vlen;

      const anchorX = p.x;
      const anchorY = p.y;
      const labelX = p.x + nx * labelDist * sign;
      const labelY = p.y + ny * labelDist * sign;

      const dx = labelX - anchorX;
      const dy = labelY - anchorY;
      const leaderLen = Math.hypot(dx, dy);
      const leaderAngle = Math.atan2(dy, dx) * (180 / Math.PI);

      setLayout({
        labelX,
        labelY,
        anchorX,
        anchorY,
        leaderLen,
        leaderAngle,
        startX: sp.x,
        startY: sp.y,
        startAngle: sAngle,
        endX: ep.x,
        endY: ep.y,
        endAngle: eAngle,
      });
    } catch (e) {
      setLayout(null);
    }
  }, [edgePath, labelT, labelDist, sign]);

  const text = typeof label === 'string' ? label : '';
  const arrowColor = data?.isBackJump ? '#7c3aed' : '#555';
  const entryColor = data?.isBackJump ? '#7c3aed' : '#1f2937';
  const bundleCount = Number.isFinite(data?.bundleCount) ? data.bundleCount : 1;
  const bundleIndex = Number.isFinite(data?.bundleIndex) ? data.bundleIndex : 0;
  const showRouteMarks = Boolean(selected) || bundleCount <= 1 || bundleIndex === 0;

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

  const onBendPointerDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    bendDragRef.current = { x: e.clientX, y: e.clientY, dx: bendDx, dy: bendDy, z, pid: e.pointerId };
    setBendDragging(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch (err) {
    }
  }, [zoom, bendDx, bendDy]);

  const onBendPointerMove = useCallback((e) => {
    const d = bendDragRef.current;
    if (!d) return;
    if (!setEdges) return;
    e.preventDefault();
    e.stopPropagation();
    const nextDx = d.dx + (e.clientX - d.x) / d.z;
    const nextDy = d.dy + (e.clientY - d.y) / d.z;
    setEdges((eds) => eds.map((edge) => (
      edge.id === id
        ? { ...edge, data: { ...(edge.data && typeof edge.data === 'object' ? edge.data : {}), bendDx: nextDx, bendDy: nextDy } }
        : edge
    )));
  }, [id, setEdges]);

  const onBendPointerUp = useCallback((e) => {
    const d = bendDragRef.current;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    bendDragRef.current = null;
    setBendDragging(false);
    try {
      e.currentTarget.releasePointerCapture(d.pid);
    } catch (err) {
    }
  }, []);

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <path ref={pathRef} d={edgePath} fill="none" stroke="transparent" strokeWidth="1" />
      {text ? (
        <EdgeLabelRenderer>
          {layout ? (
            <>
              {showRouteMarks ? (
                <>
                  <div
                    className="choice-edge-entry"
                    style={{
                      transform: `translate(-50%, -50%) translate(${layout.startX}px,${layout.startY}px)`,
                      background: entryColor,
                    }}
                  />
                  <div
                    className="choice-edge-exit"
                    style={{
                      transform: `translate(-50%, -50%) translate(${layout.endX}px,${layout.endY}px) rotate(${layout.endAngle}deg)`,
                      borderLeftColor: arrowColor,
                    }}
                  />
                </>
              ) : null}
              <div
                className="choice-edge-leader"
                style={{
                  transform: `translate(${layout.anchorX}px,${layout.anchorY}px) rotate(${Math.atan2((layout.labelY + labelDy) - layout.anchorY, (layout.labelX + labelDx) - layout.anchorX) * (180 / Math.PI)}deg)`,
                  width: `${Math.max(6, Math.hypot((layout.labelX + labelDx) - layout.anchorX, (layout.labelY + labelDy) - layout.anchorY))}px`,
                }}
              />
              <div
                className="choice-edge-label-pin"
                style={{
                  transform: `translate(-50%, -50%) translate(${layout.anchorX}px,${layout.anchorY}px)`,
                }}
              />
              <div
                className={`${labelColorClass} nodrag nopan`}
                style={{
                  transform: `translate(-50%, -50%) translate(${layout.labelX + labelDx}px,${layout.labelY + labelDy}px)`,
                  boxShadow: dragging ? '0 2px 6px rgba(0,0,0,0.25)' : undefined,
                }}
                onPointerDown={onLabelPointerDown}
                onPointerMove={onLabelPointerMove}
                onPointerUp={onLabelPointerUp}
                onPointerCancel={onLabelPointerUp}
              >
                {text}
              </div>
              {(selected || bendDragging) ? (
                <div
                  className="edge-bend-handle nodrag nopan"
                  style={{
                    transform: `translate(-50%, -50%) translate(${bendX}px,${bendY}px)`,
                    boxShadow: bendDragging ? '0 2px 10px rgba(83, 91, 242, 0.45)' : undefined,
                  }}
                  onPointerDown={onBendPointerDown}
                  onPointerMove={onBendPointerMove}
                  onPointerUp={onBendPointerUp}
                  onPointerCancel={onBendPointerUp}
                  role="button"
                  tabIndex={0}
                />
              ) : null}
            </>
          ) : (
            <>
              <div
                className={`${labelColorClass} nodrag nopan`}
                style={{
                  transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px,${(sourceY + targetY) / 2}px)`,
                }}
              >
                {text}
              </div>
              {(selected || bendDragging) ? (
                <div
                  className="edge-bend-handle nodrag nopan"
                  style={{
                    transform: `translate(-50%, -50%) translate(${bendX}px,${bendY}px)`,
                    boxShadow: bendDragging ? '0 2px 10px rgba(83, 91, 242, 0.45)' : undefined,
                  }}
                  onPointerDown={onBendPointerDown}
                  onPointerMove={onBendPointerMove}
                  onPointerUp={onBendPointerUp}
                  onPointerCancel={onBendPointerUp}
                  role="button"
                  tabIndex={0}
                />
              ) : null}
            </>
          )}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
