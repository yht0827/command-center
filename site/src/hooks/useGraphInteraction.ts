import { useCallback, useEffect, useRef, useState } from 'react';

interface UseGraphInteractionOptions {
  minZoom?: number;
  maxZoom?: number;
  /** CSS selector for elements that should not initiate pan */
  nodeSelector?: string;
  /** Dependency that triggers wheel listener re-registration */
  deps?: unknown[];
}

interface Transform {
  x: number;
  y: number;
  k: number;
}

export function useGraphInteraction(options: UseGraphInteractionOptions = {}) {
  const { minZoom = 0.1, maxZoom = 3, nodeSelector, deps = [] } = options;

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [transform, setTransform] = useState<Transform>({ x: 0, y: 0, k: 1 });
  const panRef = useRef<{ startX: number; startY: number; tx: number; ty: number } | null>(null);
  const dragOccurred = useRef(false);

  // Pan handlers
  const onMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (nodeSelector && (e.target as Element).closest(nodeSelector)) return;
      panRef.current = { startX: e.clientX, startY: e.clientY, tx: transform.x, ty: transform.y };
      dragOccurred.current = false;
    },
    [transform, nodeSelector],
  );

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // pan을 지역 변수로 캡쳐: setTransform updater가 나중에 실행될 때
    // panRef.current가 onMouseUp으로 null이 되어도 안전하게 값에 접근
    const pan = panRef.current;
    if (!pan) return;
    const dx = e.clientX - pan.startX;
    const dy = e.clientY - pan.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragOccurred.current = true;
    setTransform((t) => ({ ...t, x: pan.tx + dx, y: pan.ty + dy }));
  }, []);

  const onMouseUp = useCallback(() => {
    panRef.current = null;
  }, []);

  const svgHandlers = {
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave: onMouseUp,
  };

  // Whether the last mouseUp was preceded by a drag (for click-vs-pan detection)
  const wasDrag = useCallback(() => dragOccurred.current, []);

  // Native wheel + gesture events
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const delta = e.ctrlKey ? e.deltaY * 3 : e.deltaY;
      const factor = delta > 0 ? 0.97 : 1.03;
      setTransform((t) => {
        const newK = Math.max(minZoom, Math.min(maxZoom, t.k * factor));
        const scale = newK / t.k;
        return { x: mouseX - scale * (mouseX - t.x), y: mouseY - scale * (mouseY - t.y), k: newK };
      });
    };

    const onGestureStart = (e: Event) => e.preventDefault();
    const onGestureChange = (e: Event) => e.preventDefault();

    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('gesturestart', onGestureStart, { passive: false } as EventListenerOptions);
    el.addEventListener('gesturechange', onGestureChange, { passive: false } as EventListenerOptions);

    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('gesturestart', onGestureStart);
      el.removeEventListener('gesturechange', onGestureChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const fitToView = useCallback(
    (bounds: { minX: number; maxX: number; minY: number; maxY: number }, padding = 60) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const graphW = bounds.maxX - bounds.minX;
      const graphH = bounds.maxY - bounds.minY;
      const availW = rect.width - padding * 2;
      const availH = rect.height - padding * 2;
      const scale = Math.min(availW / graphW, availH / graphH, 1.5);
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      setTransform({
        x: rect.width / 2 - cx * scale,
        y: rect.height / 2 - cy * scale,
        k: scale,
      });
    },
    [],
  );

  const zoomIn = useCallback(() => {
    setTransform((t) => ({ ...t, k: Math.min(maxZoom, t.k * 1.2) }));
  }, [maxZoom]);

  const zoomOut = useCallback(() => {
    setTransform((t) => ({ ...t, k: Math.max(minZoom, t.k / 1.2) }));
  }, [minZoom]);

  return {
    containerRef,
    svgRef,
    transform,
    setTransform,
    svgHandlers,
    fitToView,
    zoomIn,
    zoomOut,
    wasDrag,
  };
}
