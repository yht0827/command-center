import { useNavigate } from 'react-router-dom';
import { useOntology } from '@/hooks/useOntologyData';
import { DOMAIN_ICONS } from '@/lib/constants';

export function Home() {
  const { ontology, wikiIndex } = useOntology();
  const navigate = useNavigate();

  if (!ontology) {
    return <div className="text-text-muted text-sm">Loading...</div>;
  }

  const totalEntities = ontology.domains.reduce((s, d) => s + d.entities.length, 0);
  const totalRelations = ontology.domains.reduce((s, d) => s + d.relations.length, 0);
  const wikiDocCount = wikiIndex?.docs.length ?? 0;

  return (
    <div>
      <h1 className="text-xl font-bold tracking-tight mb-1">Overview</h1>
      <p className="text-[13px] text-text-muted mb-6">
        {ontology.domains.length} domains &middot; {totalEntities} entities &middot; {totalRelations} relations &middot; {wikiDocCount} wiki docs
      </p>

      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        <StatCard label="Domains" value={ontology.domains.length} />
        <StatCard label="Entities" value={totalEntities}>
          <div className="flex gap-1 mt-0.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(96,165,250,0.12)] text-node-process">
              process {ontology.domains.reduce((s, d) => s + d.entities.filter((e) => e.type === 'process').length, 0)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(52,211,153,0.12)] text-node-data">
              data {ontology.domains.reduce((s, d) => s + d.entities.filter((e) => e.type === 'data').length, 0)}
            </span>
          </div>
        </StatCard>
        <StatCard label="Relations" value={totalRelations} sub={`cross-domain ${ontology.crossDomain.length}`} />
        <StatCard
          label="Wiki Docs"
          value={wikiDocCount}
          sub={wikiDocCount > 0 ? '문서 보기 →' : undefined}
          onClick={wikiDocCount > 0 ? () => navigate('/wiki/README.md') : undefined}
        />
      </div>

      {/* Domain Grid (or empty state) */}
      {ontology.domains.length === 0 ? (
        <EmptyDomainState />
      ) : (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
        {ontology.domains.map((domain) => {
          const icon = DOMAIN_ICONS[domain.id] ?? { emoji: '\uD83D\uDCE6', color: '#71717a', bg: 'rgba(113,113,122,0.12)' };
          return (
            <div
              key={domain.id}
              onClick={() => navigate(`/domain/${domain.id}`)}
              className="bg-bg-card border border-border rounded-[10px] p-5 cursor-pointer transition-all hover:border-border-hover hover:bg-bg-hover flex flex-col"
            >
              {/* Header: icon + name + counts */}
              <div className="flex items-start gap-3 mb-2.5">
                <div
                  className="w-9 h-9 rounded-lg flex items-center justify-center text-base shrink-0"
                  style={{ background: icon.bg, color: icon.color }}
                >
                  {icon.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-[15px] font-semibold tracking-tight">{domain.name}</h3>
                  <div className="text-[11px] text-text-dim mt-px">{domain.path}</div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(96,165,250,0.12)] text-node-process">
                    entities {domain.entities.length}
                  </span>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[rgba(52,211,153,0.12)] text-node-data">
                    relations {domain.relations.length}
                  </span>
                </div>
              </div>

              {/* Summary */}
              <p className="text-[13px] text-text-muted leading-relaxed mb-3.5 flex-1">{domain.summary}</p>

              {/* Repos */}
              <div className="flex flex-wrap gap-1.5">
                {domain.repos.map((repo) => (
                  <a
                    key={repo}
                    href={`${ontology.repoBaseUrl}/${repo}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-mono bg-bg-tag text-text-muted hover:text-accent hover:bg-accent-dim transition-colors"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22"/></svg>
                    {repo}
                  </a>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}

function EmptyDomainState() {
  return (
    <div className="bg-bg-card border border-dashed border-border rounded-[10px] p-10 text-center">
      <div className="text-[15px] font-semibold mb-2">아직 도메인이 없습니다</div>
      <p className="text-[13px] text-text-muted leading-relaxed max-w-md mx-auto">
        <code className="text-accent">ontology/index.yaml</code>에 도메인을 추가하거나,
        Claude Code에서 <code className="text-accent">/new-domain</code> 스킬로 첫 도메인을 만들어보세요.
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  children,
  onClick,
}: {
  label: string;
  value: number;
  sub?: string;
  children?: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`bg-bg-card border border-border rounded-[10px] p-4 ${
        onClick ? 'cursor-pointer hover:bg-bg-hover hover:border-border-hover transition-colors' : ''
      }`}
    >
      <div className="text-[11px] text-text-dim uppercase tracking-wide">{label}</div>
      <div className="text-[28px] font-bold tracking-tighter mt-1">{value}</div>
      {sub && <div className="text-xs text-text-muted mt-0.5">{sub}</div>}
      {children}
    </div>
  );
}
