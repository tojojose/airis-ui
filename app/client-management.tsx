'use client';

import { Archive, Building2, ChevronRight, History, LoaderCircle, Pencil, Plus, Power, Save, Settings2, ShieldCheck, TriangleAlert, Workflow, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type AirisAuthState } from './clerk-auth';
import type { InspectionProject } from './pipeline-run';
import { budgetPayload, money, type BudgetPeriod, type ClientRecord, type ProjectTemplate } from './portfolio-types';
import { RecentRuns } from './recent-runs';

type Dialog = 'client' | 'client-edit' | 'project' | 'context' | null;
const emptyClient = { org_id: '', name: '', countries: '', industries: '', amount: '', period: 'monthly' as BudgetPeriod };
const emptyProject = { name: '', project_type: 'road_work_zone', country_code: 'US', state_code: '', county: '', municipality: '', site_address: '', amount: '', period: 'monthly' as BudgetPeriod };

export function ClientManagement({ auth, onInspect, onHistory }: { auth: AirisAuthState; onInspect: (orgId: string, projectId: string) => void; onHistory: (orgId: string, projectId: string) => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [projects, setProjects] = useState<InspectionProject[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [editing, setEditing] = useState<InspectionProject | null>(null);

  async function request(path: string, options: RequestInit = {}) {
    const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Airis administrator.');
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const payload = await response.json().catch(() => null) as ({ detail?: string } & Record<string, unknown>) | null;
    if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status}).`);
    return payload;
  }

  useEffect(() => { void (async () => {
    setLoading(true);
    try {
      const [c, t] = await Promise.all([request('/v1/admin/clients'), request('/v1/admin/project-templates')]);
      const loaded = (c as unknown as { clients: ClientRecord[] }).clients || [];
      setClients(loaded.filter((client) => Boolean(client.org_id?.trim() && client.name?.trim())));
      setTemplates((t as unknown as { templates: ProjectTemplate[] }).templates || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load portfolios.'); }
    finally { setLoading(false); }
  })(); }, []);

  async function openClient(client: ClientRecord) {
    setSelected(client); setProjects([]); setLoading(true); setError(null);
    try { setProjects(((await request(`/v1/admin/clients/${encodeURIComponent(client.org_id)}/projects`)) as unknown as { projects: InspectionProject[] }).projects || []); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load projects.'); }
    finally { setLoading(false); }
  }

  async function createClient() {
    setSaving(true); setError(null);
    try {
      const created = await request('/v1/admin/clients', { method: 'POST', body: JSON.stringify({ org_id: clientForm.org_id.trim(), name: clientForm.name.trim(), status: 'active', countries: split(clientForm.countries, true), industries: split(clientForm.industries), budget: budgetPayload(clientForm.amount, clientForm.period) }) }) as unknown as ClientRecord;
      setClients((all) => [...all, created]); setDialog(null); setClientForm(emptyClient);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create client.'); }
    finally { setSaving(false); }
  }

  async function updateClient() {
    if (!selected) return; setSaving(true); setError(null);
    try {
      const updated = await request(`/v1/admin/clients/${encodeURIComponent(selected.org_id)}`, { method: 'PATCH', body: JSON.stringify({ name: clientForm.name.trim(), countries: split(clientForm.countries, true), industries: split(clientForm.industries), budget: budgetPayload(clientForm.amount, clientForm.period) }) }) as unknown as ClientRecord;
      setClients((all) => all.map((item) => item.org_id === updated.org_id ? updated : item)); setSelected(updated); setDialog(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not update client.'); }
    finally { setSaving(false); }
  }

  async function createProject() {
    if (!selected) return;
    if (!projectForm.name.trim()) { setError('Enter a project name before saving.'); return; }
    setSaving(true); setError(null);
    try {
      const created = await request(`/v1/admin/clients/${encodeURIComponent(selected.org_id)}/projects`, { method: 'POST', body: JSON.stringify({ name: projectForm.name.trim(), project_type: projectForm.project_type, status: 'draft', country_code: projectForm.country_code, state_code: projectForm.state_code, county: projectForm.county, municipality: projectForm.municipality, site_address: projectForm.site_address, budget: budgetPayload(projectForm.amount, projectForm.period) }) }) as unknown as InspectionProject;
      setProjects((all) => [...all, created]); setDialog(null); setProjectForm(emptyProject);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not create project.'); }
    finally { setSaving(false); }
  }

  async function patchClient(client: ClientRecord, status = client.status === 'active' ? 'disabled' : 'active') {
    if (!client.org_id?.trim()) { setError('This entry is not a valid client and cannot be changed. Refresh the page to remove it.'); return; }
    try { const updated = await request(`/v1/admin/clients/${encodeURIComponent(client.org_id)}`, { method: 'PATCH', body: JSON.stringify({ status }) }) as unknown as ClientRecord;
      setClients((all) => all.map((item) => item.org_id === updated.org_id ? updated : item)); if (selected?.org_id === updated.org_id) setSelected(updated);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not change client status.'); }
  }

  async function patchProject(project: InspectionProject, changes: Record<string, unknown>) {
    if (!selected) return; const updated = await request(`/v1/admin/clients/${encodeURIComponent(selected.org_id)}/projects/${encodeURIComponent(project.project_id)}`, { method: 'PATCH', body: JSON.stringify(changes) }) as unknown as InspectionProject;
    setProjects((all) => all.map((item) => item.project_id === updated.project_id ? updated : item)); return updated;
  }

  async function saveContext() {
    if (!editing) return; setSaving(true);
    try { await patchProject(editing, editing as unknown as Record<string, unknown>); setDialog(null); setEditing(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save context.'); }
    finally { setSaving(false); }
  }

  const template = templates.find((item) => item.project_type === projectForm.project_type);
  function editClient(client: ClientRecord) { setSelected(client); setClientForm({ org_id: client.org_id, name: client.name, countries: (client.countries || []).join(', '), industries: (client.industries || []).join(', '), amount: client.budget ? String(client.budget.amount) : '', period: client.budget?.period || 'monthly' }); setDialog('client-edit'); }
  function archiveClient(client: ClientRecord) { if (window.confirm(`Archive ${client.name}? Operational inspections will stop, but all history will be retained.`)) void patchClient(client, 'archived'); }
  function archiveProject(project: InspectionProject) { if (window.confirm(`Archive ${project.name}? Its inspection history will remain available.`)) void patchProject(project, { status: 'archived' }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not archive project.')); }
  return <div className="admin-page portfolio-page">
    <header className="admin-heading"><div><p className="kicker">CLIENT PORTFOLIOS</p><h1>{selected ? selected.name : 'Clients & Projects'}</h1><p>{selected ? 'Manage projects, availability, and approved inspection context.' : 'Onboard clients and control operational availability.'}</p></div><div className="portfolio-heading-actions">{selected && <><button className="secondary-button" onClick={() => { setSelected(null); setProjects([]); }}>All clients</button><button className="secondary-button" onClick={() => editClient(selected)}><Pencil size={15} /> Edit client</button><button className="secondary-button" onClick={() => void patchClient(selected)}><Power size={15} /> {selected.status === 'active' ? 'Disable' : 'Enable'}</button></>}<button className="primary-button" onClick={() => setDialog(selected ? 'project' : 'client')}><Plus size={16} />{selected ? 'Add project' : 'Add client'}</button></div></header>
    {error && <div className="history-state error"><TriangleAlert size={22} />{error}</div>}
    {loading ? <div className="history-state"><LoaderCircle className="spinner" size={28} /> Loading…</div> : !selected ? <section className="portfolio-grid managed-grid">{clients.map((client) => <article key={client.org_id}><button className="portfolio-open" onClick={() => void openClient(client)}><div className="row-avatar"><Building2 size={19} /></div><span><strong>{client.name}</strong><small>{[...(client.industries || []), ...(client.countries || [])].join(' · ') || client.org_id}</small></span><em className={`record-status ${client.status}`}>{client.status}</em><ChevronRight size={18} /></button><footer><span>{client.budget ? `${money(client.budget.amount)} / ${client.budget.period}` : 'No budget configured'}</span><div className="management-actions"><button onClick={() => editClient(client)}><Pencil size={14} />Edit</button><button onClick={() => void patchClient(client)}><Power size={14} />{client.status === 'active' ? 'Disable' : 'Enable'}</button><button className="archive-action" onClick={() => archiveClient(client)}><Archive size={14} />Archive</button></div></footer></article>)}</section> : <section className="project-grid">{projects.map((project) => <article key={project.project_id} className={project.status !== 'active' ? 'is-disabled' : ''}><div className="project-card-heading"><div className="row-avatar"><ShieldCheck size={19} /></div><div><strong>{project.name}</strong><span>{[project.municipality, project.state_code, project.country_code].filter(Boolean).join(', ') || 'Geography not configured'}</span></div><em className={`record-status ${project.status}`}>{project.status}</em></div><dl><div><dt>Type</dt><dd>{project.project_type?.replaceAll('_', ' ') || 'General'}</dd></div><div><dt>Industry</dt><dd>{project.industry || 'Not configured'}</dd></div><div><dt>Profiles</dt><dd>{project.inspection_profiles?.length || 0}</dd></div></dl><div className="project-card-actions"><button disabled={project.status !== 'active' || selected.status !== 'active'} onClick={() => onInspect(project.org_id, project.project_id)}><Workflow size={15} /> Inspect</button><button onClick={() => onHistory(project.org_id, project.project_id)}><History size={15} /> History</button><button onClick={() => { setEditing({ ...project }); setDialog('context'); }}><Settings2 size={15} /> Edit project</button><button onClick={() => void patchProject(project, { status: project.status === 'active' ? 'disabled' : 'active' })}><Power size={15} />{project.status === 'active' ? 'Disable' : 'Enable'}</button><button className="archive-action" onClick={() => archiveProject(project)}><Archive size={15} /> Archive</button></div></article>)}</section>}
    {dialog === 'client' && <Modal title="Onboard a client" close={() => setDialog(null)} save={() => void createClient()} saving={saving} disabled={!clientForm.name || !clientForm.org_id}><div className="context-form-grid"><Text label="Client name" value={clientForm.name} set={(name) => setClientForm({ ...clientForm, name })} /><Text label="Clerk organization ID" value={clientForm.org_id} set={(org_id) => setClientForm({ ...clientForm, org_id })} placeholder="org_…" /><Text wide label="Countries" value={clientForm.countries} set={(countries) => setClientForm({ ...clientForm, countries })} placeholder="US, CA" /><Text wide label="Industries" value={clientForm.industries} set={(industries) => setClientForm({ ...clientForm, industries })} placeholder="construction, warehousing" /><BudgetFields value={clientForm} setValue={setClientForm} /></div></Modal>}
    {dialog === 'client-edit' && selected && <Modal title={`Edit ${selected.name}`} close={() => setDialog(null)} save={() => void updateClient()} saving={saving} disabled={!clientForm.name}><div className="context-form-grid"><Text label="Client name" value={clientForm.name} set={(name) => setClientForm({ ...clientForm, name })} /><label><span>Clerk organization ID</span><input value={clientForm.org_id} disabled /></label><Text wide label="Countries" value={clientForm.countries} set={(countries) => setClientForm({ ...clientForm, countries })} /><Text wide label="Industries" value={clientForm.industries} set={(industries) => setClientForm({ ...clientForm, industries })} /><BudgetFields value={clientForm} setValue={setClientForm} /></div></Modal>}
    {dialog === 'project' && selected && <Modal title={`Add a project to ${selected.name}`} close={() => setDialog(null)} save={() => void createProject()} saving={saving} disabled={!projectForm.name}><div className="context-form-grid"><Text wide label="Project name" value={projectForm.name} set={(name) => setProjectForm({ ...projectForm, name })} /><label className="wide"><span>Project type</span><select value={projectForm.project_type} onChange={(e) => setProjectForm({ ...projectForm, project_type: e.target.value })}>{templates.map((item) => <option key={item.project_type} value={item.project_type}>{item.label}</option>)}</select></label>{template && <div className="template-preview wide"><strong>{template.label} defaults</strong><span>{[template.industry, template.domain, ...template.activity_tags].join(' · ')}</span><small>Defaults remain editable after creation.</small></div>}<Text label="Country" value={projectForm.country_code} set={(country_code) => setProjectForm({ ...projectForm, country_code: country_code.toUpperCase() })} /><Text label="State / province" value={projectForm.state_code} set={(state_code) => setProjectForm({ ...projectForm, state_code: state_code.toUpperCase() })} /><Text label="County" value={projectForm.county} set={(county) => setProjectForm({ ...projectForm, county })} /><Text label="Municipality" value={projectForm.municipality} set={(municipality) => setProjectForm({ ...projectForm, municipality })} /><Text wide label="Site address" value={projectForm.site_address} set={(site_address) => setProjectForm({ ...projectForm, site_address })} /><BudgetFields value={projectForm} setValue={setProjectForm} /></div></Modal>}
    {dialog === 'context' && editing && <Modal title={editing.name} close={() => setDialog(null)} save={() => void saveContext()} saving={saving} disabled={!(editing.inspection_profiles || []).length}><div className="context-form-grid"><Text wide label="Site address" value={editing.site_address || ''} set={(site_address) => setEditing({ ...editing, site_address })} /><Text label="Country" value={editing.country_code || ''} set={(country_code) => setEditing({ ...editing, country_code: country_code.toUpperCase() })} /><Text label="State" value={editing.state_code || ''} set={(state_code) => setEditing({ ...editing, state_code: state_code.toUpperCase() })} /><Text label="County" value={editing.county || ''} set={(county) => setEditing({ ...editing, county })} /><Text label="Municipality" value={editing.municipality || ''} set={(municipality) => setEditing({ ...editing, municipality })} /><Text label="Industry" value={editing.industry || ''} set={(industry) => setEditing({ ...editing, industry })} /><Text label="Domain" value={editing.domain || ''} set={(domain) => setEditing({ ...editing, domain })} /><Text wide label="Activity tags" value={(editing.activity_tags || []).join(', ')} set={(value) => setEditing({ ...editing, activity_tags: split(value) })} /><Text wide label="Authorities" value={(editing.governing_authorities || []).join(', ')} set={(value) => setEditing({ ...editing, governing_authorities: split(value) })} /><Text wide label="Required PPE" value={(editing.required_ppe || []).join(', ')} set={(value) => setEditing({ ...editing, required_ppe: split(value) })} /></div></Modal>}
    {selected && !loading && <RecentRuns auth={auth} purpose="operational" orgId={selected.org_id} />}
  </div>;
}

function split(value: string, upper = false) { return value.split(',').map((item) => upper ? item.trim().toUpperCase() : item.trim()).filter(Boolean); }
function Text({ label, value, set, wide, placeholder }: { label: string; value: string; set: (value: string) => void; wide?: boolean; placeholder?: string }) { return <label className={wide ? 'wide' : ''}><span>{label}</span><input value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} /></label>; }
function BudgetFields<T extends { amount: string; period: BudgetPeriod }>({ value, setValue }: { value: T; setValue: (value: T) => void }) { const n = Number(value.amount || 0); const annual = value.period === 'hourly' ? n * 8766 : value.period === 'daily' ? n * 365.25 : value.period === 'monthly' ? n * 12 : n; return <><label><span>Budget amount (optional)</span><input type="number" min="0" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} /></label><label><span>Budget period</span><select value={value.period} onChange={(e) => setValue({ ...value, period: e.target.value as BudgetPeriod })}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>{value.amount && <div className="template-preview wide"><strong>Equivalent budget</strong><span>{money(annual / 8766)} hourly · {money(annual / 365.25)} daily · {money(annual / 12)} monthly · {money(annual)} yearly</span><small>Notify-only policy; inspections are not automatically stopped.</small></div>}</>; }
function Modal({ title, close, save, saving, disabled, children }: { title: string; close: () => void; save: () => void; saving: boolean; disabled: boolean; children: React.ReactNode }) { return <div className="context-editor-backdrop"><section className="context-editor" role="dialog" aria-modal="true"><header><div><p className="kicker">CLIENT PORTFOLIOS</p><h2>{title}</h2><p>Defaults and budgets remain editable after creation.</p></div><button onClick={close}><X size={19} /></button></header>{children}{disabled && <p className="form-guidance">Complete the required fields above to enable Save.</p>}<footer><button className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving || disabled} onClick={save}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />} Save</button></footer></section></div>; }
