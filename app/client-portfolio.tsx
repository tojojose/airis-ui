'use client';

import { Building2, ChevronRight, History, LoaderCircle, Save, Settings2, ShieldCheck, TriangleAlert, Workflow, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';
import type { InspectionProject } from './pipeline-run';

type Client = { org_id: string; name: string; status: string; countries?: string[]; industries?: string[] };

export function ClientPortfolio({ onInspect, onHistory }: {
  onInspect: (orgId: string, projectId: string) => void;
  onHistory: (orgId: string, projectId: string) => void;
}) {
  const [clients, setClients] = useState<Client[]>([]);
  const [selected, setSelected] = useState<Client | null>(null);
  const [projects, setProjects] = useState<InspectionProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<InspectionProject | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => { void (async () => {
    try {
      const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Airis administrator.');
      const response = await fetch(`${API_URL}/v1/admin/clients`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { clients?: Client[]; detail?: string };
      if (!response.ok) throw new Error(payload.detail || 'Could not load clients.');
      setClients(payload.clients || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load client portfolios.'); }
    finally { setLoading(false); }
  })(); }, []);

  async function openClient(client: Client) {
    setSelected(client); setProjects([]); setLoading(true); setError(null);
    try {
      const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Airis administrator.');
      const response = await fetch(`${API_URL}/v1/admin/clients/${encodeURIComponent(client.org_id)}/projects`, { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json() as { projects?: InspectionProject[]; detail?: string };
      if (!response.ok) throw new Error(payload.detail || 'Could not load projects.');
      setProjects(payload.projects || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load projects.'); }
    finally { setLoading(false); }
  }

  async function saveProject() {
    if (!selected || !editing) return;
    setSaving(true); setError(null);
    try {
      const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Airis administrator.');
      const response = await fetch(`${API_URL}/v1/admin/clients/${encodeURIComponent(selected.org_id)}/projects/${encodeURIComponent(editing.project_id)}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(editing),
      });
      const payload = await response.json() as InspectionProject & { detail?: string };
      if (!response.ok) throw new Error(payload.detail || 'Could not save project context.');
      setProjects((current) => current.map((project) => project.project_id === payload.project_id ? payload : project));
      setEditing(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save project context.'); }
    finally { setSaving(false); }
  }

  const csv = (value?: string[]) => (value || []).join(', ');
  const list = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);

  return <div className="admin-page portfolio-page"><header className="admin-heading"><div><p className="kicker">CLIENT PORTFOLIOS</p><h1>{selected ? selected.name : 'Clients and projects'}</h1><p>{selected ? 'Project configuration, operational inspections and project-scoped evaluation history.' : 'Choose a client to inspect its configured projects and context.'}</p></div>{selected && <button className="secondary-button" onClick={() => { setSelected(null); setProjects([]); setEditing(null); }}>All clients</button>}</header>
    {loading ? <div className="history-state"><LoaderCircle className="spinner" size={28} /> Loading portfolios…</div> : error ? <div className="history-state error"><TriangleAlert size={24} />{error}</div> : !selected ? <section className="portfolio-grid">{clients.map((client) => <button onClick={() => void openClient(client)} key={client.org_id}><div className="row-avatar"><Building2 size={19} /></div><span><strong>{client.name}</strong><small>{[...(client.industries || []), ...(client.countries || [])].join(' · ') || client.org_id}</small></span><em className={`record-status ${client.status}`}>{client.status}</em><ChevronRight size={18} /></button>)}</section> : <section className="project-grid">{projects.map((project) => <article key={project.project_id}><div className="project-card-heading"><div className="row-avatar"><ShieldCheck size={19} /></div><div><strong>{project.name}</strong><span>{[project.municipality, project.state_code, project.country_code].filter(Boolean).join(', ') || 'Geography not configured'}</span></div><em className={`record-status ${project.status}`}>{project.status}</em></div><dl><div><dt>Industry</dt><dd>{project.industry || 'Not configured'}</dd></div><div><dt>Domain</dt><dd>{project.domain || 'Automatic routing'}</dd></div><div><dt>Profiles</dt><dd>{project.inspection_profiles?.length || 2}</dd></div></dl><div className="project-card-actions"><button onClick={() => onInspect(project.org_id, project.project_id)}><Workflow size={15} /> New inspection</button><button onClick={() => onHistory(project.org_id, project.project_id)}><History size={15} /> History</button><button onClick={() => setEditing({ ...project })}><Settings2 size={15} /> Configure context</button></div></article>)}</section>}
    {editing && <div className="context-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}><section className="context-editor" role="dialog" aria-modal="true" aria-label="Configure project context"><header><div><p className="kicker">PROJECT CONTEXT</p><h2>{editing.name}</h2><p>These approved attributes determine routing, knowledge filters and project overlays.</p></div><button onClick={() => setEditing(null)} aria-label="Close"><X size={19} /></button></header><div className="context-form-grid">
      <label className="wide"><span>Site address</span><input value={editing.site_address || ''} onChange={(event) => setEditing({ ...editing, site_address: event.target.value })} /></label>
      <label><span>Country code</span><input value={editing.country_code || ''} onChange={(event) => setEditing({ ...editing, country_code: event.target.value.toUpperCase() })} /></label><label><span>State / province</span><input value={editing.state_code || ''} onChange={(event) => setEditing({ ...editing, state_code: event.target.value.toUpperCase() })} /></label><label><span>County</span><input value={editing.county || ''} onChange={(event) => setEditing({ ...editing, county: event.target.value })} /></label><label><span>Municipality</span><input value={editing.municipality || ''} onChange={(event) => setEditing({ ...editing, municipality: event.target.value })} /></label>
      <label><span>Industry</span><input value={editing.industry || ''} onChange={(event) => setEditing({ ...editing, industry: event.target.value })} /></label><label><span>Project domain</span><input value={editing.domain || ''} onChange={(event) => setEditing({ ...editing, domain: event.target.value })} /></label>
      <label className="wide"><span>Activity / hazard tags</span><input value={csv(editing.activity_tags)} onChange={(event) => setEditing({ ...editing, activity_tags: list(event.target.value) })} placeholder="traffic_exposure, excavation" /></label><label className="wide"><span>Governing authorities</span><input value={csv(editing.governing_authorities)} onChange={(event) => setEditing({ ...editing, governing_authorities: list(event.target.value) })} /></label><label className="wide"><span>Required PPE</span><input value={csv(editing.required_ppe)} onChange={(event) => setEditing({ ...editing, required_ppe: list(event.target.value) })} /></label>
      <label><span>Effective on</span><input type="date" value={editing.effective_on || ''} onChange={(event) => setEditing({ ...editing, effective_on: event.target.value })} /></label><label><span>Project KB ID</span><input value={editing.project_kb_id || ''} onChange={(event) => setEditing({ ...editing, project_kb_id: event.target.value })} /></label>
      <fieldset className="wide"><legend>Enabled profiles</legend>{(['visual_safety', 'regulatory_compliance'] as const).map((profile) => <label key={profile}><input type="checkbox" checked={(editing.inspection_profiles || []).includes(profile)} onChange={(event) => setEditing({ ...editing, inspection_profiles: event.target.checked ? [...(editing.inspection_profiles || []), profile] : (editing.inspection_profiles || []).filter((item) => item !== profile) })} /> {profile === 'visual_safety' ? 'Visual Safety Scan' : 'Regulatory Compliance'}</label>)}</fieldset>
    </div><footer><button className="secondary-button" onClick={() => setEditing(null)}>Cancel</button><button className="primary-button" disabled={saving || !(editing.inspection_profiles || []).length} onClick={() => void saveProject()}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />} Save context</button></footer></section></div>}
  </div>;
}
