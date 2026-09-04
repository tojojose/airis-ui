'use client';

/**
 * Prompt Studio (plan 08 phase 5).
 *
 * The old screen listed prompts from an S3 store the pipeline never read, and
 * could only list them. This one edits the prompts that actually run.
 *
 * Two rules shape the interaction and are worth stating, because the UI would
 * be simpler and wrong without them:
 *
 *   SAVE IS PUBLISH. There is no edit-in-place. Every save writes a new
 *   immutable version, so "what did the model see last Tuesday" always has an
 *   answer, and rollback is a pointer move rather than a rewrite.
 *
 *   A TEMPLATE IS NOT WHAT GETS SENT. Half these prompts interpolate project
 *   configuration, so the editor shows the declared variables and Preview
 *   renders the assembled string the model will actually receive.
 */

import { AlertTriangle, ArrowLeftRight, Check, Eye, FilePenLine, History, LoaderCircle, RotateCcw, Save, Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';

type Slot = {
  slot: string; stage: string; description: string; variables: string[];
  latest: number; on_default: boolean; updated_at: string; updated_by: string;
  deletable: boolean;
};
type VersionSummary = { version: number; label: string; created_at: string; created_by: string; sha256: string };
type VersionDoc = { slot: string; version: number; text: string; source: string; warnings: string[]; variables: string[] };

const STAGE_ORDER = ['route', 'inspect', 'escalate', 'utility', 'ingest', 'detect'];
const STAGE_LABEL: Record<string, string> = {
  route: 'Stage 1 · Route', inspect: 'Stage 3 · Inspect',
  escalate: 'Stage 4 · Verify', utility: 'Utility', ingest: 'Stage 0 · Ingest',
  detect: 'Stage 2 · Detect',
};

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getClerkToken(true);
  if (!token) throw new Error('Sign in and select Airis Admin to manage prompts.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { detail?: string }).detail || `Request failed (${response.status}).`);
  return payload as T;
}

export function PromptStudio({ organizationName }: { organizationName: string }) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState('');
  const [current, setCurrent] = useState<VersionDoc | null>(null);
  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [draft, setDraft] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [panel, setPanel] = useState<{ title: string; body: string } | null>(null);

  const slot = useMemo(() => slots.find((s) => s.slot === selected) || null, [slots, selected]);
  const dirty = current ? draft !== current.text : draft.trim().length > 0;

  // Both loaders await before their first setState. That is not a style choice:
  // a synchronous setState inside an effect body triggers a cascading render,
  // and React's lint rule is right to refuse it.
  const loadSlots = useCallback(async () => {
    try {
      const payload = await api<{ slots: Slot[] }>('/v1/prompts');
      setSlots(payload.slots); setError('');
      setSelected((previous) => previous || payload.slots[0]?.slot || '');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load prompts.'); }
    finally { setBusy(false); }
  }, []);

  const loadSlot = useCallback(async (name: string) => {
    if (!name) return;
    try {
      const [doc, history] = await Promise.all([
        api<VersionDoc>(`/v1/prompts/${name}`).catch(() => null),
        api<{ versions: VersionSummary[] }>(`/v1/prompts/${name}/versions`).catch(() => ({ versions: [] })),
      ]);
      setCurrent(doc); setDraft(doc?.text ?? ''); setLabel('');
      setVersions(history.versions); setPanel(null); setNotice(''); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load this prompt.'); }
  }, []);

  useEffect(() => { void loadSlots(); }, [loadSlots]);
  useEffect(() => { void loadSlot(selected); }, [selected, loadSlot]);

  const publish = async () => {
    if (!slot) return;
    setSaving(true); setError(''); setNotice('');
    try {
      const doc = await api<VersionDoc>(`/v1/prompts/${slot.slot}`, {
        method: 'PUT', body: JSON.stringify({ text: draft, label }),
      });
      setNotice(`Published v${doc.version}. Runs from now on resolve to it; earlier versions stay readable.`);
      await loadSlots(); await loadSlot(slot.slot);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Publish failed.'); }
    finally { setSaving(false); }
  };

  const rollback = async (version: number) => {
    if (!slot) return;
    setSaving(true); setError('');
    try {
      await api(`/v1/prompts/${slot.slot}/latest`, { method: 'POST', body: JSON.stringify({ version }) });
      setNotice(`Rolled back to v${version}. Nothing was deleted — the version you left is still in the history.`);
      await loadSlots(); await loadSlot(slot.slot);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Rollback failed.'); }
    finally { setSaving(false); }
  };

  const preview = async () => {
    if (!slot) return;
    setError('');
    try {
      const out = await api<{ rendered: string; substituted: string[] }>(
        `/v1/prompts/${slot.slot}/preview`, { method: 'POST', body: JSON.stringify({ text: draft }) });
      setPanel({
        title: out.substituted.length
          ? `Rendered · ${out.substituted.length} variable(s) shown as <placeholders>`
          : 'Rendered exactly as the model receives it',
        body: out.rendered,
      });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Preview failed.'); }
  };

  const diff = async (version: number) => {
    if (!slot || !slot.latest) return;
    try {
      const out = await api<{ diff: string; changed: boolean }>(
        `/v1/prompts/${slot.slot}/diff?from=${version}&to=${slot.latest}`);
      setPanel({ title: `v${version} → v${slot.latest}`, body: out.changed ? out.diff : 'Identical text.' });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Diff failed.'); }
  };

  const seed = async () => {
    setSaving(true); setError('');
    try {
      const out = await api<{ created: unknown[]; skipped: string[] }>('/v1/prompts/seed', { method: 'POST' });
      setNotice(`Published ${out.created.length} slot(s) from the shipped defaults. ${out.skipped.length} already had a version and were left alone.`);
      await loadSlots(); await loadSlot(selected);
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Seeding failed.'); }
    finally { setSaving(false); }
  };

  const grouped = useMemo(() => {
    const byStage = new Map<string, Slot[]>();
    for (const entry of slots) byStage.set(entry.stage, [...(byStage.get(entry.stage) || []), entry]);
    return STAGE_ORDER.filter((stage) => byStage.has(stage)).map((stage) => ({ stage, entries: byStage.get(stage)! }));
  }, [slots]);
  const onDefault = slots.filter((s) => s.on_default).length;

  return (
    <div className="admin-page prompt-studio">
      <header className="admin-heading">
        <div>
          <p className="kicker">VISION BEHAVIOR</p>
          <h1>Prompt Studio</h1>
          <p>Every instruction this pipeline sends to a model, versioned. Saving publishes a new immutable version; rollback repoints rather than rewrites.</p>
        </div>
        <div className="admin-heading-actions">
          <span className="admin-scope"><Sparkles size={15} /> {organizationName}</span>
          {onDefault > 0 && <button className="studio-seed" onClick={() => void seed()} disabled={saving}>Publish {onDefault} shipped default{onDefault === 1 ? '' : 's'}</button>}
        </div>
      </header>

      {error && <div className="studio-banner error"><AlertTriangle size={16} /> {error}</div>}
      {notice && <div className="studio-banner"><Check size={16} /> {notice}</div>}

      {busy ? <div className="admin-state"><LoaderCircle className="spinner" size={25} /><p>Loading prompts…</p></div> : (
        <div className="studio-layout">
          <nav className="studio-slots" aria-label="Prompt slots">
            {grouped.map(({ stage, entries }) => (
              <section key={stage}>
                <h2>{STAGE_LABEL[stage] || stage}</h2>
                {entries.map((entry) => (
                  <button key={entry.slot} className={entry.slot === selected ? 'active' : ''} onClick={() => setSelected(entry.slot)}>
                    <strong>{entry.slot}</strong>
                    <span>{entry.on_default ? 'shipped default' : `v${entry.latest}${entry.updated_by ? ` · ${entry.updated_by}` : ''}`}</span>
                  </button>
                ))}
              </section>
            ))}
          </nav>

          {slot && (
            <section className="studio-editor">
              <header>
                <div>
                  <h2>{slot.slot}</h2>
                  <p>{slot.description}</p>
                </div>
                <span className={`record-status ${slot.on_default ? 'pending' : 'active'}`}>
                  {slot.on_default ? 'shipped default' : `v${slot.latest} · ${current?.source ?? 'published'}`}
                </span>
              </header>

              {slot.variables.length > 0 && (
                <p className="studio-variables">
                  <strong>Variables</strong>
                  {slot.variables.map((name) => <code key={name}>{`{${name}}`}</code>)}
                  <em>A version that uses anything else is refused when you publish, rather than failing mid-inspection.</em>
                </p>
              )}

              <textarea value={draft} onChange={(event) => setDraft(event.target.value)} spellCheck={false}
                        aria-label={`${slot.slot} prompt text`} rows={18} />

              {current?.warnings?.length ? (
                <ul className="studio-lints">
                  {current.warnings.map((warning) => <li key={warning}><AlertTriangle size={13} /> {warning}</li>)}
                </ul>
              ) : null}

              <div className="studio-actions">
                <input value={label} onChange={(event) => setLabel(event.target.value)}
                       placeholder="What changed? (shown in the version list)" aria-label="Version label" />
                <button className="ghost" onClick={() => void preview()}><Eye size={15} /> Preview</button>
                <button className="primary" onClick={() => void publish()} disabled={saving || !dirty || !draft.trim()}>
                  {saving ? <LoaderCircle className="spinner" size={15} /> : <Save size={15} />} Publish new version
                </button>
              </div>
              {dirty && <p className="studio-dirty">Unsaved. Publishing creates v{(slot.latest || 0) + 1}; the current version stays exactly as it is.</p>}

              {panel && (
                <div className="studio-panel">
                  <header><strong>{panel.title}</strong><button onClick={() => setPanel(null)}>Close</button></header>
                  <pre>{panel.body}</pre>
                </div>
              )}

              <div className="studio-history">
                <h3><History size={15} /> Version history</h3>
                {versions.length === 0 ? <p>Never published. This slot is running on the text shipped in the image.</p> : (
                  <ul>
                    {versions.map((version) => (
                      <li key={version.version} className={version.version === slot.latest ? 'current' : ''}>
                        <div>
                          <strong>v{version.version}{version.version === slot.latest ? ' · current' : ''}</strong>
                          <span>{version.label || 'no label'} · {version.created_by || 'unknown'} · {version.created_at?.slice(0, 16).replace('T', ' ')}</span>
                        </div>
                        <div className="studio-history-actions">
                          {version.version !== slot.latest && <button onClick={() => void diff(version.version)}><ArrowLeftRight size={13} /> Diff</button>}
                          {version.version !== slot.latest && <button onClick={() => void rollback(version.version)} disabled={saving}><RotateCcw size={13} /> Roll back</button>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          )}
        </div>
      )}

      {!busy && slots.length === 0 && <div className="admin-state"><FilePenLine size={25} /><p>No prompt slots were returned by the API.</p></div>}
    </div>
  );
}
