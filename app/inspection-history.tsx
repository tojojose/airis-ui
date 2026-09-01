'use client';

import { Building2, ChevronDown, Clock3, FileSearch, FlaskConical, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type AirisAuthState } from './clerk-auth';
import type { InspectionProject, InspectionPurpose } from './pipeline-run';
import type { RunSummary } from './recent-runs';

type Client = { org_id: string; name: string; status: string };
type StoredFinding = {
  id?: string;
  category?: string;
  description?: string;
  severity?: string;
  confidence?: string;
  confidence_score?: number;
  visual_confidence_score?: number;
  verification_status?: string;
  verification_reason?: string;
  bbox?: [number, number, number, number] | null;
  citations?: Array<{ section?: string; source_doc?: string; excerpt?: string }>;
};
type DetailedResult = {
  findings?: StoredFinding[] | { findings?: StoredFinding[] };
  stages?: Array<{ stage?: string; status?: string; latency_ms?: number }>;
  latency_ms?: number;
  model?: string;
  models?: Record<string, unknown>;
  prompt_version?: string;
  error?: string;
};

function storedFindings(detail: DetailedResult | null): StoredFinding[] {
  if (!detail?.findings) return [];
  return Array.isArray(detail.findings) ? detail.findings : detail.findings.findings || [];
}

export function InspectionHistory({ auth, purpose, initialOrgId = '', initialProjectId = '' }: { auth: AirisAuthState; purpose: InspectionPurpose; initialOrgId?: string; initialProjectId?: string }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<InspectionProject[]>([]);
  const [orgId, setOrgId] = useState(initialOrgId || auth.organizationId || '');
  const [projectId, setProjectId] = useState(initialProjectId);
  const [profile, setProfile] = useState('');
  const [results, setResults] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<DetailedResult | null>(null);
  const [detailError, setDetailError] = useState('');
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => { setOrgId(initialOrgId || auth.organizationId || ''); setProjectId(initialProjectId); }, [auth.organizationId, initialOrgId, initialProjectId]);

  useEffect(() => {
    if (!auth.signedIn || !auth.isAdmin) return;
    void (async () => {
      const token = await getClerkToken(true); if (!token) return;
      const response = await fetch(`${API_URL}/v1/admin/clients`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { clients?: Client[] };
      if (response.ok) setClients(payload.clients || []);
    })();
  }, [auth.isAdmin, auth.signedIn]);

  useEffect(() => {
    if (!auth.signedIn || !orgId) { setProjects([]); setProjectId(''); return; }
    void (async () => {
      const token = await getClerkToken(true); if (!token) return;
      const endpoint = auth.isAdmin ? `/v1/admin/clients/${encodeURIComponent(orgId)}/projects` : '/v1/projects';
      const response = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { projects?: InspectionProject[] };
      if (response.ok) {
        const available = payload.projects || [];
        setProjects(available);
        setProjectId((current) => available.some((project) => project.project_id === current) ? current : '');
      }
    })();
  }, [auth.isAdmin, auth.signedIn, orgId]);

  useEffect(() => {
    if (!auth.signedIn) return;
    if (purpose === 'operational' && !orgId && !projectId) { setResults([]); return; }
    let active = true;
    void (async () => {
      setLoading(true); setError(null); setOpenId(''); setDetail(null);
      try {
        const token = await getClerkToken(true); if (!token) throw new Error('Sign in to view history.');
        const params = new URLSearchParams({ purpose });
        if (profile) params.set('profile', profile);
        if (auth.isAdmin && orgId) params.set('org_id', orgId);
        let endpoint: string;
        if (purpose === 'evaluation' && auth.isAdmin && !orgId && !projectId) endpoint = `/v1/admin/evaluations?${params}`;
        else if (projectId) endpoint = `/v1/projects/${encodeURIComponent(projectId)}/results?${params}`;
        else endpoint = `/v1/projects/results?${params}`;
        const response = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json() as { results?: RunSummary[]; detail?: string };
        if (!response.ok) throw new Error(payload.detail || `History request failed (${response.status}).`);
        if (active) setResults(payload.results || []);
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Could not load history.'); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [auth.isAdmin, auth.signedIn, orgId, profile, projectId, purpose, refresh]);

  async function toggleDetail(result: RunSummary & { s3_keys?: Record<string, string> }) {
    if (openId === result.request_id) { setOpenId(''); setDetail(null); return; }
    setOpenId(result.request_id); setDetail(null); setDetailError('');
    const key = result.s3_keys?.result;
    if (!key) { setDetailError(result.error || 'The summary is available, but no detailed result artifact was stored.'); return; }
    setDetailLoading(true);
    try {
      const token = await getClerkToken(true); if (!token) throw new Error('Sign in to view this result.');
      const response = await fetch(`${API_URL}/v1/results/presign?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { url?: string; detail?: string };
      if (!response.ok || !payload.url) throw new Error(payload.detail || 'Could not open the stored result.');
      const artifact = await fetch(payload.url);
      if (!artifact.ok) throw new Error(`Stored result could not be downloaded (${artifact.status}).`);
      setDetail(await artifact.json() as DetailedResult);
    } catch (caught) { setDetailError(caught instanceof Error ? caught.message : 'Could not load result details.'); }
    finally { setDetailLoading(false); }
  }

  return <div className="admin-page history-page">
    <header className="admin-heading"><div><p className="kicker">{purpose === 'evaluation' ? 'EVALUATION HISTORY' : 'INSPECTION HISTORY'}</p><h1>{purpose === 'evaluation' ? 'Model and pipeline evaluations' : 'Previous inspections'}</h1><p>Review completed and failed runs with their original scope, evidence, latency and cost.</p></div><button className="history-refresh" onClick={() => setRefresh((value) => value + 1)}><RefreshCw size={16} /> Refresh</button></header>
    <section className="history-filter-card">
      {auth.isAdmin && <label><span>Client</span><select value={orgId} onChange={(event) => { setOrgId(event.target.value); setProjectId(''); }}><option value="">{purpose === 'evaluation' ? 'System sandbox' : 'Select client'}</option>{clients.map((client) => <option key={client.org_id} value={client.org_id}>{client.name}{client.status !== 'active' ? ` (${client.status})` : ''}</option>)}</select></label>}
      <label><span>Project</span><select disabled={!orgId} value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">All projects</option>{projects.map((project) => <option key={project.project_id} value={project.project_id}>{project.name}{project.status !== 'active' ? ` (${project.status})` : ''}</option>)}</select></label>
      <label><span>Profile</span><select value={profile} onChange={(event) => setProfile(event.target.value)}><option value="">All profiles</option><option value="visual_safety">Visual Safety Scan</option><option value="regulatory_compliance">Regulatory Compliance</option></select></label>
    </section>
    {loading ? <div className="history-state"><LoaderCircle className="spinner" size={28} /> Loading history…</div>
      : error ? <div className="history-state error"><TriangleAlert size={24} />{error}</div>
      : results.length ? <section className="history-results">{results.map((result) => {
        const stored = result as RunSummary & { s3_keys?: Record<string, string> };
        const findings = storedFindings(detail);
        return <article className={`history-run-card run-${result.status || 'completed'}`} key={result.request_id}>
          <button className="history-run-summary" onClick={() => void toggleDetail(stored)}>
            <div className="history-result-icon">{purpose === 'evaluation' ? <FlaskConical size={19} /> : <ShieldCheck size={19} />}</div>
            <div><strong>{result.context_manifest?.project_name || (purpose === 'evaluation' && !orgId ? 'System sandbox' : result.request_id)}</strong><span>{result.profile === 'visual_safety' ? 'Visual Safety Scan' : 'Regulatory Compliance'} · {result.summary?.ran_through || result.kind}</span><small><Clock3 size={12} /> {result.timestamp || 'Timestamp unavailable'} · {result.summary?.total || 0} findings · ${(result.usage?.est_cost_usd || 0).toFixed(4)}</small></div>
            <em>{result.status || 'completed'}</em><ChevronDown className={openId === result.request_id ? 'open' : ''} size={17} />
          </button>
          {openId === result.request_id && <div className="history-run-detail">
            {detailLoading ? <div className="recent-runs-state"><LoaderCircle className="spinner" size={18} /> Loading result…</div>
              : detailError ? <div className="recent-runs-state error"><TriangleAlert size={17} />{detailError}</div>
              : detail ? <>
                {(detail.model || detail.prompt_version || detail.latency_ms !== undefined) && <div className="history-result-metadata"><span><strong>Model</strong>{detail.model || 'Recorded by pipeline stage'}</span><span><strong>Prompt</strong>{detail.prompt_version || 'Contextual pipeline prompt'}</span><span><strong>Latency</strong>{detail.latency_ms !== undefined ? `${detail.latency_ms} ms` : 'Unavailable'}</span></div>}
                {detail.stages?.length ? <div className="history-stage-strip">{detail.stages.map((stage) => <span key={stage.stage}>{stage.stage}: <strong>{stage.status}</strong>{stage.latency_ms !== undefined ? ` · ${stage.latency_ms} ms` : ''}</span>)}</div> : null}
                {findings.length ? <div className="history-finding-list">{findings.map((finding, index) => <div key={finding.id || index}><em>{finding.severity || 'review'}</em><span><strong>{finding.category || 'Finding'}</strong>{finding.description}<small>{finding.verification_status ? `Evidence: ${finding.verification_status.replaceAll('_', ' ')}` : 'Human review required'}{typeof finding.confidence_score === 'number' ? ` · ${Math.round(finding.confidence_score)}% confidence` : typeof finding.visual_confidence_score === 'number' ? ` · ${Math.round(finding.visual_confidence_score)}% visual confidence` : ''}{finding.bbox ? ' · Located in image' : ''}</small>{finding.verification_reason && <small>{finding.verification_reason}</small>}{finding.citations?.map((citation, citationIndex) => <cite key={citationIndex}><strong>{citation.section || citation.source_doc || 'Supporting source'}</strong>{citation.excerpt || ''}</cite>)}</span></div>)}</div> : <div className="recent-runs-state"><ShieldCheck size={20} />No findings were stored for this run.</div>}
              </> : null}
          </div>}
        </article>;
      })}</section>
      : <div className="history-state"><FileSearch size={30} /><strong>No matching runs</strong><span>{purpose === 'evaluation' && !orgId ? 'Run a system evaluation to create the first record.' : 'Choose a scope or start a new inspection.'}</span></div>}
  </div>;
}
