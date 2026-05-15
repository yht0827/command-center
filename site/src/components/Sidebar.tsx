import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useOntology } from '@/hooks/useOntologyData';
import { DOMAIN_COLORS } from '@/lib/constants';

export function Sidebar() {
  const { ontology, wikiIndex } = useOntology();
  const [domainsOpen, setDomainsOpen] = useState(true);
  const [wikiOpen, setWikiOpen] = useState(true);
  const [wikiRootOpen, setWikiRootOpen] = useState(true);
  const [wikiDomainOpen, setWikiDomainOpen] = useState<Record<string, boolean>>({});

  const totalEntities = ontology?.domains.reduce((s, d) => s + d.entities.length, 0) ?? 0;

  // wiki docs grouped by: root (no domain) + by domain
  const wikiRootDocs: { path: string; title: string }[] = [];
  const wikiByDomain = new Map<string, { path: string; title: string }[]>();
  if (wikiIndex) {
    for (const doc of wikiIndex.docs) {
      const entry = { path: doc.path, title: doc.title || doc.path };
      if (!doc.domain) {
        wikiRootDocs.push(entry);
        continue;
      }
      const list = wikiByDomain.get(doc.domain) ?? [];
      list.push(entry);
      wikiByDomain.set(doc.domain, list);
    }
  }

  return (
    <aside className="w-[260px] shrink-0 border-r border-border bg-bg-sidebar flex flex-col">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-border">
        <h1 className="text-[15px] font-bold tracking-tight">Command Center</h1>
        <p className="text-xs text-text-muted mt-0.5">
          {ontology ? `${ontology.domains.length} domains` : '...'} &middot; {totalEntities} entities
        </p>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {/* Main navigation */}
        <div className="mb-2">
          <NavLink
            to="/"
            end
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
              }`
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" rx="1" />
              <rect x="14" y="3" width="7" height="7" rx="1" />
              <rect x="3" y="14" width="7" height="7" rx="1" />
              <rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
            Overview
          </NavLink>
          <NavLink
            to="/overview"
            className={({ isActive }) =>
              `flex items-center gap-2 px-3 py-[7px] rounded-md text-[13px] transition-colors ${
                isActive
                  ? 'bg-accent-dim text-accent'
                  : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
              }`
            }
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="5" r="3" />
              <circle cx="5" cy="19" r="3" />
              <circle cx="19" cy="19" r="3" />
              <line x1="12" y1="8" x2="5" y2="16" />
              <line x1="12" y1="8" x2="19" y2="16" />
            </svg>
            Ontology Graph
          </NavLink>
        </div>

        {/* Domains */}
        <div className="mb-2">
          <button
            onClick={() => setDomainsOpen(!domainsOpen)}
            className="w-full text-left text-[11px] font-semibold text-text-dim uppercase tracking-wider px-3 pt-2 pb-1 hover:text-text-muted transition-colors"
          >
            Domains {domainsOpen ? '−' : '+'}
          </button>
          {domainsOpen &&
            ontology?.domains.map((domain) => (
              <NavLink
                key={domain.id}
                to={`/domain/${domain.id}`}
                className={({ isActive }) =>
                  `flex items-center gap-2 pl-5 pr-3 py-[7px] rounded-md text-[13px] transition-colors ${
                    isActive
                      ? 'bg-accent-dim text-accent'
                      : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                  }`
                }
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ background: DOMAIN_COLORS[domain.id] ?? '#71717a' }}
                />
                {domain.name}
                <span className="ml-auto text-[11px] text-text-dim">{domain.entities.length}</span>
              </NavLink>
            ))}
        </div>

        {/* Wiki */}
        <div className="mb-2">
          <button
            onClick={() => setWikiOpen(!wikiOpen)}
            className="w-full text-left text-[11px] font-semibold text-text-dim uppercase tracking-wider px-3 pt-2 pb-1 hover:text-text-muted transition-colors"
          >
            Wiki {wikiOpen ? '−' : '+'}
          </button>
          {wikiOpen && wikiRootDocs.length > 0 && (
            <div>
              <button
                onClick={() => setWikiRootOpen(!wikiRootOpen)}
                className="w-full flex items-center gap-2 pl-5 pr-3 py-[6px] rounded-md text-[12px] text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
              >
                <svg
                  width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                  className={`shrink-0 transition-transform ${wikiRootOpen ? 'rotate-90' : ''}`}
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <span className="font-medium">공통 문서</span>
                <span className="ml-auto text-[11px] text-text-dim">{wikiRootDocs.length}</span>
              </button>
              {wikiRootOpen && wikiRootDocs.map((doc) => (
                <NavLink
                  key={doc.path}
                  to={`/wiki/${doc.path}`}
                  className={({ isActive }) =>
                    `flex items-center gap-2 pl-9 pr-3 py-[5px] rounded-md text-[12px] transition-colors ${
                      isActive
                        ? 'bg-accent-dim text-accent'
                        : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                    }`
                  }
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <span className="truncate">{doc.title}</span>
                </NavLink>
              ))}
            </div>
          )}
          {wikiOpen &&
            Array.from(wikiByDomain.entries()).map(([domain, docs]) => {
              const isOpen = wikiDomainOpen[domain] ?? false;
              return (
                <div key={domain}>
                  <button
                    onClick={() => setWikiDomainOpen((prev) => ({ ...prev, [domain]: !isOpen }))}
                    className="w-full flex items-center gap-2 pl-5 pr-3 py-[6px] rounded-md text-[12px] text-text-muted hover:bg-bg-hover hover:text-text-primary transition-colors"
                  >
                    <svg
                      width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                    <span className="font-medium">{domain}</span>
                    <span className="ml-auto text-[11px] text-text-dim">{docs.length}</span>
                  </button>
                  {isOpen && docs.map((doc) => (
                    <NavLink
                      key={doc.path}
                      to={`/wiki/${doc.path}`}
                      className={({ isActive }) =>
                        `flex items-center gap-2 pl-9 pr-3 py-[5px] rounded-md text-[12px] transition-colors ${
                          isActive
                            ? 'bg-accent-dim text-accent'
                            : 'text-text-muted hover:bg-bg-hover hover:text-text-primary'
                        }`
                      }
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6" />
                      </svg>
                      <span className="truncate">{doc.title}</span>
                    </NavLink>
                  ))}
                </div>
              );
            })}
        </div>
      </nav>
    </aside>
  );
}
