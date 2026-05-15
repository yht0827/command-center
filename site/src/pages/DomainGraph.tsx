import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useOntology } from '@/hooks/useOntologyData';
import { useGraphInteraction } from '@/hooks/useGraphInteraction';
import { TYPE_COLORS, EDGE_STYLES, DEFAULT_EDGE } from '@/lib/constants';
import { buildGridLayout, NODE_W, NODE_H } from '@/lib/graph-layout';
import { DetailPanel } from '@/components/DetailPanel';
import { ZoomControls, EdgeLegend } from '@/components/GraphControls';
import type { Entity, Relation } from '@/lib/types';

const EDGE_LEGEND_ITEMS = Object.entries(EDGE_STYLES).map(([type, style]) => ({
  label: type,
  stroke: style.stroke,
  dasharray: style.dasharray,
}));

export function DomainGraph() {
  const { id } = useParams<{ id: string }>();
  const { ontology } = useOntology();
  const [selectedEntity, setSelectedEntity] = useState<Entity | null>(null);

  const domain = ontology?.domains.find((d) => d.id === id);

  const {
    containerRef,
    svgRef,
    transform,
    svgHandlers,
    fitToView,
    zoomIn,
    zoomOut,
    wasDrag,
  } = useGraphInteraction({
    minZoom: 0.1,
    maxZoom: 3,
    nodeSelector: '.graph-node',
    deps: [domain],
  });

  // Build graph data
  const { allEntities, allRelations } = (() => {
    if (!domain || !ontology) return { allEntities: [] as Entity[], allRelations: [] as Relation[] };
    const infraIds = new Set(domain.infra);
    const referencedInfra = ontology.sharedInfra.filter((e) => infraIds.has(e.id));
    const entities = [...domain.entities, ...referencedInfra];
    const entityIds = new Set(entities.map((e) => e.id));
    const relations = domain.relations.filter((r) => entityIds.has(r.from) && entityIds.has(r.to));
    return { allEntities: entities, allRelations: relations };
  })();

  const { sections, totalW, totalH } = allEntities.length > 0
    ? buildGridLayout(allEntities)
    : { sections: [], totalW: 0, totalH: 0 };

  // Node center positions for edge drawing
  const posMap = new Map<string, { x: number; y: number }>();
  for (const s of sections) {
    for (const n of s.nodes) {
      posMap.set(n.id, { x: s.x + n.x + NODE_W / 2, y: s.y + n.y + NODE_H / 2 });
    }
  }

  // Entity lookup by id
  const entityById = new Map<string, Entity>();
  for (const e of allEntities) entityById.set(e.id, e);

  // Auto-fit on load
  const hasFitted = useRef(false);
  useEffect(() => {
    hasFitted.current = false;
  }, [id]);

  const doFitToView = useCallback(() => {
    if (totalW === 0) return;
    fitToView({ minX: 0, maxX: totalW, minY: 0, maxY: totalH }, 60);
  }, [totalW, totalH, fitToView]);

  useEffect(() => {
    if (totalW > 0 && !hasFitted.current) {
      requestAnimationFrame(() => {
        doFitToView();
        hasFitted.current = true;
      });
    }
  }, [totalW, doFitToView]);

  // Pan mouseUp with click-to-deselect
  const onSvgMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!wasDrag()) {
      if (!(e.target as Element).closest('.graph-node')) {
        setSelectedEntity(null);
      }
    }
    svgHandlers.onMouseUp();
  }, [wasDrag, svgHandlers]);

  // Entity relations for detail panel
  const entityRelations = selectedEntity
    ? allRelations
        .filter((r) => r.from === selectedEntity.id || r.to === selectedEntity.id)
        .map((r) => {
          const isFrom = r.from === selectedEntity!.id;
          const targetId = isFrom ? r.to : r.from;
          const targetEntity = entityById.get(targetId);
          return {
            type: r.type,
            targetId,
            targetName: targetEntity?.name ?? targetId,
            hasEntity: !!targetEntity,
            direction: isFrom ? 'out' : 'in',
          };
        })
    : [];

  if (!ontology) return <div className="text-text-muted text-sm p-6">Loading...</div>;
  if (!domain) return <div className="text-text-muted text-sm p-6">Domain not found: {id}</div>;

  return (
    <div className="flex h-full -m-6">
      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-dot-grid" style={{ touchAction: 'none' }}>
        <svg
          ref={svgRef}
          className="w-full h-full"
          style={{ cursor: 'grab' }}
          onMouseDown={svgHandlers.onMouseDown}
          onMouseMove={svgHandlers.onMouseMove}
          onMouseUp={onSvgMouseUp}
          onMouseLeave={svgHandlers.onMouseLeave}
        >
          <g transform={`translate(${transform.x}, ${transform.y}) scale(${transform.k})`}>
            {/* Section backgrounds */}
            {sections.map((s) => (
              <g key={s.type}>
                <rect
                  x={s.x}
                  y={s.y}
                  width={s.w}
                  height={s.h}
                  rx={12}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={1}
                  strokeOpacity={0.15}
                />
                <text
                  x={s.x + 16}
                  y={s.y + 22}
                  fill={s.color}
                  fontSize={11}
                  fontWeight={600}
                  letterSpacing={0.5}
                  style={{ textTransform: 'uppercase' }}
                >
                  {s.label}
                </text>
                <text
                  x={s.x + s.w - 16}
                  y={s.y + 22}
                  fill={s.color}
                  fontSize={11}
                  fillOpacity={0.4}
                  textAnchor="end"
                >
                  {s.nodes.length}
                </text>
              </g>
            ))}

            {/* Edges */}
            {allRelations.map((rel, i) => {
              const from = posMap.get(rel.from);
              const to = posMap.get(rel.to);
              if (!from || !to) return null;
              const style = EDGE_STYLES[rel.type] ?? DEFAULT_EDGE;
              const midY = (from.y + to.y) / 2;
              const curveOffset = Math.abs(from.x - to.x) < 50 ? 60 : 0;
              return (
                <path
                  key={i}
                  d={`M ${from.x},${from.y} C ${from.x + curveOffset},${midY} ${to.x - curveOffset},${midY} ${to.x},${to.y}`}
                  fill="none"
                  stroke={style.stroke}
                  strokeWidth={1.5}
                  strokeOpacity={
                    selectedEntity
                      ? rel.from === selectedEntity.id || rel.to === selectedEntity.id
                        ? style.opacity * 2.5
                        : style.opacity * 0.3
                      : style.opacity
                  }
                  strokeDasharray={style.dasharray}
                />
              );
            })}

            {/* Nodes */}
            {sections.map((s) =>
              s.nodes.map((node) => {
                const isSelected = selectedEntity?.id === node.id;
                return (
                  <foreignObject
                    key={node.id}
                    x={s.x + node.x}
                    y={s.y + node.y}
                    width={NODE_W}
                    height={NODE_H}
                    className="graph-node"
                  >
                    <div
                      onClick={() => setSelectedEntity(node.entity)}
                      className={`h-full bg-bg-card border rounded-[10px] px-4 py-2.5 cursor-pointer select-none transition-all ${
                        isSelected
                          ? 'border-accent shadow-[var(--shadow-accent)]'
                          : 'border-border hover:border-border-hover hover:shadow-[var(--shadow-node)]'
                      }`}
                    >
                      <div className="text-[13px] font-semibold truncate">{node.entity.name}</div>
                      <div className="text-[11px] text-text-muted truncate mt-0.5" style={{ maxWidth: NODE_W - 32 }}>
                        {node.entity.summary.slice(0, 50)}...
                      </div>
                    </div>
                  </foreignObject>
                );
              }),
            )}
          </g>
        </svg>

        <ZoomControls onZoomIn={zoomIn} onZoomOut={zoomOut} onFit={doFitToView} />
        <EdgeLegend items={EDGE_LEGEND_ITEMS} />
      </div>

      {/* Detail panel */}
      {selectedEntity && (
        <DetailPanel
          entity={selectedEntity}
          relations={entityRelations}
          repoBaseUrl={ontology.repoBaseUrl}
          onSelectEntity={(targetId) => {
            const entity = entityById.get(targetId);
            if (entity) setSelectedEntity(entity);
          }}
          onClose={() => setSelectedEntity(null)}
        />
      )}
    </div>
  );
}
