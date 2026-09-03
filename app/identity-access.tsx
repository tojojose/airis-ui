'use client';

import { Check, LoaderCircle, RefreshCw, ShieldCheck, TriangleAlert, UserMinus, Users, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';
import type { ClientRecord } from './portfolio-types';

type AccessRequest = { request_id: string; org_id: string; email: string; role: string; note?: string; status: string };
type Member = { id: string; role: string; public_user_data?: { user_id?: string; identifier?: string; first_name?: string; last_name?: string } };
type Readiness = { clerk_admin_configured: boolean; webhook_configured: boolean; system_admins: number };
const roles = ['org:admin', 'org:project_manager', 'org:inspector', 'org:reviewer', 'org:viewer', 'org:billing', 'org:member'];

export function IdentityAccess() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [orgId, setOrgId] = useState('');
  const [requests, setRequests] = useState<AccessRequest[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [form, setForm] = useState({ email: '', role: 'org:member', note: '' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getClerkToken(true); if (!token) throw new Error('Sign in as an Airis administrator.');
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    const payload = await response.json().catch(() => null) as ({ detail?: string } & Record<string, unknown>) | null;
    if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status}).`);
    return payload;
  }, []);

  const load = useCallback(async (selected = orgId) => {
    setLoading(true);
    try {
      const [ready, clientData, pendingData] = await Promise.all([
        request('/v1/admin/identity/status'), request('/v1/admin/clients'),
        request(`/v1/admin/access-requests?status=pending${selected ? `&org_id=${encodeURIComponent(selected)}` : ''}`),
      ]);
      setReadiness(ready as unknown as Readiness);
      setClients((clientData as unknown as { clients: ClientRecord[] }).clients || []);
      setRequests((pendingData as unknown as { requests: AccessRequest[] }).requests || []);
      if (selected && (ready as unknown as Readiness).clerk_admin_configured) {
        const page = await request(`/v1/admin/clients/${encodeURIComponent(selected)}/members`);
        setMembers((page as unknown as { data: Member[] }).data || []);
      } else setMembers([]);
      setError(null);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load identity access.'); }
    finally { setLoading(false); }
  }, [orgId, request]);

  useEffect(() => { void load(); }, [load]);
  async function act(work: () => Promise<unknown>) { setBusy(true); setError(null); try { await work(); await load(); } catch (caught) { setError(caught instanceof Error ? caught.message : 'The change could not be completed.'); } finally { setBusy(false); } }
  async function submit() { if (!orgId || !form.email) return; await act(async () => { await request(`/v1/admin/clients/${encodeURIComponent(orgId)}/access-requests`, { method: 'POST', body: JSON.stringify(form) }); setForm({ email: '', role: 'org:member', note: '' }); }); }

  return <div className="admin-page identity-page">
    <header className="admin-heading"><div><p className="kicker">IDENTITY GOVERNANCE</p><h1>Identity &amp; Access</h1><p>Approve every new person and control their client role from Airis.</p></div><button className="secondary-button" disabled={busy} onClick={() => void act(() => request('/v1/admin/identity/reconcile', { method: 'POST' }))}><RefreshCw size={15} /> Reconcile</button></header>
    {error && <div className="history-state error"><TriangleAlert size={20} />{error}</div>}
    {readiness && <div className="identity-readiness"><span className={readiness.clerk_admin_configured ? 'ready' : 'attention'}>{readiness.clerk_admin_configured ? <Check size={14} /> : <X size={14} />} Organization management</span><span className={readiness.webhook_configured ? 'ready' : 'attention'}>{readiness.webhook_configured ? <Check size={14} /> : <X size={14} />} Identity updates</span><small>{readiness.system_admins} platform administrator(s)</small></div>}
    <section className="identity-layout">
      <aside className="identity-scope"><h2>Client organization</h2><select value={orgId} onChange={(event) => { setOrgId(event.target.value); void load(event.target.value); }}><option value="">All clients</option>{clients.map((client) => <option value={client.org_id} key={client.org_id}>{client.name}</option>)}</select><p>Select one client to request access and manage active members.</p></aside>
      <div className="identity-content">
        <article className="identity-card"><header><Users size={18} /><div><h2>Approval queue</h2><p>No invitation is sent until you approve it.</p></div></header>{requests.length ? requests.map((item) => <div className="identity-row" key={item.request_id}><div><strong>{item.email}</strong><small>{item.role} · {clients.find((client) => client.org_id === item.org_id)?.name || item.org_id}</small></div><div><button disabled={busy} onClick={() => void act(() => request(`/v1/admin/access-requests/${item.request_id}/approve`, { method: 'POST' }))}><Check size={14} /> Approve</button><button className="reject" disabled={busy} onClick={() => void act(() => request(`/v1/admin/access-requests/${item.request_id}/reject`, { method: 'POST' }))}><X size={14} /> Reject</button></div></div>) : <div className="identity-empty"><ShieldCheck size={26} /><span>No people are waiting for approval.</span></div>}</article>
        {orgId && <><article className="identity-card"><header><ShieldCheck size={18} /><div><h2>Request access</h2><p>Add the person to your private approval queue.</p></div></header><div className="identity-form"><label><span>Email address</span><input type="email" value={form.email} placeholder="person@company.com" onChange={(event) => setForm({ ...form, email: event.target.value })} /></label><label><span>Role</span><select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>{roles.map((role) => <option key={role}>{role}</option>)}</select></label><label className="wide"><span>Note (optional)</span><input value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} /></label><button className="primary-button" disabled={busy || !form.email} onClick={() => void submit()}>{busy ? <LoaderCircle className="spinner" size={15} /> : <Users size={15} />} Send for approval</button></div></article><article className="identity-card"><header><Users size={18} /><div><h2>Active members</h2><p>Role changes are applied directly to Clerk.</p></div></header>{members.map((member) => { const user = member.public_user_data || {}; return <div className="identity-row" key={member.id}><div><strong>{user.identifier || user.user_id}</strong><small>{user.user_id}</small></div><div><select disabled={busy} value={member.role} onChange={(event) => void act(() => request(`/v1/admin/clients/${encodeURIComponent(orgId)}/members/${user.user_id}`, { method: 'PATCH', body: JSON.stringify({ role: event.target.value }) }))}>{roles.map((role) => <option key={role}>{role}</option>)}</select><button className="reject" disabled={busy} onClick={() => window.confirm('Remove this person from the client organization?') && void act(() => request(`/v1/admin/clients/${encodeURIComponent(orgId)}/members/${user.user_id}`, { method: 'DELETE' }))}><UserMinus size={14} /> Remove</button></div></div>; })}{!members.length && <div className="identity-empty"><Users size={26} /><span>No members returned by Clerk.</span></div>}</article></>}
      </div>
    </section>
    {loading && <div className="identity-loading"><LoaderCircle className="spinner" /> Refreshing access…</div>}
  </div>;
}
