'use client';

import { HardHat, Layers3, LoaderCircle, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';
import type { ProjectTemplate } from './portfolio-types';
import { profileLabel } from './inspection-profiles';

export function ProjectTemplates() {
  const [templates, setTemplates] = useState<ProjectTemplate[]>([]); const [error, setError] = useState('');
  useEffect(() => { void (async () => { try { const token = await getClerkToken(true); const r = await fetch(`${API_URL}/v1/admin/project-templates`, { headers: { Authorization: `Bearer ${token}` } }); const p = await r.json(); if (!r.ok) throw new Error(p.detail); setTemplates(p.templates || []); } catch (e) { setError(e instanceof Error ? e.message : 'Could not load templates.'); } })(); }, []);
  return <div className="admin-page templates-page"><header className="admin-heading"><div><p className="kicker">CLIENT PORTFOLIOS</p><h1>Project Templates</h1><p>Templates seed editable defaults. They never make authoritative compliance decisions.</p></div></header>{error ? <div className="history-state error"><TriangleAlert />{error}</div> : templates.length ? <section className="template-grid">{templates.map((template) => <article key={template.project_type}><header><div className="row-avatar"><Layers3 size={18} /></div><div><h2>{template.label}</h2><span>{template.industry || 'Industry selected during setup'}</span></div></header><dl><div><dt>Routing domain</dt><dd>{template.domain.replaceAll('_', ' ')}</dd></div><div><dt>Default profile</dt><dd>{profileLabel(template.default_inspection_profile)}</dd></div></dl><div className="template-tags"><span><ShieldCheck size={13} /> Enabled profiles</span><p>{template.inspection_profiles.map(profileLabel).join(' · ')}</p></div><div className="template-tags"><span><HardHat size={13} /> Suggested PPE</span><p>{template.required_ppe.join(' · ') || 'Configured per project'}</p></div><small>Authorities: {template.governing_authorities.join(', ') || 'configured during review'}</small></article>)}</section> : <div className="history-state"><LoaderCircle className="spinner" /> Loading templates…</div>}</div>;
}
