import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { ThemeToggle } from './ThemeToggle';
import { ErrorBoundary } from './ErrorBoundary';

function Breadcrumb() {
  const { pathname } = useLocation();

  let label = 'Overview';
  if (pathname.startsWith('/domain/')) {
    const id = pathname.replace('/domain/', '');
    label = decodeURIComponent(id);
  } else if (pathname === '/overview') {
    label = 'Ontology Graph';
  } else if (pathname.startsWith('/wiki/')) {
    const path = pathname.replace('/wiki/', '');
    label = decodeURIComponent(path);
  }

  return (
    <div className="text-[13px] text-text-muted">
      Command Center
      <span className="text-text-dim mx-1.5">/</span>
      <span className="text-text-primary font-medium">{label}</span>
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="flex h-screen bg-bg text-text-primary">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="h-[52px] shrink-0 border-b border-border flex items-center justify-between px-6">
          <Breadcrumb />
          <ThemeToggle />
        </div>
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
