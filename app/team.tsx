'use client';

/**
 * Team — the Client Manager's own screen (docs/auth.md).
 *
 * Everything here is scoped to the manager's active organization by the API;
 * this component never sends an org id. Three jobs:
 *
 *   INVITE     inspectors only, and they go out immediately. Adding a second
 *              Client Manager is a Visinexa decision, so it is not offered
 *              here at all rather than offered and refused.
 *   ROLES      read-only. A manager runs inspectors; their own row is not
 *              returned by the API, and Visinexa staff rows never were.
 *   ASSIGN     which projects an inspector may work on. An inspector with no
 *              projects can do nothing at all, so this is the screen that puts
 *              someone to work - it leads with that rather than hiding it
 *              behind an edit affordance.
 */

import { AlertTriangle, Check, FolderCheck, LoaderCircle, Send, ShieldCheck, UserMinus, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';

type Member = {
  user_id: string; identifier: string; name: string; role: string;
  role_label: string; project_ids: string[]; manageable: boolean;
};
type Project = { project_id: string; name?: string };
type InviteResult = { status: string; email: string; role: string; project_ids: string[] };
type RemovalResult = { clerk_account_deleted: boolean; account_retained_because: string };
type Invitation = {
  invitation_id: string; email: string; role_label: string;
  created_at: string | number; project_ids: string[];
};

const INSPECTOR = 'org:inspector';

/** Clerk reports created_at as epoch MILLISECONDS, not an ISO string. Slicing
 *  the first ten characters of it rendered "invited 1788624972". */
function invitedOn(createdAt: string | number | undefined): string {
  const ms = typeof createdAt === 'number' ? createdAt : Number(createdAt);
  if (!ms || Number.isNaN(ms)) return '';
  const date = new Date(ms < 1e12 ? ms * 1000 : ms);   // tolerate seconds too
  return Number.isNaN(date.getTime()) ? '' : ` · invited ${date.toISOString().slice(0, 10)}`;
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getClerkToken(true);
  if (!token) throw new Error('Sign in to manage your team.');
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((payload as { detail?: string }).detail || `Request failed (${response.status}).`);
  return payload as T;
}

export function Team({ organizationName }: { organizationName: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [invite, setInvite] = useState({ email: '', role: INSPECTOR, project_ids: [] as string[] });
  const [editing, setEditing] = useState<string>('');
  const [draft, setDraft] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [team, projectList, invited] = await Promise.all([
        api<{ members: Member[] }>('/v1/projects/members'),
        api<{ projects: Project[] }>('/v1/projects'),
        api<{ invitations: Invitation[] }>('/v1/projects/invitations'),
      ]);
      setMembers(team.members); setProjects(projectList.projects || []);
      setInvitations(invited.invitations || []); setError('');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'Could not load your team.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const projectName = useCallback((id: string) =>
    projects.find((project) => project.project_id === id)?.name || id, [projects]);

  const act = async (work: () => Promise<string>) => {
    setBusy(true); setError(''); setNotice('');
    try { setNotice(await work()); await load(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'That did not work.'); }
    finally { setBusy(false); }
  };

  const sendInvite = () => act(async () => {
    const result = await api<InviteResult>('/v1/projects/access-requests', {
      method: 'POST', body: JSON.stringify(invite),
    });
    setInvite({ email: '', role: INSPECTOR, project_ids: [] });
    // Always at least one project now - the API refuses an invitation without
    // one, so the "you forgot to assign them" branch cannot be reached.
    return `Invitation sent to ${result.email}. They can start on `
      + `${result.project_ids.length} project(s) as soon as they accept it.`;
  });

  const revokeInvitation = (invitation: Invitation) => act(async () => {
    await api(`/v1/projects/invitations/${encodeURIComponent(invitation.invitation_id)}`
      + `?email=${encodeURIComponent(invitation.email)}`, { method: 'DELETE' });
    return `The invitation to ${invitation.email} has been revoked.`;
  });

  const removeMember = (member: Member) => act(async () => {
    const who = member.identifier || member.user_id;
    const out = await api<RemovalResult>(
      `/v1/projects/members/${encodeURIComponent(member.user_id)}`, { method: 'DELETE' });
    // Say which of the two things happened. "Removed" alone would hide the case
    // where the sign-in was deliberately kept because they belong elsewhere.
    return out.clerk_account_deleted
      ? `${who} was removed from ${organizationName} and their sign-in was deleted.`
      : `${who} was removed from ${organizationName}. Their sign-in was kept`
        + `${out.account_retained_because ? ` — ${out.account_retained_because}` : ''}.`;
  });

  const saveProjects = (member: Member) => act(async () => {
    await api(`/v1/projects/members/${encodeURIComponent(member.user_id)}/projects`, {
      method: 'PUT', body: JSON.stringify({ project_ids: draft }),
    });
    setEditing('');
    return draft.length
      ? `${member.identifier || member.user_id} can now work on ${draft.length} project(s).`
      : `${member.identifier || member.user_id} has no projects and cannot run inspections until you assign one.`;
  });

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((item) => item !== id) : [...list, id];

  const unassigned = useMemo(
    () => members.filter((m) => m.role === INSPECTOR && m.manageable && !m.project_ids.length).length,
    [members]);

  return (
    <div className="admin-page team-page">
      <header className="admin-heading">
        <div>
          <p className="kicker">YOUR ORGANIZATION</p>
          <h1>Team</h1>
          <p>Invite inspectors, set what each person can reach, and decide who manages the account. An inspector works only on the projects you assign.</p>
        </div>
        <span className="admin-scope"><Users size={15} /> {organizationName}</span>
      </header>

      {error && <div className="studio-banner error"><AlertTriangle size={16} /> {error}</div>}
      {notice && <div className="studio-banner"><Check size={16} /> {notice}</div>}
      {!loading && unassigned > 0 && (
        <div className="studio-banner"><FolderCheck size={16} /> {unassigned} inspector{unassigned === 1 ? '' : 's'} {unassigned === 1 ? 'has' : 'have'} no project assigned and cannot run an inspection yet.</div>
      )}

      {loading ? <div className="admin-state"><LoaderCircle className="spinner" size={25} /><p>Loading your team…</p></div> : (
        <div className="identity-content">
          <article className="identity-card">
            <header><UserPlus size={18} /><div><h2>Invite an inspector</h2><p>They are invited straight away and can work only on the projects you assign. Adding another Client Manager is a Visinexa decision — ask your Visinexa contact.</p></div></header>
            <div className="identity-form">
              <label><span>Email address</span>
                <input type="email" value={invite.email} placeholder="person@company.com"
                       onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></label>
              {/* No role picker. Inspector is the only role a manager may
                  invite, and a select with one option is a control that asks a
                  question with no answer. The API refuses anything else. */}
              {invite.role === INSPECTOR && (
                <label className="wide"><span>Projects they may work on</span>
                  <div className="team-projects">
                    {projects.length === 0 ? <em>No projects yet — an Visinexa administrator sets those up.</em> : projects.map((project) => (
                      <button type="button" key={project.project_id}
                              className={invite.project_ids.includes(project.project_id) ? 'chip on' : 'chip'}
                              onClick={() => setInvite({ ...invite, project_ids: toggle(invite.project_ids, project.project_id) })}>
                        {invite.project_ids.includes(project.project_id) && <Check size={12} />}{project.name || project.project_id}
                      </button>
                    ))}
                  </div></label>
              )}
              {projects.length > 0 && invite.project_ids.length === 0 && invite.email.trim() && (
                <p className="field-hint">Choose at least one project — an inspector with no
                  project assigned cannot run an inspection.</p>
              )}
              <button className="primary-button"
                      disabled={busy || !invite.email.trim() || invite.project_ids.length === 0}
                      title={invite.project_ids.length === 0 ? 'Choose at least one project first' : ''}
                      onClick={() => void sendInvite()}>
                {busy ? <LoaderCircle className="spinner" size={15} /> : <Send size={15} />}
                Send invitation
              </button>
            </div>
          </article>

          {invitations.length > 0 && (
            <article className="identity-card">
              <header><Send size={18} /><div><h2>Invited</h2>
                <p>They have not accepted yet. Revoking takes the invitation back before it is used.</p></div></header>
              {invitations.map((invitation) => (
                <div className="identity-row team-row" key={invitation.invitation_id}>
                  <div>
                    <strong>{invitation.email}</strong>
                    <small>{invitation.role_label || 'Inspector'}{invitedOn(invitation.created_at)}</small>
                    <small className={invitation.project_ids.length ? 'team-assigned' : 'team-unassigned'}>
                      {invitation.project_ids.length
                        ? invitation.project_ids.map(projectName).join(' · ')
                        : 'No projects chosen'}
                    </small>
                  </div>
                  <div>
                    <button className="reject" disabled={busy}
                            onClick={() => {
                              if (!window.confirm(`Revoke the invitation to ${invitation.email}?\n\n`
                                + 'The link in their email stops working. Nothing else changes — '
                                + 'they never had access.')) return;
                              void revokeInvitation(invitation);
                            }}>
                      <UserMinus size={13} /> Revoke invitation
                    </button>
                  </div>
                </div>
              ))}
            </article>
          )}

          <article className="identity-card">
            <header><Users size={18} /><div><h2>People</h2><p>Role changes take effect on their next sign-in. Visinexa staff rows are managed by Visinexa.</p></div></header>
            {members.map((member) => (
              <div className="identity-row team-row" key={member.user_id}>
                <div>
                  <strong>{member.name || member.identifier || member.user_id}</strong>
                  <small>{member.identifier || member.user_id}</small>
                  {member.manageable && member.role === INSPECTOR && (
                    <small className={member.project_ids.length ? 'team-assigned' : 'team-unassigned'}>
                      {member.project_ids.length
                        ? member.project_ids.map(projectName).join(' · ')
                        : 'No projects — cannot run inspections'}
                    </small>
                  )}
                </div>
                <div>
                  {member.manageable ? (
                    <>
                      {/* The role reads as a label, not a dropdown. A manager
                          manages inspectors; the only role they could select is
                          the one already shown, and offering Client Manager
                          would be a control the API is bound to refuse. */}
                      <span className="role-label">{member.role_label}</span>
                      {member.role === INSPECTOR && (<>
                        <button disabled={busy}
                                onClick={() => { setEditing(editing === member.user_id ? '' : member.user_id); setDraft(member.project_ids); }}>
                          <FolderCheck size={13} /> Projects
                        </button>
                        <button className="reject" disabled={busy}
                                onClick={() => {
                                  const who = member.identifier || member.user_id;
                                  // Their sign-in is NOT deleted - the account is
                                  // theirs and may be used elsewhere. Say exactly
                                  // what happens so nobody expects otherwise.
                                  if (!window.confirm(
                                    `Remove ${who} from ${organizationName}?\n\n`
                                    + 'They lose access to this organization and all project '
                                    + 'assignments, and their sign-in is deleted unless they also '
                                    + 'belong to another organization. This cannot be undone.')) return;
                                  void removeMember(member);
                                }}>
                          <UserMinus size={13} /> Remove
                        </button>
                      </>)}
                    </>
                  ) : <span className="record-status"><ShieldCheck size={11} /> {member.role_label}</span>}
                </div>
                {editing === member.user_id && (
                  <div className="team-editor">
                    <div className="team-projects">
                      {projects.map((project) => (
                        <button type="button" key={project.project_id}
                                className={draft.includes(project.project_id) ? 'chip on' : 'chip'}
                                onClick={() => setDraft(toggle(draft, project.project_id))}>
                          {draft.includes(project.project_id) && <Check size={12} />}{project.name || project.project_id}
                        </button>
                      ))}
                    </div>
                    <div className="team-editor-actions">
                      <button disabled={busy} onClick={() => void saveProjects(member)}>Save</button>
                      <button className="reject" onClick={() => setEditing('')}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {!members.length && <div className="identity-empty"><Users size={26} /><span>Nobody else is in this organization yet.</span></div>}
          </article>
        </div>
      )}
    </div>
  );
}
