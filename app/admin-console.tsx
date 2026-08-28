'use client';

import { BookOpenText, Bot, Building2, CircleDollarSign, FilePenLine, LoaderCircle, RefreshCw, ShieldAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';

export type AdminView = 'clients' | 'knowledge' | 'prompts' | 'models' | 'usage';
type JsonRecord = Record<string, unknown>;

const viewConfig: Record<AdminView, { eyebrow: string; title: string; description: string; endpoint: string; collection: string; icon: typeof Building2 }> = {
  clients: { eyebrow: 'TENANT GOVERNANCE', title: 'Clients & Projects', description: 'Onboard organizations, control project access, and see each customer deployment.', endpoint: '/v1/admin/clients', collection: 'clients', icon: Building2 },
  knowledge: { eyebrow: 'GROUNDING SOURCES', title: 'Knowledge Base', description: 'Track the documents used to ground policy and compliance findings.', endpoint: '/v1/admin/kb/documents', collection: 'documents', icon: BookOpenText },
  prompts: { eyebrow: 'VISION BEHAVIOR', title: 'Prompt Library', description: 'Review immutable prompt versions used by inspection profiles.', endpoint: '/v1/prompts', collection: 'prompts', icon: FilePenLine },
  models: { eyebrow: 'MODEL GOVERNANCE', title: 'Model Catalog', description: 'Review enabled Bedrock models, tiers, and platform pricing.', endpoint: '/v1/admin/models', collection: 'models', icon: Bot },
  usage: { eyebrow: 'PLATFORM ECONOMICS', title: 'Usage & Cost', description: 'Monitor request volume, token consumption, and estimated model cost.', endpoint: '/v1/admin/usage?scope=global', collection: 'months', icon: CircleDollarSign },
};

function text(value: unknown, fallback = '—') { return typeof value === 'string' && value ? value : fallback; }
function countLabel(count: number, view: AdminView) {
  const labels: Record<AdminView, string> = { clients: 'organizations', knowledge: 'documents', prompts: 'prompts', models: 'models', usage: 'months tracked' };
  return `${count} ${labels[view]}`;
}

export function AdminConsole({ view, organizationName }: { view: AdminView; organizationName: string }) {
  const config = viewConfig[view];
  const Icon = config.icon;
  const [data, setData] = useState<JsonRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true); setError(null);
      try {
        const token = await getClerkToken(true);
        if (!token) throw new Error('Sign in and select Airis Admin to load this page.');
        const response = await fetch(`${API_URL}${config.endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(response.status === 403 ? 'This organization does not have Airis administrator access.' : `Admin API returned ${response.status}.`);
        const payload = await response.json() as Record<string, unknown>;
        const collection = payload[config.collection];
        if (active) setData(Array.isArray(collection) ? collection as JsonRecord[] : []);
      } catch (caught) { if (active) setError(caught instanceof Error ? caught.message : 'Unable to load admin data.'); }
      finally { if (active) setLoading(false); }
    };
    void load();
    return () => { active = false; };
  }, [config.collection, config.endpoint, refresh]);

  const summary = useMemo(() => countLabel(data.length, view), [data.length, view]);

  return (
    <div className="admin-page">
      <header className="admin-heading"><div><p className="kicker">{config.eyebrow}</p><h1>{config.title}</h1><p>{config.description}</p></div><div className="admin-heading-actions"><span className="admin-scope"><ShieldAlert size={15} /> {organizationName}</span><button onClick={() => setRefresh((value) => value + 1)} aria-label="Refresh admin data"><RefreshCw size={16} /></button></div></header>
      <div className="admin-metric-row"><article><span>Current scope</span><strong>Global platform</strong><small>Airis administrator access</small></article><article><span>Live records</span><strong>{loading ? 'Loading…' : summary}</strong><small>Read from the Trominos API</small></article><article><span>Authorization</span><strong>Clerk organization</strong><small>Backend-enforced permissions</small></article></div>
      <section className="admin-table-card">
        <div className="admin-table-title"><div className="admin-table-icon"><Icon size={20} /></div><div><strong>{config.title}</strong><span>Live configuration</span></div></div>
        {loading ? <div className="admin-state"><LoaderCircle className="spinner" size={25} /><p>Loading administrator data…</p></div> : error ? <div className="admin-state error"><ShieldAlert size={25} /><p>{error}</p><button onClick={() => setRefresh((value) => value + 1)}>Try again</button></div> : <AdminRows view={view} rows={data} />}
      </section>
    </div>
  );
}

function AdminRows({ view, rows }: { view: AdminView; rows: JsonRecord[] }) {
  if (!rows.length) return <div className="admin-state"><p>No records are configured yet.</p></div>;
  if (view === 'clients') return <div className="admin-rows">{rows.map((row, index) => <article key={text(row.org_id, String(index))}><div className="row-avatar"><Building2 size={18} /></div><div><strong>{text(row.name, 'Unnamed organization')}</strong><span>{text(row.org_id)}</span></div><em className={`record-status ${text(row.status, 'unknown').toLowerCase()}`}>{text(row.status, 'unknown')}</em></article>)}</div>;
  if (view === 'knowledge') return <div className="admin-rows">{rows.map((row, index) => <article key={text(row.key, String(index))}><div className="row-avatar"><BookOpenText size={18} /></div><div><strong>{text(row.key, 'Untitled document').replace(/^kb-docs\//, '')}</strong><span>{typeof row.size === 'number' ? `${Math.max(1, Math.round(row.size / 1024))} KB` : 'Knowledge source'}</span></div><em className={`record-status ${text(row.status, 'unknown').toLowerCase()}`}>{text(row.status, 'unknown')}</em></article>)}</div>;
  if (view === 'prompts') return <div className="admin-rows">{rows.map((row, index) => <article key={text(row.name, String(index))}><div className="row-avatar"><FilePenLine size={18} /></div><div><strong>{text(row.name, 'Untitled prompt')}</strong><span>{text(row.updated_at, 'Versioned prompt')}</span></div><em className="record-status active">versioned</em></article>)}</div>;
  if (view === 'models') return <div className="admin-rows">{rows.map((row, index) => <article key={text(row.model_id, String(index))}><div className="row-avatar"><Bot size={18} /></div><div><strong>{text(row.label, 'Vision model')}</strong><span>{text(row.model_id)}</span></div><em className={`record-status ${row.enabled === false ? 'disabled' : 'active'}`}>{row.enabled === false ? 'disabled' : text(row.tier, 'enabled')}</em></article>)}</div>;
  return <div className="admin-rows">{rows.map((row, index) => <article key={text(row.month, String(index))}><div className="row-avatar"><CircleDollarSign size={18} /></div><div><strong>{text(row.month, 'Usage period')}</strong><span>{Number(row.requests ?? 0).toLocaleString()} requests · {Number(row.input_tokens ?? 0).toLocaleString()} input tokens</span></div><em className="usage-cost">${Number(row.est_cost_usd ?? 0).toFixed(2)}</em></article>)}</div>;
}
