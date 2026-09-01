'use client';

import { AlertTriangle, BookOpenText, CheckCircle2, ChevronRight, FileCheck2, Globe2, LoaderCircle, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from '../api-config';
import { getClerkToken } from '../clerk-auth';
import { OverlayCard } from './overlay-card';
import { RegulatoryTree } from './regulatory-tree';
import { SourceDrawer } from './source-drawer';
import type { KbCatalog, KbCatalogNode, KbDocumentPage, KbIngestionJob } from './types';

function deepestCorpus(nodes: KbCatalogNode[]): KbCatalogNode | null {
  let best: KbCatalogNode | null = null;
  const visit = (node: KbCatalogNode) => {
    if (node.source_count > 0) best = node;
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return best;
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    INDEXED: 'Up to date', PARTIALLY_INDEXED: 'Partially updated', READY_TO_INDEX: 'Updates ready',
    IN_PROGRESS: 'Updating', FAILED: 'Update failed', EMPTY: 'No sources',
  };
  return labels[status] ?? status.replaceAll('_', ' ').toLowerCase();
}

async function authorizedFetch(path: string, init?: RequestInit) {
  const token = await getClerkToken(true);
  if (!token) throw new Error('Sign in and select Airis Admin to load the Knowledge Base.');
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { ...init?.headers, Authorization: `Bearer ${token}` } });
  if (!response.ok) throw new Error(response.status === 403 ? 'This organization does not have Airis administrator access.' : `Knowledge Base API returned ${response.status}.`);
  return response;
}

export function KnowledgeBasePage({ organizationName }: { organizationName: string }) {
  const [catalog, setCatalog] = useState<KbCatalog | null>(null);
  const [selected, setSelected] = useState<KbCatalogNode | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmIngestion, setConfirmIngestion] = useState(false);
  const [job, setJob] = useState<KbIngestionJob | null>(null);
  const [showSources, setShowSources] = useState(false);
  const [industryActive, setIndustryActive] = useState(true);
  const [organizationActive, setOrganizationActive] = useState(true);
  const [projectActive, setProjectActive] = useState(true);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const next = await (await authorizedFetch('/v1/admin/kb/catalog')).json() as KbCatalog;
      setCatalog(next);
      setJob(next.latest_ingestion);
      setSelected((current) => current ? findNode(next.regulatory_tree, current.id) ?? deepestCorpus(next.regulatory_tree) : deepestCorpus(next.regulatory_tree));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to load the Knowledge Base.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const next = await (await authorizedFetch('/v1/admin/kb/catalog')).json() as KbCatalog;
        if (!active) return;
        setCatalog(next);
        setJob(next.latest_ingestion);
        setSelected(deepestCorpus(next.regulatory_tree));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load the Knowledge Base.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!job || !['STARTING', 'IN_PROGRESS'].includes(job.status)) return;
    const timer = window.setTimeout(async () => {
      try {
        const next = await (await authorizedFetch(`/v1/admin/kb/ingest/${job.job_id}`)).json() as KbIngestionJob;
        setJob(next);
        if (['COMPLETE', 'FAILED', 'STOPPED'].includes(next.status)) void load();
      } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to refresh ingestion status.'); }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [job, load]);

  const startIngestion = async () => {
    setConfirmIngestion(false); setError(null);
    try {
      const next = await (await authorizedFetch('/v1/admin/kb/ingest', { method: 'POST' })).json() as KbIngestionJob;
      setJob(next);
      if (next.status === 'COMPLETE') void load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Unable to start ingestion.'); }
  };

  const industry = catalog?.industry_overlays[0];
  const organization = catalog?.organization_overlays[0];
  const project = catalog?.project_overlays[0];
  const context = useMemo(() => [
    catalog?.effective_context.country_code === 'US' ? 'United States' : catalog?.effective_context.country_code ?? 'No country',
    industryActive ? industry?.label ?? catalog?.effective_context.industry ?? 'No industry' : 'Industry disabled',
    organizationActive ? organization?.label ?? 'Public regulations' : 'Organization disabled',
    projectActive ? project?.label ?? 'Global context' : 'Project disabled',
  ], [catalog, industry, organization, project, industryActive, organizationActive, projectActive]);
  const updateInProgress = Boolean(job && ['STARTING', 'IN_PROGRESS'].includes(job.status));
  const knowledgeBaseUpToDate = selected?.index_status === 'INDEXED' && !updateInProgress;
  const updateDisabled = updateInProgress || knowledgeBaseUpToDate || selected?.index_status === 'EMPTY';

  const fetchSourcePage = useCallback(async (cursor?: string) => {
    if (!selected) throw new Error('Select a corpus first.');
    const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return await (await authorizedFetch(`/v1/admin/kb/corpora/${selected.id}/documents${suffix}`)).json() as KbDocumentPage;
  }, [selected]);

  if (loading && !catalog) return <div className="kb-page"><div className="kb-page-state"><LoaderCircle className="spinner" size={28} /><p>Building the knowledge catalog…</p></div></div>;
  if (error && !catalog) return <div className="kb-page"><div className="kb-page-state error"><AlertTriangle size={28} /><p>{error}</p><button onClick={() => void load()}>Try again</button></div></div>;

  return (
    <div className="kb-page">
      <header className="kb-heading"><div><p className="kicker">GROUNDING SOURCES</p><h1>Knowledge Base</h1><p>Build the approved context used for each inspection.</p></div><button className="kb-refresh" onClick={() => void load()} aria-label="Refresh Knowledge Base"><RefreshCw size={17} /></button></header>
      {error && <div className="kb-inline-error"><AlertTriangle size={16} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={15} /></button></div>}

      <section className="kb-context" aria-label="Effective inspection context">
        <p>EFFECTIVE INSPECTION CONTEXT</p>
        <div className="kb-context-path">{context.map((item, index) => <span key={`${item}-${index}`}><strong>{index === 0 && <Globe2 size={16} />}{item}</strong>{index < context.length - 1 && <ChevronRight size={16} />}</span>)}</div>
        <small><ShieldCheck size={15} /> Human-reviewed context · Sources remain subject to authorized professional review.</small>
      </section>

      <div className="kb-layout">
        <section className="kb-regulatory-card"><div className="kb-card-heading"><div><h2>Regulatory authority</h2><p>Browse requirements by jurisdiction</p></div>{catalog && <span>{catalog.summary.source_documents.toLocaleString()} sources</span>}</div><RegulatoryTree nodes={catalog?.regulatory_tree ?? []} selectedId={selected?.id ?? null} onSelect={setSelected} /></section>
        <aside className="kb-overlays"><OverlayCard kind="industry" node={industry} fallback="No industry selected" active={industryActive} onToggle={() => setIndustryActive((value) => !value)} /><OverlayCard kind="organization" node={organization} fallback={organizationName ? `${organizationName} policies` : 'No company policy'} active={organizationActive} onToggle={organization ? () => setOrganizationActive((value) => !value) : undefined} /><OverlayCard kind="project" node={project} fallback="No project selected" active={projectActive} onToggle={project ? () => setProjectActive((value) => !value) : undefined} /></aside>
      </div>

      <section className="kb-corpus-detail">
        <div className="kb-corpus-summary"><div className="kb-corpus-icon"><FileCheck2 size={24} /></div><div><h2>{selected?.label ?? 'Select a corpus'}</h2><div className="kb-badges"><span>{selected?.approval_status === 'human-approved' ? 'Human approved' : 'Approval not recorded'}</span><span>{selected?.kind?.replaceAll('_', ' ') ?? 'Knowledge corpus'}</span>{industry && <span>{industry.label}</span>}</div>{selected && <button className="kb-review-sources" onClick={() => setShowSources(true)}>Review sources</button>}</div></div>
        <div className="kb-metrics"><div><strong>{selected?.source_count.toLocaleString() ?? 0}</strong><span>Source documents</span></div><div><strong>{selected?.metadata_sidecar_count.toLocaleString() ?? 0}</strong><span>Metadata sidecars hidden</span></div><div><strong>{catalog?.summary.hidden_prefix_markers.toLocaleString() ?? 0}</strong><span>Folder markers hidden</span></div></div>
        <div className="kb-ingestion"><p>KNOWLEDGE BASE STATUS</p><strong className={`kb-status ${(selected?.index_status ?? 'EMPTY').toLowerCase()}`}>{selected?.index_status === 'FAILED' ? <AlertTriangle size={19} /> : <CheckCircle2 size={19} />}{statusLabel(selected?.index_status ?? 'EMPTY')}</strong>{job && <small>Last update: {job.status.replaceAll('_', ' ').toLowerCase()}</small>}<button onClick={() => setConfirmIngestion(true)} disabled={updateDisabled}>{updateInProgress ? <><LoaderCircle className="spinner" size={16} /> Updating…</> : knowledgeBaseUpToDate ? 'Knowledge Base up to date' : 'Update Knowledge Base'}</button></div>
        <footer><ShieldCheck size={15} /> Airis surfaces potential violations for human review. Final decisions remain with authorized professionals.</footer>
      </section>

      {confirmIngestion && <div className="kb-dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfirmIngestion(false); }}><section className="kb-dialog" role="dialog" aria-modal="true" aria-labelledby="kb-ingest-title"><div className="kb-dialog-icon"><BookOpenText size={22} /></div><h2 id="kb-ingest-title">Update the Knowledge Base?</h2><p>Airis will add the approved documents and recent updates shown here to the Knowledge Base used during inspections. Your source files will remain unchanged.</p><div><button className="secondary-button" onClick={() => setConfirmIngestion(false)}>Cancel</button><button className="primary-button" onClick={() => void startIngestion()}>Update Knowledge Base</button></div></section></div>}
      {showSources && selected && <SourceDrawer corpus={selected} fetchPage={fetchSourcePage} onClose={() => setShowSources(false)} />}
    </div>
  );
}

function findNode(nodes: KbCatalogNode[], id: string): KbCatalogNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findNode(node.children, id);
    if (child) return child;
  }
  return null;
}
