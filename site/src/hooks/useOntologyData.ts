import { createContext, useContext, useEffect, useState } from 'react';
import type { OntologyData, WikiIndex } from '@/lib/types';

interface OntologyContextValue {
  ontology: OntologyData | null;
  wikiIndex: WikiIndex | null;
  loading: boolean;
}

const OntologyContext = createContext<OntologyContextValue>({
  ontology: null,
  wikiIndex: null,
  loading: true,
});

export function useOntology() {
  return useContext(OntologyContext);
}

export { OntologyContext };

export function useOntologyLoader(): OntologyContextValue {
  const [ontology, setOntology] = useState<OntologyData | null>(null);
  const [wikiIndex, setWikiIndex] = useState<WikiIndex | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('./data/ontology.json').then((r) => r.json()),
      fetch('./data/wiki-index.json').then((r) => r.json()),
    ])
      .then(([ont, wiki]) => {
        setOntology(ont);
        setWikiIndex(wiki);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return { ontology, wikiIndex, loading };
}
