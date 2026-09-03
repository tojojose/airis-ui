'use client';

import { Building2, CircleDollarSign, LoaderCircle, Save, TriangleAlert } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';
import type { InspectionProject } from './pipeline-run';
import { budgetPayload, money, type BudgetPeriod, type ClientRecord } from './portfolio-types';

type Scope = {
  kind: 'client' | 'project';
  id: string;
  orgId: string;
  name: string;
  budget?: ClientRecord['budget'];
};

type Usage = { est_cost_usd: number; requests: number; input_tokens: number; output_tokens: number };
const emptyUsage: Usage = { est_cost_usd: 0, requests: 0, input_tokens: 0, output_tokens: 0 };

export function PortfolioBudgets() {
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [projects, setProjects] = useState<InspectionProject[]>([]);
  const [orgId, setOrgId] = useState('');
  const [scope, setScope] = useState<Scope | null>(null);
  const [amount, setAmount] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [usage, setUsage] = useState<Usage>(emptyUsage);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(path: string, options: RequestInit = {}) {
    const token = await getClerkToken(true);
    if (!token) throw new Error('Administrator sign-in required.');
    const response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(apiError(payload.detail, response.status));
    return payload;
  }

  useEffect(() => {
    void call('/v1/admin/clients')
      .then((payload) => setClients(payload.clients || []))
      .catch((caught) => setError(caught.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!orgId) { setProjects([]); return; }
    void call(`/v1/admin/clients/${encodeURIComponent(orgId)}/projects`)
      .then((payload) => setProjects(payload.projects || []))
      .catch((caught) => setError(caught.message));
  }, [orgId]);

  async function choose(next: Scope) {
    setScope(next);
    setAmount(next.budget ? String(next.budget.amount) : '');
    setPeriod(next.budget?.period || 'monthly');
    try {
      const payload = await call(`/v1/admin/usage?scope=${encodeURIComponent(next.id)}&months=1`);
      setUsage({ ...emptyUsage, ...(payload.months?.[0] || {}) });
    } catch {
      setUsage(emptyUsage);
    }
  }

  async function save() {
    if (!scope || amount === '') return;
    setSaving(true); setError(null);
    try {
      const path = scope.kind === 'client'
        ? `/v1/admin/clients/${encodeURIComponent(scope.orgId)}`
        : `/v1/admin/clients/${encodeURIComponent(scope.orgId)}/projects/${encodeURIComponent(scope.id)}`;
      const updated = await call(path, { method: 'PATCH', body: JSON.stringify({ budget: budgetPayload(amount, period) }) });
      setScope({ ...scope, budget: updated.budget });
      if (scope.kind === 'client') setClients((all) => all.map((item) => item.org_id === scope.id ? updated : item));
      else setProjects((all) => all.map((item) => item.project_id === scope.id ? updated : item));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save budget.');
    } finally { setSaving(false); }
  }

  const equivalents = useMemo(() => calculate(Number(amount || 0), period), [amount, period]);
  const used = equivalents.monthly ? Math.min(100, usage.est_cost_usd / equivalents.monthly * 100) : 0;
  const client = clients.find((item) => item.org_id === scope?.orgId);
  const clientMonthly = client?.budget?.equivalents?.monthly || 0;
  const allocatedMonthly = projects
    .filter((item) => item.status !== 'archived' && item.project_id !== (scope?.kind === 'project' ? scope.id : ''))
    .reduce((sum, item) => sum + (item.budget?.equivalents?.monthly || 0), 0);
  const overAllocation = scope?.kind === 'project' && clientMonthly > 0 && allocatedMonthly + equivalents.monthly > clientMonthly;
  const invalidMinimum = amount !== '' && Number(amount) < 5;

  return <div className="admin-page budget-page">
    <header className="admin-heading"><div><p className="kicker">CLIENT PORTFOLIOS</p><h1>Budgets &amp; Usage</h1><p>Set spending safeguards for clients and projects. Project totals cannot exceed their client budget.</p></div></header>
    {error && <div className="history-state error"><TriangleAlert size={20} />{error}</div>}
    {loading ? <div className="history-state"><LoaderCircle className="spinner" /> Loading budgets…</div> : <div className="budget-layout">
      <aside className="budget-scopes"><h2>Clients</h2>{clients.map((clientItem) => <div key={clientItem.org_id}>
        <button className={scope?.id === clientItem.org_id ? 'active' : ''} onClick={() => { setOrgId(clientItem.org_id); void choose({ kind: 'client', id: clientItem.org_id, orgId: clientItem.org_id, name: clientItem.name, budget: clientItem.budget }); }}>
          <Building2 size={16} /><span><strong>{clientItem.name}</strong><small>{clientItem.budget ? `${money(clientItem.budget.amount)} / ${clientItem.budget.period}` : 'No client limit'}</small></span>
        </button>
        {orgId === clientItem.org_id && projects.map((project) => <button className={`project-scope ${scope?.id === project.project_id ? 'active' : ''}`} key={project.project_id} onClick={() => void choose({ kind: 'project', id: project.project_id, orgId: clientItem.org_id, name: project.name, budget: project.budget })}>
          <span><strong>{project.name}</strong><small>{project.budget ? `${money(project.budget.amount)} / ${project.budget.period}` : 'No project budget'}</small></span>
        </button>)}
      </div>)}</aside>
      <section className="budget-editor">{scope ? <>
        <div className="budget-editor-heading"><CircleDollarSign size={22} /><div><span>{scope.kind.toUpperCase()} BUDGET</span><h2>{scope.name}</h2></div></div>
        <div className="budget-entry"><label><span>Amount (minimum $5)</span><input type="number" min="5" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />{invalidMinimum && <small className="field-error">Budget must be at least $5.00.</small>}</label><label><span>Period</span><select value={period} onChange={(event) => setPeriod(event.target.value as BudgetPeriod)}><option value="hourly">Hourly</option><option value="daily">Daily</option><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select></label></div>
        <div className="budget-equivalents">{Object.entries(equivalents).map(([key, value]) => <div key={key}><span>{key}</span><strong>{money(value)}</strong></div>)}</div>
        {scope.kind === 'project' && clientMonthly > 0 && <div className={`template-preview ${overAllocation ? 'error' : ''}`}><strong>Client allocation</strong><span>{money(allocatedMonthly)} already allocated · {money(Math.max(0, clientMonthly - allocatedMonthly))} monthly available for this project</span>{overAllocation && <small className="field-error">This project would exceed the client budget.</small>}</div>}
        <div className="budget-progress"><div><span>Current month usage</span><strong>{money(usage.est_cost_usd)} of {money(equivalents.monthly)}</strong></div><progress max="100" value={used} /><small>{used.toFixed(1)}% used · project administrators are notified at 80% · new AI processing stops at 90%</small></div>
        <div className="budget-equivalents" aria-label="Current month activity"><div><span>Requests</span><strong>{usage.requests.toLocaleString()}</strong></div><div><span>Input tokens</span><strong>{usage.input_tokens.toLocaleString()}</strong></div><div><span>Output tokens</span><strong>{usage.output_tokens.toLocaleString()}</strong></div><div><span>Exact cost</span><strong>${usage.est_cost_usd.toFixed(6)}</strong></div></div>
        <button className="primary-button" disabled={saving || amount === '' || invalidMinimum || overAllocation} onClick={() => void save()}>{saving ? <LoaderCircle className="spinner" size={16} /> : <Save size={16} />} Save budget</button>
      </> : <div className="history-state"><CircleDollarSign size={30} /><strong>Select a client or project</strong><span>Its budget and current usage will appear here.</span></div>}</section>
    </div>}
  </div>;
}

function calculate(amount: number, period: BudgetPeriod) {
  const annual = period === 'hourly' ? amount * 8766 : period === 'daily' ? amount * 365.25 : period === 'monthly' ? amount * 12 : amount;
  return { hourly: annual / 8766, daily: annual / 365.25, monthly: annual / 12, yearly: annual };
}

function apiError(detail: unknown, status: number) {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => { const issue = item as { loc?: unknown[]; msg?: string }; const field = issue.loc?.filter((part) => part !== 'body').join(' → '); return `${field ? `${field}: ` : ''}${issue.msg || 'Invalid value'}`; }).join(' ');
  return `Request failed (${status}).`;
}
