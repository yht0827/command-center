import { OntologyContext, useOntologyLoader } from '@/hooks/useOntologyData';

export function OntologyProvider({ children }: { children: React.ReactNode }) {
  const value = useOntologyLoader();
  return <OntologyContext.Provider value={value}>{children}</OntologyContext.Provider>;
}
