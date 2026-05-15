interface ZoomControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className="absolute top-4 right-4 flex flex-col gap-1">
      <button
        onClick={onZoomIn}
        className="w-8 h-8 bg-bg-card border border-border rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary hover:border-border-hover text-sm flex items-center justify-center transition-colors"
      >+</button>
      <button
        onClick={onZoomOut}
        className="w-8 h-8 bg-bg-card border border-border rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary hover:border-border-hover text-sm flex items-center justify-center transition-colors"
      >&minus;</button>
      <button
        onClick={onFit}
        className="w-8 h-8 bg-bg-card border border-border rounded-md text-text-muted hover:bg-bg-hover hover:text-text-primary hover:border-border-hover text-[10px] flex items-center justify-center transition-colors"
      >Fit</button>
    </div>
  );
}

interface EdgeLegendItem {
  label: string;
  stroke: string;
  dasharray?: string;
}

interface EdgeLegendProps {
  items: EdgeLegendItem[];
}

export function EdgeLegend({ items }: EdgeLegendProps) {
  return (
    <div className="absolute bottom-4 left-4 flex gap-3 bg-bg-card border border-border rounded-md px-3.5 py-2 text-[11px] text-text-muted">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <svg width="20" height="8"><line x1="0" y1="4" x2="20" y2="4" stroke={item.stroke} strokeWidth={2} strokeDasharray={item.dasharray} /></svg>
          {item.label}
        </div>
      ))}
    </div>
  );
}

interface DomainLegendItem {
  id: string;
  color: string;
}

interface DomainLegendProps {
  items: DomainLegendItem[];
}

export function DomainLegend({ items }: DomainLegendProps) {
  return (
    <div className="absolute bottom-4 left-4 flex gap-3 bg-bg-card border border-border rounded-md px-3.5 py-2 text-[11px] text-text-muted">
      {items.map((item) => (
        <div key={item.id} className="flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          {item.id}
        </div>
      ))}
    </div>
  );
}
