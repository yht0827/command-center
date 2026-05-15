import { TYPE_COLORS } from '@/lib/constants';
import type { Entity } from '@/lib/types';

interface EntityRelation {
  type: string;
  targetId: string;
  targetName: string;
  hasEntity: boolean;
  direction: string;
}

interface DetailPanelProps {
  entity: Entity;
  relations: EntityRelation[];
  repoBaseUrl: string;
  onSelectEntity: (id: string) => void;
  onClose: () => void;
}

export function DetailPanel({ entity, relations, repoBaseUrl, onSelectEntity }: DetailPanelProps) {
  return (
    <div className="w-[320px] shrink-0 bg-bg-sidebar border-l border-border p-5 overflow-y-auto">
      <div
        className="text-[11px] font-semibold uppercase tracking-wider mb-1"
        style={{ color: TYPE_COLORS[entity.type] ?? '#71717a' }}
      >
        {entity.type}
      </div>
      <h2 className="text-base font-bold mb-4">{entity.name}</h2>

      <DetailSection title="Summary">
        <p className="text-[13px] text-text-muted leading-relaxed">{entity.summary}</p>
      </DetailSection>

      {entity.repo && (
        <DetailSection title="Code">
          <a
            href={`${repoBaseUrl}/${entity.repo}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-2.5 py-2 bg-bg-card border border-border rounded-md text-xs text-accent hover:bg-bg-hover hover:border-border-hover transition-colors mb-1.5"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" />
            </svg>
            {entity.repo}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="ml-auto opacity-50"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          </a>
          {entity.package && (
            <div className="text-xs text-text-dim px-1">{entity.package}</div>
          )}
        </DetailSection>
      )}

      {entity.wikiDoc && (
        <DetailSection title="Wiki">
          <a
            href={`#/wiki/${entity.wikiDoc}`}
            className="flex items-center gap-1.5 px-2.5 py-2 bg-bg-card border border-border rounded-md text-xs text-accent hover:bg-bg-hover hover:border-border-hover transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            {entity.wikiDoc}
          </a>
        </DetailSection>
      )}

      {relations.length > 0 && (
        <DetailSection title="Relations">
          <ul>
            {relations.map((r, i) => (
              <li
                key={i}
                className={`flex items-center gap-2 py-1.5 text-xs text-text-muted border-b border-border ${
                  r.hasEntity ? 'cursor-pointer hover:bg-bg-hover rounded px-1 -mx-1 transition-colors' : ''
                }`}
                onClick={() => {
                  if (r.hasEntity) onSelectEntity(r.targetId);
                }}
              >
                <span className="text-[10px] font-semibold text-text-dim bg-bg-card px-1.5 py-px rounded shrink-0">
                  {r.type}
                </span>
                <span className={`font-medium truncate ${r.hasEntity ? 'text-accent' : 'text-text-primary'}`}>
                  {r.targetName}
                </span>
              </li>
            ))}
          </ul>
        </DetailSection>
      )}
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <h4 className="text-[11px] font-semibold text-text-dim uppercase tracking-wide mb-1.5">{title}</h4>
      {children}
    </div>
  );
}
