import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';
import { useOntology } from '@/hooks/useOntologyData';
import { useGraphInteraction } from '@/hooks/useGraphInteraction';
import { DOMAIN_COLORS } from '@/lib/constants';
import { ZoomControls, DomainLegend } from '@/components/GraphControls';
import { LoadingOverlay } from '@/components/LoadingOverlay';
import type { Relation } from '@/lib/types';

const DOMAIN_LEGEND_ITEMS = Object.entries(DOMAIN_COLORS).map(([id, color]) => ({ id, color }));

interface DomainNode extends SimulationNodeDatum {
  id: string;
  name: string;
  entityCount: number;
}

interface DomainLink extends SimulationLinkDatum<DomainNode> {
  relation: Relation;
}

export function OverviewGraph() {
  const { ontology } = useOntology();
  const [nodes, setNodes] = useState<DomainNode[]>([]);
  const [links, setLinks] = useState<DomainLink[]>([]);
  const [ready, setReady] = useState(false);
  const hasFitted = useRef(false);
  const navigate = useNavigate();

  const {
    containerRef,
    svgRef,
    transform,
    svgHandlers,
    fitToView,
    zoomIn,
    zoomOut,
  } = useGraphInteraction({
    minZoom: 0.2,
    maxZoom: 3,
    nodeSelector: '.domain-node-group',
    deps: [ontology],
  });

  const fitToViewRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!ontology) return;

    const domainNodes: DomainNode[] = ontology.domains.map((d) => ({
      id: d.id,
      name: d.name,
      entityCount: d.entities.length,
    }));

    // Circular initial placement
    const radius = 200;
    domainNodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / domainNodes.length - Math.PI / 2;
      n.x = Math.cos(angle) * radius;
      n.y = Math.sin(angle) * radius;
    });

    const domainIds = new Set(ontology.domains.map((d) => d.id));
    const domainLinks: DomainLink[] = ontology.crossDomain
      .map((r) => {
        const fromDomain = r.from.split('/')[0];
        const toDomain = r.to.split('/')[0];
        if (!domainIds.has(fromDomain) || !domainIds.has(toDomain)) return null;
        return { source: fromDomain, target: toDomain, relation: r } as DomainLink;
      })
      .filter((l): l is DomainLink => l !== null);

    setReady(false);
    hasFitted.current = false;

    // 시뮬레이션을 동기 사전 실행: tick마다 리렌더 대신 한 번에 최종 위치 계산.
    // 도메인 수가 수십 단위라 동기 실행 비용은 ms 단위.
    const sim = forceSimulation<DomainNode>(domainNodes)
      .force(
        'link',
        forceLink<DomainNode, DomainLink>(domainLinks)
          .id((d) => d.id)
          .distance(250),
      )
      .force('charge', forceManyBody().strength(-600))
      .force('x', forceX(0).strength(0.05))
      .force('y', forceY(0).strength(0.05))
      .force('collide', forceCollide(120))
      .stop();

    const totalTicks = Math.ceil(Math.log(sim.alphaMin()) / Math.log(1 - sim.alphaDecay()));
    sim.tick(totalTicks);

    setNodes([...domainNodes]);
    setLinks([...domainLinks]);

    requestAnimationFrame(() => {
      if (!hasFitted.current) {
        fitToViewRef.current?.();
        hasFitted.current = true;
      }
      setReady(true);
    });

    return () => {
      sim.stop();
    };
  }, [ontology]);

  const doFitToView = useCallback(() => {
    if (nodes.length === 0) return;
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
      if (n.x == null || n.y == null) continue;
      minX = Math.min(minX, n.x - 80);
      maxX = Math.max(maxX, n.x + 80);
      minY = Math.min(minY, n.y - 40);
      maxY = Math.max(maxY, n.y + 40);
    }
    if (!isFinite(minX)) return;
    fitToView({ minX, maxX, minY, maxY }, 100);
  }, [nodes, fitToView]);

  useEffect(() => {
    fitToViewRef.current = doFitToView;
  }, [doFitToView]);

  if (!ontology) return <div className="text-text-muted text-sm p-6">Loading...</div>;

  return (
    <div ref={containerRef} className="h-full -m-6 relative overflow-hidden bg-dot-grid" style={{ touchAction: 'none' }}>
      <svg
        ref={svgRef}
        className="w-full h-full"
        onMouseDown={svgHandlers.onMouseDown}
        onMouseMove={svgHandlers.onMouseMove}
        onMouseUp={svgHandlers.onMouseUp}
        onMouseLeave={svgHandlers.onMouseLeave}
      >
        <g
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}
          className={ready ? 'opacity-100 transition-opacity duration-300' : 'opacity-0'}
        >
          {/* Edges */}
          {links.map((link, i) => {
            const src = link.source as DomainNode;
            const tgt = link.target as DomainNode;
            if (src.x == null || tgt.x == null) return null;
            return (
              <line
                key={i}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke="#3182f6"
                strokeWidth={2}
                strokeOpacity={0.3}
                strokeDasharray="6 4"
              />
            );
          })}

          {/* Domain nodes */}
          {nodes.map((node) => {
            if (node.x == null || node.y == null) return null;
            const color = DOMAIN_COLORS[node.id] ?? '#71717a';
            return (
              <foreignObject
                key={node.id}
                x={node.x - 80}
                y={node.y - 40}
                width={160}
                height={80}
                className="domain-node-group overflow-visible"
              >
                <div
                  onClick={() => navigate(`/domain/${node.id}`)}
                  className="bg-bg-card border border-border rounded-[10px] px-4 py-3 cursor-pointer hover:border-border-hover hover:bg-bg-hover transition-all text-center"
                >
                  <div className="text-[14px] font-semibold" style={{ color }}>
                    {node.name}
                  </div>
                  <div className="text-[11px] text-text-dim mt-1">{node.entityCount} entities</div>
                </div>
              </foreignObject>
            );
          })}
        </g>
      </svg>

      {!ready && <LoadingOverlay />}

      <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={doFitToView} />
      <DomainLegend items={DOMAIN_LEGEND_ITEMS} />
    </div>
  );
}
