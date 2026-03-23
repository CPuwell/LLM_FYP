import React, { useCallback, useContext, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, useStore } from 'reactflow';
import './ChoiceEdge.css';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';

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

  const offset = Number.isFinite(data?.offset) ? data.offset : 0;
  const labelT = Number.isFinite(data?.labelT) ? data.labelT : 0.5;
  const labelDx = Number.isFinite(data?.labelDx) ? data.labelDx : 0;
  const labelDy = Number.isFinite(data?.labelDy) ? data.labelDy : 0;
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    offset,
    borderRadius: 14,
  });

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
            </>
          ) : (
            <div
              className={`${labelColorClass} nodrag nopan`}
              style={{
                transform: `translate(-50%, -50%) translate(${(sourceX + targetX) / 2}px,${(sourceY + targetY) / 2}px)`,
              }}
            >
              {text}
            </div>
          )}
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}
