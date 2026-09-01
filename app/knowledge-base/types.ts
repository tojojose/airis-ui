export type KbIngestionJob = {
  job_id: string;
  status: 'STARTING' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED' | 'STOPPED' | string;
  started_at?: string;
  stats?: Record<string, number>;
  failure_reasons?: string[];
};

export type KbCatalogNode = {
  id: string;
  label: string;
  kind: string;
  path: string;
  source_count: number;
  metadata_sidecar_count: number;
  byte_count: number;
  index_status: string;
  approval_status: string;
  metadata: Record<string, unknown>;
  children: KbCatalogNode[];
};

export type KbCatalog = {
  active_source_prefix: string;
  effective_context: {
    country_code: string | null;
    industry: string | null;
    organization_id: string;
    project_id: string;
  };
  regulatory_tree: KbCatalogNode[];
  industry_overlays: KbCatalogNode[];
  organization_overlays: KbCatalogNode[];
  project_overlays: KbCatalogNode[];
  summary: {
    source_documents: number;
    metadata_sidecars: number;
    hidden_prefix_markers: number;
    indexed_documents: number;
    failed_documents: number;
    legacy_documents: number;
  };
  latest_ingestion: KbIngestionJob | null;
};

export type KbDocument = {
  key: string;
  size: number | null;
  last_modified: string | null;
  status: string;
  status_reason: string;
  sidecar_key: string | null;
};

export type KbDocumentPage = {
  corpus_id: string;
  documents: KbDocument[];
  next_cursor: string | null;
};
