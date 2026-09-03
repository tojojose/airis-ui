'use client';

import { ChevronDown, Clock3, FileSearch, History, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type AirisAuthState } from './clerk-auth';
import { HistoryEvidenceImage } from './history-evidence';
import { profileLabel } from './inspection-profiles';
import type { InspectionProfile, InspectionPurpose } from './pipeline-run';

export type RunSummary = {
  request_id: string;
  timestamp: string;
  kind: string;
  purpose: InspectionPurpose;
  profile: InspectionProfile;
  status?: 'completed' | 'failed' | 'cancelled' | 'partial';
  error?: string;
  project_id?: string;
  s3_keys?: Record<string, string>;
  summary?: { total?: number; ran_through?: string };
  usage?: { est_cost_usd?: number };
  context_manifest?: { project_name?: string };
};

type Props = {
  auth: AirisAuthState;
  purpose: InspectionPurpose;
  orgId?: string;
  projectId?: string;
  profile?: InspectionProfile;
  refreshKey?: number;
  limit?: number;
  onViewAll?: () => void;
};

type StoredFinding = { id?: string; category?: string; description?: string; severity?: string; confidence_score?: number; visual_confidence_score?: number; verification_status?: string; verification_reason?: string; bbox?: [number, number, number, number] | null; citations?: Array<{ section?: string; source_doc?: string; excerpt?: string }> };
type StoredDetail = { findings?: StoredFinding[] | { findings?: StoredFinding[] }; stages?: Array<{ stage?: string; status?: string; latency_ms?: number }>; model?: string; prompt_version?: string; latency_ms?: number; s3_keys?: Record<string, string>; evidence_image?: { key?: string } | null };

function findingsFrom(detail: StoredDetail | null) {
  if (!detail?.findings) return [];
  return Array.isArray(detail.findings) ? detail.findings : detail.findings.findings || [];
}

export function RecentRuns({ auth, purpose, orgId = '', projectId = '', profile, refreshKey = 0, limit = 5, onViewAll }: Props) {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState('');
  const [detail, setDetail] = useState<StoredDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [evidenceExpected, setEvidenceExpected] = useState(false);

  useEffect(() => {
    if (!auth.signedIn || (purpose === 'operational' && !orgId && !projectId)) { setRuns([]); return; }
    let active = true;
    void (async () => {
      setLoading(true); setError(null); setOpenId(''); setDetail(null);
      try {
        const token = await getClerkToken(true);
        if (!token) throw new Error('Sign in to load recent runs.');
        const params = new URLSearchParams({ limit: String(limit), purpose });
        if (profile) params.set('profile', profile);
        if (auth.isAdmin && orgId) params.set('org_id', orgId);
        let endpoint: string;
        if (purpose === 'evaluation' && auth.isAdmin && !orgId && !projectId) {
          endpoint = `/v1/admin/evaluations?${params}`;
        } else if (projectId) {
          endpoint = `/v1/projects/${encodeURIComponent(projectId)}/results?${params}`;
        } else {
          endpoint = `/v1/projects/results?${params}`;
        }
        const response = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
        const payload = await response.json() as { results?: RunSummary[]; detail?: string };
        if (!response.ok) throw new Error(payload.detail || `Recent runs request failed (${response.status}).`);
        if (active) setRuns((payload.results || []).slice(0, limit));
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Could not load recent runs.');
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [auth.isAdmin, auth.signedIn, limit, orgId, profile, projectId, purpose, refreshKey]);

  async function toggleDetail(run: RunSummary) {
    if (openId === run.request_id) { setOpenId(''); setDetail(null); setEvidenceUrl(''); return; }
    setOpenId(run.request_id); setDetail(null); setDetailError(''); setEvidenceUrl(''); setEvidenceExpected(false);
    const key = run.s3_keys?.result;
    if (!key) { setDetailError(run.error || 'No detailed result artifact was stored for this run.'); return; }
    setDetailLoading(true);
    try {
      const token = await getClerkToken(true); if (!token) throw new Error('Sign in to view this result.');
      const response = await fetch(`${API_URL}/v1/results/presign?key=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { url?: string; detail?: string };
      if (!response.ok || !payload.url) throw new Error(payload.detail || 'Could not open the stored result.');
      const artifact = await fetch(payload.url);
      if (!artifact.ok) throw new Error(`Stored result could not be downloaded (${artifact.status}).`);
      const storedDetail = await artifact.json() as StoredDetail;
      setDetail(storedDetail);
      const imageKey = storedDetail.evidence_image?.key || storedDetail.s3_keys?.image || run.s3_keys?.image || '';
      setEvidenceExpected(Boolean(imageKey));
      if (imageKey) {
        const imageResponse = await fetch(`${API_URL}/v1/results/presign?key=${encodeURIComponent(imageKey)}`, { headers: { Authorization: `Bearer ${token}` } });
        const imagePayload = await imageResponse.json() as { url?: string; detail?: string };
        if (imageResponse.ok && imagePayload.url) setEvidenceUrl(imagePayload.url);
      }
    } catch (caught) { setDetailError(caught instanceof Error ? caught.message : 'Could not load result details.'); }
    finally { setDetailLoading(false); }
  }

  return <section className="recent-runs-card" aria-label="Recent runs">
    <header><div><p className="kicker">RECENT RUNS</p><h2>Previous results for this scope</h2></div>{onViewAll && <button onClick={onViewAll}><History size={15} /> View all history</button>}</header>
    {loading ? <div className="recent-runs-state"><LoaderCircle className="spinner" size={20} /> Loading…</div>
      : error ? <div className="recent-runs-state error"><TriangleAlert size={18} />{error}</div>
      : runs.length ? <div className="recent-runs-list">{runs.map((run) => {
        const findings = findingsFrom(detail);
        return <article key={run.request_id} className={`run-${run.status || 'completed'}`}>
          <button className="recent-run-summary" onClick={() => void toggleDetail(run)}>
            <div className="history-result-icon"><ShieldCheck size={17} /></div>
            <div><strong>{run.context_manifest?.project_name || run.request_id}</strong><span>{profileLabel(run.profile)} · {run.summary?.ran_through || run.kind}</span><small><Clock3 size={12} />{run.timestamp || 'Time unavailable'} · {run.summary?.total || 0} findings · ${Number(run.usage?.est_cost_usd || 0).toFixed(4)}</small>{run.error && <small className="run-error">{run.error}</small>}</div>
            <em>{run.status || 'completed'}</em><ChevronDown className={openId === run.request_id ? 'open' : ''} size={16} />
          </button>
          {openId === run.request_id && <div className="recent-run-detail">
            {detailLoading ? <div className="recent-runs-state"><LoaderCircle className="spinner" size={18} /> Loading details…</div>
              : detailError ? <div className="recent-runs-state error"><TriangleAlert size={17} />{detailError}</div>
              : detail ? <>{detail.stages?.length ? <div className="history-stage-strip">{detail.stages.map((stage) => <span key={stage.stage}>{stage.stage}: <strong>{stage.status}</strong>{stage.latency_ms !== undefined ? ` · ${stage.latency_ms} ms` : ''}</span>)}</div> : null}<HistoryEvidenceImage imageUrl={evidenceUrl} findings={findings} imageExpected={evidenceExpected} />{findings.length ? <div className="history-finding-list">{findings.map((finding, index) => <div key={finding.id || index}><em>{finding.severity || 'review'}</em><span><strong>{finding.category || 'Finding'}</strong>{finding.description}<small>{finding.verification_status ? `Evidence: ${finding.verification_status.replaceAll('_', ' ')}` : 'Human review required'}{typeof finding.confidence_score === 'number' ? ` · ${Math.round(finding.confidence_score)}% confidence` : typeof finding.visual_confidence_score === 'number' ? ` · ${Math.round(finding.visual_confidence_score)}% visual confidence` : ''}</small>{finding.verification_reason && <small>{finding.verification_reason}</small>}{finding.citations?.map((citation, citationIndex) => <cite key={citationIndex}><strong>{citation.section || citation.source_doc || 'Supporting source'}</strong>{citation.excerpt || ''}</cite>)}</span></div>)}</div> : <div className="recent-runs-state"><ShieldCheck size={20} />No findings were stored for this run.</div>}</> : null}
          </div>}
        </article>;
      })}</div>
      : <div className="recent-runs-state"><FileSearch size={21} /><span>No previous runs for this scope.</span></div>}
  </section>;
}
