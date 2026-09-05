'use client';

import { Archive, Building2, ChevronRight, History, LoaderCircle, Pencil, Plus, Power, Save, Settings2, ShieldCheck, TriangleAlert, Workflow, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type VisinexaAuthState } from './clerk-auth';
import type { InspectionProject } from './pipeline-run';
import { budgetPayload, money, type BudgetPeriod, type ClientRecord, type ProjectTemplate } from './portfolio-types';
import { RecentRuns } from './recent-runs';
import { profileLabel } from './inspection-profiles';
import { ProfileConfiguration } from './profile-configuration';

type Dialog = 'client' | 'client-edit' | 'project' | 'context' | null;
const emptyClient = { org_id: '', name: '', initial_admin_email: '', countries: '', industries: '', amount: '', period: 'monthly' as BudgetPeriod };
const emptyProject = { name: '', project_type: 'road_work_zone', country_code: 'US', state_code: '', county: '', municipality: '', site_address: '', amount: '', period: 'monthly' as BudgetPeriod };
const countrySuggestions = ['US', 'CA', 'MX', 'GB', 'AU', 'DE', 'FR', 'IN', 'JP', 'BR'];
const subdivisionSuggestions: Record<string, string[]> = {
  US: 'AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC AS GU MP PR VI'.split(' '),
  CA: 'AB BC MB NB NL NS NT NU ON PE QC SK YT'.split(' '),
  AU: 'ACT NSW NT QLD SA TAS VIC WA'.split(' '),
};

export function ClientManagement({ auth, onInspect, onHistory }: { auth: VisinexaAuthState; onInspect: (orgId: string, projectId: string) => void; onHistory: (orgId: string, projectId: string) => void }) {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [selected, setSelected] = useState<ClientRecord | null>(null);
  const [projects, setProjects] = useState<InspectionProject[]>([]);
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [clientForm, setClientForm] = useState(emptyClient);
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [editing, setEditing] = useState<InspectionProject | null>(null);

  async function request(path: string, options: RequestInit = {}) {
    const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Visinexa administrator.');
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const payload = await response.json().catch(() => null) as ({ detail?: unknown } & Record<string, unknown>) | null;
    if (!response.ok) throw new Error(apiError(payload?.detail, response.status));
    return payload;
  }

  async function reloadClients() {
    const payload = await request('/v1/admin/clients') as unknown as { clients: ClientRecord[] };
    const loaded = (payload.clients || []).filter((client) => Boolean(client.org_id?.trim() && client.name?.trim()));
    setClients(loaded);
    return loaded;
  }

  useEffect(() => { void (async () => {
    setLoading(true);
    try {
      const [, t] = await Promise.all([reloadClients(), request('/v1/admin/project-templates')]);
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
    setSaving(true); setError(null); setNotice(null);
    try {
      await request('/v1/admin/clients', { method: 'POST', body: JSON.stringify({ name: clientForm.name.trim(), initial_admin_email: clientForm.initial_admin_email.trim(), status: 'active', countries: split(clientForm.countries, true), industries: split(clientForm.industries), budget: budgetPayload(clientForm.amount, clientForm.period) }) });
      await reloadClients(); setDialog(null); setNotice(`${clientForm.name.trim()} was added successfully.`); setClientForm(emptyClient);
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
      const created = await request(`/v1/admin/clients/${encodeURIComponent(selected.org_id)}/projects`, { method: 'POST', body: JSON.stringify({ name: projectForm.name.trim(), project_type: projectForm.project_type, status: 'active', country_code: projectForm.country_code, state_code: projectForm.state_code, county: projectForm.county, municipality: projectForm.municipality, site_address: projectForm.site_address, budget: budgetPayload(projectForm.amount, projectForm.period) }) }) as unknown as InspectionProject;
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
    const editable = {
      name: editing.name, project_type: editing.project_type, site_address: editing.site_address,
      country_code: editing.country_code, state_code: editing.state_code, county: editing.county,
      municipality: editing.municipality, industry: editing.industry, domain: editing.domain,
      activity_tags: editing.activity_tags, governing_authorities: editing.governing_authorities,
      required_ppe: editing.required_ppe, inspection_profiles: editing.inspection_profiles,
      default_inspection_profile: editing.default_inspection_profile,
    };
    try { await patchProject(editing, editable); setDialog(null); setEditing(null); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not save context.'); }
    finally { setSaving(false); }
  }

  const template = templates.find((item) => item.project_type === projectForm.project_type);
  function editClient(client: ClientRecord) { setSelected(client); setClientForm({ org_id: client.org_id, name: client.name, initial_admin_email: '', countries: (client.countries || []).join(', '), industries: (client.industries || []).join(', '), amount: client.budget ? String(client.budget.amount) : '', period: client.budget?.period || 'monthly' }); setDialog('client-edit'); }
  function archiveClient(client: ClientRecord) { if (window.confirm(`Archive ${client.name}? Operational inspections will stop, but all history will be retained.`)) void patchClient(client, 'archived'); }
  function archiveProject(project: InspectionProject) { if (window.confirm(`Archive ${project.name}? Its inspection history will remain available.`)) void patchProject(project, { status: 'archived' }).catch((caught) => setError(caught instanceof Error ? caught.message : 'Could not archive project.')); }
  return <div className="admin-page portfolio-page">
    <header className="admin-heading"><div><p className="kicker">CLIENT PORTFOLIOS</p><h1>{selected ? selected.name : 'Clients & Projects'}</h1><p>{selected ? 'Manage projects, availability, and approved inspection context.' : 'Onboard clients and control operational availability.'}</p></div><div className="portfolio-heading-actions">{selected && <><button className="secondary-button" onClick={() => { setSelected(null); setProjects([]); }}>All clients</button>{selected.status !== 'archived' && <><button className="secondary-button" onClick={() => editClient(selected)}><Pencil size={15} /> Edit client</button><button className="secondary-button" onClick={() => void patchClient(selected)}><Power size={15} /> {selected.status === 'active' ? 'Disable' : 'Enable'}</button></>}</>}{(!selected || selected.status === 'active') && <button className="primary-button" onClick={() => setDialog(selected ? 'project' : 'client')}><Plus size={16} />{selected ? 'Add project' : 'Add client'}</button>}</div></header>
    {error && <div className="history-state error"><TriangleAlert size={22} />{error}</div>}
    {notice && <div className="history-state success">{notice}</div>}
    {loading ? <div className="history-state"><LoaderCircle className="spinner" size={28} /> Loading…</div> : !selected ? <section className="portfolio-grid managed-grid">{clients.map((client) => <article key={client.org_id}><button className="portfolio-open" onClick={() => void openClient(client)}><div className="row-avatar"><Building2 size={19} /></div><span><strong>{client.name}</strong><small>{[...(client.industries || []), ...(client.countries || [])].join(' · ') || client.org_id}</small></span><em className={`record-status ${client.status}`}>{client.status}</em><ChevronRight size={18} /></button><footer><span>{client.budget ? `${money(client.budget.amount)} / ${client.budget.period}` : 'No budget configured'}</span><div className="management-actions">{client.status === 'archived' ? <span>View only</span> : <><button onClick={() => editClient(client)}><Pencil size={14} />Edit</button><button onClick={() => void patchClient(client)}><Power size={14} />{client.status === 'active' ? 'Disable' : 'Enable'}</button><button className="archive-action" onClick={() => archiveClient(client)}><Archive size={14} />Archive</button></>}</div></footer></article>)}</section> : <section className="project-grid">{projects.map((project) => <article key={project.project_id} className={project.status !== 'active' ? 'is-disabled' : ''}><div className="project-card-heading"><div className="row-avatar"><ShieldCheck size={19} /></div><div><strong>{project.name}</strong><span>{[project.municipality, project.state_code, project.country_code].filter(Boolean).join(', ') || 'Geography not configured'}</span></div><em className={`record-status ${project.status}`}>{project.status}</em></div><dl><div><dt>Type</dt><dd>{project.project_type?.replaceAll('_', ' ') || 'General'}</dd></div><div><dt>Industry</dt><dd>{project.industry || 'Not configured'}</dd></div><div><dt>Default profile</dt><dd>{profileLabel(project.default_inspection_profile)}</dd></div></dl><div className="project-card-actions">{project.status === 'active' && <><button disabled={selected.status !== 'active'} onClick={() => onInspect(project.org_id, project.project_id)}><Workflow size={15} /> Inspect</button><button onClick={() => onHistory(project.org_id, project.project_id)}><History size={15} /> History</button><button onClick={() => { setEditing({ ...project }); setDialog('context'); }}><Settings2 size={15} /> Edit project</button><button onClick={() => void patchProject(project, { status: 'disabled' })}><Power size={15} />Disable</button><button className="archive-action" onClick={() => archiveProject(project)}><Archive size={15} /> Archive</button></>}{project.status === 'disabled' && <button onClick={() => void patchProject(project, { status: 'active' })}><Power size={15} />Enable</button>}{project.status === 'archived' && <><button onClick={() => onHistory(project.org_id, project.project_id)}><History size={15} /> History</button><span>Archived · view only</span></>}</div></article>)}</section>}
    {dialog === 'client' && <Modal title="Onboard a client" close={() => setDialog(null)} save={() => void createClient()} saving={saving} disabled={!clientForm.name}><div className="context-form-grid"><Text wide label="Client name" value={clientForm.name} set={(name) => setClientForm({ ...clientForm, name })} /><Text wide label="Initial client administrator (optional)" value={clientForm.initial_admin_email} set={(initial_admin_email) => setClientForm({ ...clientForm, initial_admin_email })} placeholder="person@company.com" /><div className="template-preview wide"><strong>Approval required</strong><span>Visinexa will create the identity organization. The initial administrator will remain pending until you approve them under Identity &amp; Access.</span></div><Text wide label="Client-level country defaults (optional)" value={clientForm.countries} set={(countries) => setClientForm({ ...clientForm, countries })} placeholder="Not configured at client level" /><Text wide label="Client-level industry defaults (optional)" value={clientForm.industries} set={(industries) => setClientForm({ ...clientForm, industries })} placeholder="Not configured at client level" /><div className="template-preview wide"><strong>Defaults only</strong><span>Each project keeps its own geography and industry. These values are never copied from projects automatically.</span></div><BudgetFields value={clientForm} setValue={setClientForm} /></div></Modal>}
    {dialog === 'client-edit' && selected && <Modal title={`Edit ${selected.name}`} close={() => setDialog(null)} save={() => void updateClient()} saving={saving} disabled={!clientForm.name}><div className="context-form-grid"><Text label="Client name" value={clientForm.name} set={(name) => setClientForm({ ...clientForm, name })} /><label><span>Clerk organization ID</span><input value={clientForm.org_id} disabled /></label><Text wide label="Client-level country defaults (optional)" value={clientForm.countries} set={(countries) => setClientForm({ ...clientForm, countries })} placeholder="Not configured at client level" /><Text wide label="Client-level industry defaults (optional)" value={clientForm.industries} set={(industries) => setClientForm({ ...clientForm, industries })} placeholder="Not configured at client level" /><div className="template-preview wide"><strong>Defaults only</strong><span>Project geography, industry, and budgets are managed independently and are not copied into the client record.</span></div><BudgetFields value={clientForm} setValue={setClientForm} /></div></Modal>}
    {dialog === 'project' && selected && <Modal title={`Add a project to ${selected.name}`} close={() => setDialog(null)} save={() => void createProject()} saving={saving} disabled={!projectForm.name}><div className="context-form-grid"><Text wide label="Project name" value={projectForm.name} set={(name) => setProjectForm({ ...projectForm, name })} /><label className="wide"><span>Project type</span><select value={projectForm.project_type} onChange={(e) => setProjectForm({ ...projectForm, project_type: e.target.value })}>{templates.map((item) => <option key={item.project_type} value={item.project_type}>{item.label}</option>)}</select></label>{template && <div className="template-preview wide"><strong>{template.label} defaults</strong><span>{[template.industry, template.domain, ...template.activity_tags].join(' · ')}</span><small>Default inspection: {profileLabel(template.default_inspection_profile)} · Enabled: {template.inspection_profiles.map(profileLabel).join(' and ')}</small></div>}<Text label="Country" value={projectForm.country_code} suggestions={countrySuggestions} set={(country_code) => setProjectForm({ ...projectForm, country_code: country_code.toUpperCase(), state_code: '' })} /><Text label="State / province" value={projectForm.state_code} suggestions={subdivisionSuggestions[projectForm.country_code] || []} set={(state_code) => setProjectForm({ ...projectForm, state_code: state_code.toUpperCase() })} /><Text label="County" value={projectForm.county} set={(county) => setProjectForm({ ...projectForm, county })} /><Text label="Municipality" value={projectForm.municipality} set={(municipality) => setProjectForm({ ...projectForm, municipality })} /><Text wide label="Site address" value={projectForm.site_address} set={(site_address) => setProjectForm({ ...projectForm, site_address })} /><BudgetFields value={projectForm} setValue={setProjectForm} /></div></Modal>}
    {dialog === 'context' && editing && <Modal title={`Edit ${editing.name}`} close={() => setDialog(null)} save={() => void saveContext()} saving={saving} disabled={!editing.name.trim() || !(editing.inspection_profiles || []).length}><div className="context-form-grid"><Text wide label="Project name" value={editing.name} set={(name) => setEditing({ ...editing, name })} /><div className="template-preview wide"><strong>Project context</strong><span>These values select the relevant geography, industry, safety rules, and project knowledge during inspections.</span></div><Text wide label="Site address" value={editing.site_address || ''} set={(site_address) => setEditing({ ...editing, site_address })} /><Text label="Country" value={editing.country_code || ''} suggestions={countrySuggestions} set={(country_code) => setEditing({ ...editing, country_code: country_code.toUpperCase(), state_code: '' })} /><Text label="State" value={editing.state_code || ''} suggestions={subdivisionSuggestions[editing.country_code || ''] || []} set={(state_code) => setEditing({ ...editing, state_code: state_code.toUpperCase() })} /><Text label="County" value={editing.county || ''} set={(county) => setEditing({ ...editing, county })} /><Text label="Municipality" value={editing.municipality || ''} set={(municipality) => setEditing({ ...editing, municipality })} /><Text label="Industry" value={editing.industry || ''} set={(industry) => setEditing({ ...editing, industry })} /><Text label="Domain" value={editing.domain || ''} set={(domain) => setEditing({ ...editing, domain })} /><Text wide label="Activity tags" value={(editing.activity_tags || []).join(', ')} set={(value) => setEditing({ ...editing, activity_tags: split(value) })} /><Text wide label="Authorities" value={(editing.governing_authorities || []).join(', ')} set={(value) => setEditing({ ...editing, governing_authorities: split(value) })} /><Text wide label="Required PPE" value={(editing.required_ppe || []).join(', ')} set={(value) => setEditing({ ...editing, required_ppe: split(value) })} /><ProfileConfiguration project={editing} onChange={setEditing} /></div></Modal>}
    {selected && !loading && <RecentRuns auth={auth} purpose="operational" orgId={selected.org_id} />}
  </div>;
}

function split(value: string, upper = false) { return value.split(',').map((item) => upper ? item.trim().toUpperCase() : item.trim()).filter(Boolean); }
function apiError(detail: unknown, status: number) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => {
    const issue = item as { loc?: unknown[]; msg?: string };
    const field = issue.loc?.filter((part) => part !== 'body').join(' → ');
    return `${field ? `${field}: ` : ''}${issue.msg || 'Invalid value'}`;
  }).join(' ');
  return `Request failed (${status}).`;
}
function Text({ label, value, set, wide, placeholder, suggestions }: { label: string; value: string; set: (value: string) => void; wide?: boolean; placeholder?: string; suggestions?: string[] }) { const listId = `suggest-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`; return <label className={wide ? 'wide' : ''}><span>{label}</span><input value={value} placeholder={placeholder} list={suggestions?.length ? listId : undefined} autoComplete={suggestions?.length ? 'off' : undefined} onChange={(e) => set(e.target.value)} />{suggestions?.length ? <datalist id={listId}>{suggestions.map((item) => <option key={item} value={item} />)}</datalist> : null}</label>; }
function BudgetFields<T extends { amount: string; period: BudgetPeriod }>({ value, setValue }: { value: T; setValue: (value: T) => void }) { const n = Number(value.amount || 0); const annual = value.period === 'hourly' ? n * 8766 : value.period === 'daily' ? n * 365.25 : value.period === 'monthly' ? n * 12 : n; const invalid = value.amount !== '' && n < 5; return <><label><span>Budget amount (optional; minimum $5)</span><input type="number" min="5" step="0.01" value={value.amount} onChange={(e) => setValue({ ...value, amount: e.target.value })} />{invalid && <small className="field-error">Budget must be at least $5.00.</small>}</label><label><span>Budget period</span><select value={value.period} onChange={(e) => setValue({ ...value, period: e.target.value as BudgetPeriod })}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label>{value.amount && !invalid && <div className="template-preview wide"><strong>Equivalent budget</strong><span>{money(annual / 8766)} hourly · {money(annual / 365.25)} daily · {money(annual / 12)} monthly · {money(annual)} yearly</span><small>Project administrators are notified at 80%. New AI processing stops at 90%.</small></div>}</>; }
function Modal({ title, close, save, saving, disabled, children }: { title: string; close: () => void; save: () => void; saving: boolean; disabled: boolean; children: React.ReactNode }) {
  function validateAndSave(event: React.MouseEvent<HTMLButtonElement>) {
    const dialog = event.currentTarget.closest('[role="dialog"]');
    const invalid = dialog?.querySelector<HTMLInputElement | HTMLSelectElement>(':invalid');
    if (invalid) { invalid.reportValidity(); invalid.focus(); return; }
    save();
  }
  return <div className="context-editor-backdrop"><section className="context-editor" role="dialog" aria-modal="true"><header><div><p className="kicker">CLIENT PORTFOLIOS</p><h2>{title}</h2><p>Defaults and budgets remain editable after creation.</p></div><button onClick={close}><X size={19} /></button></header>{children}{disabled && <p className="form-guidance">Complete the required fields above to enable Save.</p>}<footer><button className="secondary-button" onClick={close}>Cancel</button><button className="primary-button" disabled={saving || disabled} onClick={validateAndSave}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />} Save</button></footer></section></div>;
}
