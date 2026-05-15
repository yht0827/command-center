import { HashRouter, Routes, Route, useLocation } from 'react-router-dom';
import { OntologyProvider } from './components/OntologyProvider';
import { Layout } from './components/Layout';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Home } from './pages/Home';
import { DomainGraph } from './pages/DomainGraph';
import { OverviewGraph } from './pages/OverviewGraph';
import { WikiPage } from './pages/WikiPage';

function AppShell() {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary resetKey={pathname}>
      <OntologyProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/domain/:id" element={<DomainGraph />} />
            <Route path="/overview" element={<OverviewGraph />} />
            <Route path="/wiki/*" element={<WikiPage />} />
          </Route>
        </Routes>
      </OntologyProvider>
    </ErrorBoundary>
  );
}

export function App() {
  return (
    <HashRouter>
      <AppShell />
    </HashRouter>
  );
}
