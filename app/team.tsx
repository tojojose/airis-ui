'use client';

/**
 * Team — the Client Manager's own screen (docs/auth.md).
 *
 * Everything here is scoped to the manager's active organization by the API;
 * this component never sends an org id. Three jobs:
 *
 *   INVITE     an inspector goes out immediately; a second manager is queued
 *              for Airis. The screen says which happened, because "sent" and
 *              "waiting on Airis" are different promises to make to a
 *              colleague.
 *   ROLE       between the two client roles. Airis staff rows are read-only,
 *              and so is the manager's own row.
 *   ASSIGN     which projects an inspector may work on. An inspector with no
 *              projects can do nothing at all, so this is the screen that puts
 *              someone to work - it leads with that rather than hiding it
 *              behind an edit affordance.
 */

import { AlertTriangle, Check, FolderCheck, LoaderCircle, Send, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken } from './clerk-auth';

type Member = {
  user_id: string; identifier: string; name: string; role: string;
  role_label: string; project_ids: string[]; manageable: boolean;
};
type Project = { project_id: string; name?: string };
type InviteResult = { status: string; email: string; role: string; project_ids: string[] };

const MANAGER = 'org:client_manager';
const INSPECTOR = 'org:inspector';
const ROLES = [{ key: INSPECTOR, label: 'Inspector' }, { key: MANAGER, label: 'Client Manager' }];

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
      const [team, projectList] = await Promise.all([
        api<{ members: Member[] }>('/v1/projects/members'),
        api<{ projects: Project[] }>('/v1/projects'),
      ]);
      setMembers(team.members); setProjects(projectList.projects || []); setError('');
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
    return result.status === 'invited'
      ? `Invitation sent to ${result.email}. They can start as soon as they accept it${result.project_ids.length ? `, on ${result.project_ids.length} project(s)` : ' — assign them a project so they have something to work on'}.`
      : `Sent to Airis for approval. ${result.email} will be invited as a Client Manager once an administrator approves it.`;
  });

  const changeRole = (member: Member, role: string) => act(async () => {
    await api(`/v1/projects/members/${encodeURIComponent(member.user_id)}`, {
      method: 'PATCH', body: JSON.stringify({ role }),
    });
    return `${member.identifier || member.user_id} is now ${ROLES.find((r) => r.key === role)?.label}.`;
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
            <header><UserPlus size={18} /><div><h2>Add someone</h2><p>An inspector is invited straight away. A second Client Manager is sent to Airis for approval first.</p></div></header>
            <div className="identity-form">
              <label><span>Email address</span>
                <input type="email" value={invite.email} placeholder="person@company.com"
                       onChange={(event) => setInvite({ ...invite, email: event.target.value })} /></label>
              <label><span>Role</span>
                <select value={invite.role} onChange={(event) => setInvite({
                  ...invite, role: event.target.value,
                  // A manager is not scoped to projects, so a selection made
                  // before switching role would be sent and silently ignored.
                  project_ids: event.target.value === INSPECTOR ? invite.project_ids : [],
                })}>
                  {ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                </select></label>
              {invite.role === INSPECTOR && (
                <label className="wide"><span>Projects they may work on</span>
                  <div className="team-projects">
                    {projects.length === 0 ? <em>No projects yet — an Airis administrator sets those up.</em> : projects.map((project) => (
                      <button type="button" key={project.project_id}
                              className={invite.project_ids.includes(project.project_id) ? 'chip on' : 'chip'}
                              onClick={() => setInvite({ ...invite, project_ids: toggle(invite.project_ids, project.project_id) })}>
                        {invite.project_ids.includes(project.project_id) && <Check size={12} />}{project.name || project.project_id}
                      </button>
                    ))}
                  </div></label>
              )}
              <button className="primary-button" disabled={busy || !invite.email.trim()} onClick={() => void sendInvite()}>
                {busy ? <LoaderCircle className="spinner" size={15} /> : <Send size={15} />}
                {invite.role === INSPECTOR ? 'Send invitation' : 'Send to Airis'}
              </button>
            </div>
          </article>

          <article className="identity-card">
            <header><Users size={18} /><div><h2>People</h2><p>Role changes take effect on their next sign-in. Airis staff rows are managed by Airis.</p></div></header>
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
                      <select disabled={busy} value={member.role}
                              onChange={(event) => void changeRole(member, event.target.value)}>
                        {!ROLES.some((role) => role.key === member.role) &&
                          <option value={member.role}>{member.role_label}</option>}
                        {ROLES.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                      </select>
                      {member.role === INSPECTOR && (
                        <button disabled={busy}
                                onClick={() => { setEditing(editing === member.user_id ? '' : member.user_id); setDraft(member.project_ids); }}>
                          <FolderCheck size={13} /> Projects
                        </button>
                      )}
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
