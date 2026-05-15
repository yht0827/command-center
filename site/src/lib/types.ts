export interface Entity {
  id: string;
  name: string;
  type: 'process' | 'data' | 'table' | 'infra' | 'external' | 'service';
  summary: string;
  wikiDoc?: string;
  repo?: string;
  package?: string;
  status?: string;
}

export interface Relation {
  from: string;
  to: string;
  type: string;
  note?: string;
}

export interface Domain {
  id: string;
  name: string;
  path: string;
  summary: string;
  repos: string[];
  infra: string[];
  wikiRoot: string;
  entities: Entity[];
  relations: Relation[];
}

export interface WikiDoc {
  path: string;
  title: string;
  domain: string;
}

export interface OntologyData {
  domains: Domain[];
  sharedInfra: Entity[];
  crossDomain: Relation[];
  repoBaseUrl: string;
}

export interface WikiIndex {
  docs: WikiDoc[];
}
