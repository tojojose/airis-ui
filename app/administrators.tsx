'use client';

import { LoaderCircle, Lock, Mail, ShieldCheck, TriangleAlert, UserMinus, UserPlus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';

type Administrator = {
  user_id: string; email: string; name: string; status: string;
  source: string; granted_by: string; granted_at: string; revocable: boolean;
};
type PendingInvite = { email: string; invitation_id: string; invited_by: string; invited_at: string };
type RevokeResult = { clerk_membership_removed: boolean; clerk_account_deleted: boolean; account_retained_because: string };

const sourceLabel: Record<string, string> = {
  bootstrap: 'Break-glass',
  invited: 'Invited',
  promoted: 'Granted',
  clerk_org: 'Clerk org',
};

export function Administrators({ currentUserId }: { currentUserId: string | null }) {
  const [admins, setAdmins] = useState<Administrator[]>([]);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [viewerIsBreakGlass, setViewerIsBreakGlass] = useState(false);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const request = useCallback(async (path: string, options: RequestInit = {}) => {
    const token = await getClerkToken(true); if (!token) throw new Error('Sign in as a Visinexa administrator.');
    const response = await fetch(`${API_URL}${path}`, { ...options, headers: { Authorization: `Bearer ${token}`, ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
    if (response.status === 204) return null;
    const payload = await response.json().catch(() => null) as ({ detail?: string } & Record<string, unknown>) | null;
    if (!response.ok) throw new Error(typeof payload?.detail === 'string' ? payload.detail : `Request failed (${response.status}).`);
    return payload;
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await request('/v1/admin/administrators') as unknown as
        { administrators: Administrator[]; pending: PendingInvite[]; viewer_is_break_glass?: boolean };
      setAdmins(data.administrators || []);
      setPending(data.pending || []);
      setViewerIsBreakGlass(Boolean(data.viewer_is_break_glass));
      setError(null);
    } catch (caught) {
      // Never render an empty table on failure - "no administrators" and "the
      // read failed" must not look the same on a screen about access control.
      setAdmins([]); setPending([]);
      setError(caught instanceof Error ? caught.message : 'Could not load administrators.');
    } finally { setLoading(false); }
  }, [request]);

  useEffect(() => { void load(); }, [load]);

  async function act(work: () => Promise<unknown>, done?: string) {
    setBusy(true); setError(null); setNotice(null);
    // `done` is for callers with a fixed message; a caller that needs to report
    // what the server actually did calls setNotice itself and passes nothing.
    try { await work(); if (done) setNotice(done); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The change could not be completed.'); }
    finally { setBusy(false); }
  }

  const activeCount = admins.filter((a) => a.status === 'active').length;

  // Mirrors the server guards in admin_api._assert_revocable. These are
  // affordances only - the API enforces all three regardless of what the button
  // is doing, which is why a stale page cannot be used to get around them.
  function blockedReason(admin: Administrator): string | null {
    if (currentUserId && admin.user_id === currentUserId) return 'You cannot revoke your own access. Ask another administrator.';
    // "Would this leave nobody?" - counting only REVOCABLE admins was wrong and
    // greyed out the one real revoke on any workspace with a single break-glass
    // holder plus one invited admin. A break-glass account is still an
    // administrator; it just is not revocable from here. The server counts every
    // active administrator, and this must agree or the button lies.
    if (activeCount <= 1) return 'This is the last administrator. Grant another one first.';
    return null;
  }

  return <div className="admin-page">
    <header className="admin-heading">
      <div>
        <p className="kicker">PLATFORM ACCESS</p>
        <h1>Administrators</h1>
        <p>People who can see every client, every run, and every setting in Visinexa.</p>
      </div>
    </header>

    {error && <div className="history-state error"><TriangleAlert size={20} />{error}</div>}
    {notice && <div className="history-state"><ShieldCheck size={20} />{notice}</div>}

    <section className="admin-card">
      <h2>Invite an administrator</h2>
      <p className="muted">They receive an email from Clerk. Administrator access begins when they accept.</p>
      <div className="inline-form">
        <input type="email" value={email} placeholder="name@company.com" autoComplete="off"
               onChange={(event) => setEmail(event.target.value)}
               onKeyDown={(event) => { if (event.key === 'Enter' && email) void act(async () => { await request('/v1/admin/administrators/invite', { method: 'POST', body: JSON.stringify({ email }) }); setEmail(''); }, `Invitation sent to ${email}.`); }} />
        <button className="primary-button" disabled={busy || !email}
                onClick={() => void act(async () => { await request('/v1/admin/administrators/invite', { method: 'POST', body: JSON.stringify({ email }) }); setEmail(''); }, `Invitation sent to ${email}.`)}>
          <UserPlus size={15} /> Send invitation
        </button>
      </div>
    </section>

    {loading ? <div className="history-state"><LoaderCircle size={20} className="spin" /> Loading administrators…</div> : <>
      <section className="admin-card">
        <h2>Active <span className="count">{admins.filter((a) => a.status === 'active').length}</span></h2>
        <table className="admin-table">
          <thead><tr><th>Person</th><th>Source</th><th>Granted by</th><th>When</th><th /></tr></thead>
          <tbody>
            {admins.filter((a) => a.status === 'active').map((admin) => {
              const blocked = blockedReason(admin);
              return <tr key={admin.user_id}>
                <td>
                  <strong>{admin.email || admin.name || admin.user_id}</strong>
                  {admin.email && admin.name ? <small>{admin.name}</small> : null}
                  <small className="mono">{admin.user_id}</small>
                </td>
                <td><span className={`chip ${admin.revocable ? '' : 'chip-locked'}`}>
                  {!admin.revocable && <Lock size={11} />} {sourceLabel[admin.source] || admin.source}
                </span></td>
                <td>{admin.granted_by || '—'}</td>
                <td>{admin.granted_at ? admin.granted_at.slice(0, 10) : '—'}</td>
                <td className="row-actions">
                  {/* Break-glass access is changed in terraform, never here, so
                      the row carries a label rather than a button that exists
                      only to be permanently disabled. */}
                  {!admin.revocable ? <span className="muted-action">Managed in terraform</span> :
                  <button className="danger-button" disabled={busy || Boolean(blocked)} title={blocked || 'Revoke administrator access'}
                          onClick={() => {
                            const who = admin.email || admin.user_id;
                            if (!window.confirm(
                              `Revoke administrator access for ${who}?\n\n`
                              + 'They are removed from the Visinexa organization, and their '
                              + 'sign-in is deleted unless they also belong to a client '
                              + 'organization. Any session they have open is ended on their '
                              + 'next action. This cannot be undone.')) return;
                            void act(async () => {
                              const out = await request(`/v1/admin/administrators/${encodeURIComponent(admin.user_id)}`, { method: 'DELETE' }) as unknown as RevokeResult | null;
                              // Say what actually happened. "Revoked" alone would hide the
                              // case where the account was deliberately kept.
                              setNotice(out?.clerk_account_deleted
                                ? `${who} was revoked and their sign-in deleted.`
                                : `${who} was revoked. Their sign-in was kept${out?.account_retained_because ? ` - ${out.account_retained_because}` : ''}.`);
                            });
                          }}>
                    <UserMinus size={14} /> Revoke
                  </button>}
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </section>

      {pending.length > 0 && <section className="admin-card">
        <h2>Pending invitations <span className="count">{pending.length}</span></h2>
        <table className="admin-table">
          <thead><tr><th>Email</th><th>Invited by</th><th>When</th><th /></tr></thead>
          <tbody>
            {pending.map((invite) => <tr key={invite.email}>
              <td><strong><Mail size={13} /> {invite.email}</strong></td>
              <td>{invite.invited_by || '—'}</td>
              <td>{invite.invited_at ? invite.invited_at.slice(0, 10) : '—'}</td>
              <td className="row-actions">
                <button className="danger-button" disabled={busy}
                        onClick={() => void act(() => request(`/v1/admin/administrators/invites/${encodeURIComponent(invite.email)}`, { method: 'DELETE' }), 'Invitation revoked.')}>
                  Revoke invitation
                </button>
              </td>
            </tr>)}
          </tbody>
        </table>
      </section>}
    </>}

    {viewerIsBreakGlass && <p className="muted footnote">
      Break-glass administrators come from <code>SYSTEM_ADMIN_USER_IDS</code> in terraform and
      cannot be revoked here. They are what gets you back in if this list is ever emptied by mistake.
    </p>}
  </div>;
}
