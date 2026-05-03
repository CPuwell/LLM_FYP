import { useCallback, useContext, useRef, useState } from 'react';
import { useStore } from 'reactflow';
import { EdgeLabelDragContext } from './EdgeLabelDragContext.js';

export const useEdgeDragHandlers = ({ id, labelDx, labelDy, bendDx, bendDy }) => {
  const ctx = useContext(EdgeLabelDragContext);
  const setEdges = ctx?.setEdges;
  const zoom = useStore((s) => s.transform[2]);
  const labelDragRef = useRef(null);
  const bendDragRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [bendDragging, setBendDragging] = useState(false);

  const beginDrag = useCallback((e, ref, setActive, dx, dy) => {
    e.preventDefault();
    e.stopPropagation();
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    ref.current = { x: e.clientX, y: e.clientY, dx, dy, z, pid: e.pointerId };
    setActive(true);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Some synthetic/event targets cannot capture pointers.
    }
  }, [zoom]);

  const moveDrag = useCallback((e, ref, xKey, yKey) => {
    const d = ref.current;
    if (!d || !setEdges) return;
    e.preventDefault();
    e.stopPropagation();
    const nextDx = d.dx + (e.clientX - d.x) / d.z;
    const nextDy = d.dy + (e.clientY - d.y) / d.z;
    setEdges((eds) => eds.map((edge) => (
      edge.id === id
        ? { ...edge, data: { ...(edge.data && typeof edge.data === 'object' ? edge.data : {}), [xKey]: nextDx, [yKey]: nextDy } }
        : edge
    )));
  }, [id, setEdges]);

  const endDrag = useCallback((e, ref, setActive) => {
    const d = ref.current;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    ref.current = null;
    setActive(false);
    try {
      e.currentTarget.releasePointerCapture(d.pid);
    } catch {
      // Matching the guarded capture call above.
    }
  }, []);

  return {
    dragging,
    bendDragging,
    labelHandlers: {
      onPointerDown: (e) => beginDrag(e, labelDragRef, setDragging, labelDx, labelDy),
      onPointerMove: (e) => moveDrag(e, labelDragRef, 'labelDx', 'labelDy'),
      onPointerUp: (e) => endDrag(e, labelDragRef, setDragging),
      onPointerCancel: (e) => endDrag(e, labelDragRef, setDragging),
    },
    bendHandlers: {
      onPointerDown: (e) => beginDrag(e, bendDragRef, setBendDragging, bendDx, bendDy),
      onPointerMove: (e) => moveDrag(e, bendDragRef, 'bendDx', 'bendDy'),
      onPointerUp: (e) => endDrag(e, bendDragRef, setBendDragging),
      onPointerCancel: (e) => endDrag(e, bendDragRef, setBendDragging),
    },
  };
};
