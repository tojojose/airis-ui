'use client';

import {
  Activity,
  BookOpenText,
  Bot,
  Building2,
  Camera,
  Check,
  ChevronDown,
  CircleDollarSign,
  FileCheck2,
  FilePenLine,
  FlaskConical,
  History,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Menu,
  RotateCcw,
  ScanSearch,
  ShieldCheck,
  UserRoundCog,
  Sparkles,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConsole, type AdminView } from './admin-console';
import { API_URL } from './api-config';
import { ClerkAuth, getClerkToken, type VisinexaAuthState } from './clerk-auth';
import { KnowledgeBasePage } from './knowledge-base/knowledge-base-page';
import { ClientManagement } from './client-management';
import { InspectionHistory } from './inspection-history';
import { IdentityAccess } from './identity-access';
import { Administrators } from './administrators';
import { PipelineRun } from './pipeline-run';
import { PortfolioBudgets } from './portfolio-budgets';
import { ProjectTemplates } from './project-templates';
import { PromptStudio } from './prompt-studio';
import { Team } from './team';
import { NotificationCenter } from './notification-center';

type Finding = {
  id: string;
  category: string;
  description: string;
  severity: string;
  confidence: string;
  confidence_score?: number;
  retrieval_score?: number | null;
  verification_status?: 'unverified' | 'confirmed' | 'refuted' | 'indeterminate';
  verification_reason?: string;
  display_status?: 'actionable' | 'needs_human_review' | 'hidden_refuted';
  citations?: Array<{ section?: string; text?: string; source?: string }>;
};

type AnalysisResult = {
  request_id: string;
  model: string;
  latency_ms: number;
  parse_ok: boolean;
  summary: { total: number; by_category: Record<string, number> };
  findings: Finding[];
  site_classification?: { project_type: string; confidence: string };
};

const profiles = [
  {
    id: 'safety',
    name: 'Visual safety scan',
    label: 'Verified visual inspection',
    detail: 'Detects visible safety risks, then independently reviews each proposed finding against the original image.',
    endpoint: '/v1/analyze',
    policies: '5 categories',
    knowledge: 'Built-in prompt',
  },
  {
    id: 'compliance',
    name: 'Regulatory compliance',
    label: 'RAG-grounded inspection',
    detail: 'Checks visual evidence against retrieved OSHA and MUTCD sources.',
    endpoint: '/v1/compliance',
    policies: 'OSHA + MUTCD',
    knowledge: 'Live retrieval',
  },
];

type PortfolioView = 'clients' | 'identity' | 'administrators' | 'portfolio-budgets' | 'project-templates';
type AppView = 'analyze' | 'pipeline' | 'pipeline-history' | 'evaluation' | 'evaluation-history' | 'team' | PortfolioView | AdminView;
const adminViews: AppView[] = ['clients', 'identity', 'administrators', 'portfolio-budgets', 'project-templates', 'knowledge', 'prompts', 'models', 'usage'];
const initialAuth: VisinexaAuthState = { ready: false, signedIn: false, userId: null, isAdmin: false, isInspector: false, isManager: false, organizationId: null, organizationSlug: null, organizationName: 'Operations workspace' };

// ---------------------------------------------------------------- branding
// Visinexa is the OPERATOR identity: it belongs on the sign-in screen and in
// admin chrome only. A client signing in sees their OWN organization and no
// vendor mark at all - see plans/07-visinexa-rebrand.md for why.
function VisinexaMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="5" y="8" width="30" height="3.2" rx="1.6" fill="currentColor" />
      <g fill="none" stroke="currentColor" strokeWidth="3.3" strokeLinecap="round" opacity="0.82">
        <path d="M8 15 L20 32" />
        <path d="M32 15 L20 32" />
      </g>
    </svg>
  );
}

function VisinexaLockup() {
  return (
    <div className="brand-lockup">
      <div className="brand-mark"><VisinexaMark /></div>
      <div><strong>visinexa</strong><span>vision governance</span></div>
    </div>
  );
}

function WorkspaceBrand({ isAdmin, organizationName }: { isAdmin: boolean; organizationName: string }) {
  if (isAdmin) {
    return (
      <div className="brand-lockup">
        <div className="brand-mark"><VisinexaMark /></div>
        <div><strong>visinexa</strong><span>operations</span></div>
      </div>
    );
  }
  // White-label: the client's own initial and name, no vendor branding.
  const initial = (organizationName || 'W').trim().charAt(0).toUpperCase();
  return (
    <div className="brand-lockup">
      <div className="brand-mark client-mark" aria-hidden="true">{initial}</div>
      <div><strong className="client-brand-name">{organizationName}</strong><span>safety compliance</span></div>
    </div>
  );
}

export default function Home() {
  const [profileId, setProfileId] = useState('safety');
  const [showProfiles, setShowProfiles] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<VisinexaAuthState>(initialAuth);
  const [view, setView] = useState<AppView>('pipeline');
  const [inspectionScope, setInspectionScope] = useState({ orgId: '', orgName: '', projectId: '', projectName: '' });
  // An inspector's sites live in the nav rather than a dropdown, so the shell
  // needs the list. Only fetched for that persona - nobody else's nav uses it.
  const [inspectorSites, setInspectorSites] = useState<{ project_id: string; name: string }[]>([]);
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const profile = useMemo(() => profiles.find((item) => item.id === profileId) ?? profiles[0], [profileId]);
  const visibleFindings = useMemo(() => result?.findings.filter((finding) =>
    finding.display_status !== 'hidden_refuted' && finding.verification_status !== 'refuted') ?? [], [result]);
  const handleAuthChange = useCallback((next: VisinexaAuthState) => {
    setAuth(next);
    if (!next.isAdmin) setView((current) => adminViews.includes(current as AdminView) ? 'pipeline' : current);
  }, []);
  const handleInspectionScopeChange = useCallback((scope: { orgId: string; orgName: string; projectId: string; projectName: string }) => {
    setInspectionScope(scope);
  }, []);
  const topbarOrganizationName = auth.isAdmin
    && ['pipeline', 'pipeline-history', 'evaluation', 'evaluation-history'].includes(view)
    && inspectionScope.orgName
    ? inspectionScope.orgName
    : auth.organizationName;

  useEffect(() => {
    if (!auth.signedIn || !auth.isInspector) { setInspectorSites([]); return; }
    let active = true;
    void (async () => {
      try {
        const token = await getClerkToken(true);
        if (!token) return;
        const response = await fetch(`${API_URL}/v1/projects`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const body = await response.json() as { projects?: { project_id: string; name: string }[] };
        if (!active) return;
        const sites = body.projects || [];
        setInspectorSites(sites);
        // Pin the site so the screens never have to ask. With one site there is
        // nothing to choose; with several the nav choice is the answer.
        setInspectionScope((current) => current.projectId
          && sites.some((site) => site.project_id === current.projectId)
          ? current
          : (sites[0]
            ? { orgId: auth.organizationId || '', orgName: auth.organizationName,
                projectId: sites[0].project_id, projectName: sites[0].name }
            : current));
      } catch { /* the screens still work; the nav just has no shortcuts */ }
    })();
    return () => { active = false; };
  }, [auth.isInspector, auth.organizationId, auth.organizationName, auth.signedIn]);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  function selectFile(nextFile?: File) {
    if (!nextFile) return;
    setError(null);
    setResult(null);
    setPhase('idle');
    if (!nextFile.type.startsWith('image/')) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setError('This image is over 10 MB. Use the large-file upload flow for this source.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(nextFile);
    setPreview(URL.createObjectURL(nextFile));
  }

  function clearImage() {
    if (preview) URL.revokeObjectURL(preview);
    setPreview(null);
    setFile(null);
    setResult(null);
    setError(null);
    setPhase('idle');
  }

  async function runInspection() {
    if (!file) return;
    setError(null);
    setResult(null);
    setPhase('running');
    try {
      const token = await getClerkToken();
      if (!token) throw new Error('Sign in with your Trominos account before running an inspection.');
      const body = new FormData();
      body.append('image', file);
      if (profile.id === 'safety') body.append('tier', 'default');
      const response = await fetch(`${API_URL}${profile.endpoint}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      if (!response.ok) {
        let message = `Inspection failed (${response.status})`;
        try {
          const payload = await response.json() as { detail?: string };
          if (payload.detail) message = payload.detail;
        } catch { /* API did not return JSON */ }
        if (response.status === 401) message = 'Your session expired. Sign in again and retry.';
        throw new Error(message);
      }
      setResult(await response.json() as AnalysisResult);
      setPhase('done');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The inspection could not be completed.');
      setPhase('idle');
    }
  }

  if (!auth.signedIn) {
    return <main className="signed-out-shell">
      <header className="signed-out-header">
        <VisinexaLockup />
        <span className="signed-out-security">Authorized access only</span>
      </header>
      <section className="signed-out-card" aria-labelledby="signed-out-title">
        <div className="signed-out-mark"><ShieldCheck size={34} strokeWidth={1.8} /></div>
        <p className="kicker">SECURE WORKSPACE</p>
        <h1 id="signed-out-title">Sign in to Visinexa</h1>
        <p>Access inspections, project history, and approved safety information through your authorized organization.</p>
        <ClerkAuth onChange={handleAuthChange} />
      </section>
    </main>;
  }

  return (
    <main className="app-shell">
      <aside className={`sidebar ${auth.isAdmin ? 'admin-sidebar' : ''}`}>
        <WorkspaceBrand isAdmin={auth.isAdmin} organizationName={auth.organizationName} />
        <nav aria-label="Primary navigation">
          {/* INSPECTOR: the sites they may work on ARE the navigation. There is no
              project dropdown anywhere in their app - choosing here is the only
              place it is asked, and with one site it is not asked at all. */}
          {auth.isInspector ? <>
            <p className="nav-section nav-section-first">{inspectorSites.length > 1 ? 'YOUR SITES' : 'YOUR SITE'}</p>
            {inspectorSites.map((site) => {
              const here = inspectionScope.projectId === site.project_id;
              const pick = () => setInspectionScope({
                orgId: auth.organizationId || '', orgName: auth.organizationName,
                projectId: site.project_id, projectName: site.name });
              // Past checks hangs off its site rather than sitting on its own,
              // because a check only ever belongs to one site - a single global
              // entry would have to ask which, and asking is what this nav is
              // for avoiding.
              return <Fragment key={site.project_id}>
                <button className={`nav-item ${here && view === 'pipeline' ? 'active' : ''}`}
                        onClick={() => { pick(); setView('pipeline'); }}>
                  <Building2 size={18} /><span>{site.name}</span>
                </button>
                <button className={`nav-item subnav-item ${here && view === 'pipeline-history' ? 'active' : ''}`}
                        onClick={() => { pick(); setView('pipeline-history'); }}>
                  <History size={15} /><span>Past checks</span>
                </button>
              </Fragment>;
            })}
          </> : <>
            {auth.isAdmin && <p className="nav-section nav-section-first">SOLUTION DISCOVERY</p>}
            <button className={`nav-item ${view === 'pipeline' ? 'active' : ''}`} onClick={() => setView('pipeline')}><Workflow size={18} /><span>New Inspection</span></button>
            <button className={`nav-item subnav-item ${view === 'pipeline-history' ? 'active' : ''}`} aria-label="Inspection history" onClick={() => setView('pipeline-history')}><History size={15} /><span>Inspection History</span></button>
          </>}
          {auth.isManager && !auth.isAdmin && <button className={`nav-item subnav-item ${view === 'team' ? 'active' : ''}`} onClick={() => setView('team')}><UserRoundCog size={15} /><span>Team</span></button>}
          {auth.isAdmin && <>
            <p className="nav-section">CLIENT PORTFOLIOS</p>
            <button className={`nav-item ${view === 'clients' ? 'active' : ''}`} onClick={() => setView('clients')}><Building2 size={18} /><span>Clients &amp; Projects</span></button>
            <button className={`nav-item subnav-item ${view === 'identity' ? 'active' : ''}`} onClick={() => setView('identity')}><UserRoundCog size={15} /><span>Identity &amp; Access</span></button>
            <button className={`nav-item subnav-item ${view === 'portfolio-budgets' ? 'active' : ''}`} onClick={() => setView('portfolio-budgets')}><CircleDollarSign size={15} /><span>Budgets &amp; Usage</span></button>
            <button className={`nav-item subnav-item ${view === 'project-templates' ? 'active' : ''}`} onClick={() => setView('project-templates')}><Layers3 size={15} /><span>Project Templates</span></button>
            <p className="nav-section">GOVERNANCE</p>
            <button className={`nav-item ${view === 'knowledge' ? 'active' : ''}`} onClick={() => setView('knowledge')}><BookOpenText size={18} /><span>Knowledge Base</span></button>
            <button className={`nav-item ${view === 'prompts' ? 'active' : ''}`} onClick={() => setView('prompts')}><FilePenLine size={18} /><span>Prompt Studio</span></button>
            <button className={`nav-item ${view === 'models' ? 'active' : ''}`} onClick={() => setView('models')}><Bot size={18} /><span>Models</span></button>
            <button className={`nav-item ${view === 'evaluation' ? 'active' : ''}`} onClick={() => { setInspectionScope({ orgId: '', orgName: '', projectId: '', projectName: '' }); setView('evaluation'); }}><FlaskConical size={18} /><span>Evaluation Lab</span></button>
            <button className={`nav-item subnav-item ${view === 'evaluation-history' ? 'active' : ''}`} onClick={() => setView('evaluation-history')}><History size={15} /><span>Evaluation History</span></button>
            <button className={`nav-item ${view === 'administrators' ? 'active' : ''}`} onClick={() => setView('administrators')}><ShieldCheck size={15} /><span>Administrators</span></button>
            <p className="nav-section">USAGE ANALYTICS</p>
            <button className={`nav-item ${view === 'usage' ? 'active' : ''}`} onClick={() => setView('usage')}><CircleDollarSign size={18} /><span>Usage &amp; Cost</span></button>
          </>}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <div className="eyebrow">{auth.isInspector ? (view === 'pipeline-history' ? 'PAST CHECKS' : 'SITE')
                : auth.isAdmin ? 'VISINEXA OPERATIONS' : 'SAFETY COMPLIANCE'}</div>
              <div className="workspace-title">{auth.isInspector
                ? (inspectionScope.projectName || auth.organizationName)
                : topbarOrganizationName}</div>
            </div>
          </div>
          <div className="topbar-actions">
            {/* Backend status is not an inspector's problem. */}
            {!auth.isInspector && <span className="connection"><span /> API connected</span>}
            <NotificationCenter auth={auth} />
            {auth.isAdmin && <div className="persona-card topbar-persona"><span className="admin">V</span><div><strong>Visinexa Admin</strong><small>{auth.organizationName}</small></div></div>}
            <ClerkAuth onChange={handleAuthChange} />
          </div>
        </header>

        {view === 'analyze' && <div className="content-grid">
          <section className="main-column">
            <div className="welcome-row">
              <div>
                <p className="kicker">VISUAL INTELLIGENCE · LIVE</p>
                <h1>{result ? 'Inspection evidence' : 'What would you like to inspect?'}</h1>
                <p className="lede">{result ? 'Review the detected risks, confidence, and supporting context before taking action.' : 'Capture or upload an image. Your organization’s visual policies and supporting knowledge are applied automatically.'}</p>
              </div>
              <div className="live-pill"><Activity size={15} /> Multi-device ready</div>
            </div>

            <div className={`capture-card ${preview ? 'has-preview' : ''}`}>
              <div
                className={`capture-visual ${dragging ? 'is-dragging' : ''}`}
                onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
                onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
              >
                <div className="viewfinder-corner tl" /><div className="viewfinder-corner tr" />
                <div className="viewfinder-corner bl" /><div className="viewfinder-corner br" />
                {preview ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="image-preview" src={preview} alt="Selected inspection source" />
                    <button className="clear-image" onClick={clearImage} aria-label="Remove selected image"><X size={17} /></button>
                    <div className="preview-controls">
                      <div><span>{file?.name}</span><small>{file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : ''}</small></div>
                      <button className="primary-button" onClick={runInspection} disabled={phase === 'running'}>
                        {phase === 'running' ? <LoaderCircle className="spinner" size={18} /> : <ScanSearch size={18} />}
                        {phase === 'running' ? 'Analyzing and verifying…' : 'Run inspection'}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    {dragging && <div className="drop-overlay"><ImagePlus size={30} /><strong>Drop image to inspect</strong></div>}
                    <div className="camera-orb"><Camera size={27} /></div>
                    <h2>Start a visual inspection</h2>
                    <p>Use your device camera or choose an existing photo.</p>
                    <div className="capture-actions">
                      <button className="primary-button" onClick={() => cameraInput.current?.click()}><Camera size={18} /> Open camera</button>
                      <button className="secondary-button" onClick={() => uploadInput.current?.click()}><ImagePlus size={18} /> Upload image</button>
                    </div>
                    <span className="file-note">JPEG, PNG or WebP · up to 10 MB <span className="desktop-only">· drag and drop supported</span></span>
                  </>
                )}
                <input ref={cameraInput} hidden type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} />
                <input ref={uploadInput} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} />
              </div>
              <div className="profile-strip">
                <div><span className="profile-label">ACTIVE INSPECTION PROFILE</span><strong>{profile.name}</strong></div>
                <button className="change-button" onClick={() => setShowProfiles(true)}>Change <ChevronDown size={14} /></button>
              </div>
            </div>

            {error && <div className="error-banner" role="alert"><TriangleAlert size={18} /><span>{error}</span><button onClick={() => setError(null)} aria-label="Dismiss error"><X size={16} /></button></div>}

            {result ? (
              <section className="results-section" aria-live="polite">
                <div className="result-summary">
                  <div className={visibleFindings.length ? 'summary-icon alert' : 'summary-icon'}>{visibleFindings.length ? <TriangleAlert size={22} /> : <Check size={22} />}</div>
                  <div><p className="kicker">ANALYSIS COMPLETE</p><h2>{visibleFindings.length ? `${visibleFindings.length} potential finding${visibleFindings.length === 1 ? '' : 's'} require review` : 'No supported visible violations detected'}</h2><span>{result.model} · {(result.latency_ms / 1000).toFixed(1)} seconds</span></div>
                  <button className="secondary-button compact" onClick={clearImage}><RotateCcw size={15} /> New inspection</button>
                </div>
                <div className="result-list">
                  {visibleFindings.map((finding, index) => (
                    <article className="result-finding" key={finding.id || index}>
                      <div className={`severity ${finding.severity?.toLowerCase()}`}>{finding.severity || 'review'}</div>
                      <div className="finding-body"><div><span>{finding.category}</span><strong>{finding.verification_status === 'confirmed' ? 'Confirmed by evidence review' : finding.verification_status === 'indeterminate' ? 'Could not verify — human review' : 'Unverified — human review'}</strong></div><p>{finding.description}</p>{finding.citations?.length ? <small>{finding.citations[0].section || finding.citations[0].source || 'Knowledge-base citation available'}</small> : null}</div>
                    </article>
                  ))}
                  {!visibleFindings.length && <div className="clear-result"><ShieldCheck size={30} /><p>No supported visible issues remain after evidence review. Retain this result as evidence or begin another inspection.</p></div>}
                </div>
              </section>
            ) : (
              <>
                <div className="section-heading"><div><p className="kicker">SUPPORTED SOURCES</p><h2>One workflow, every field device</h2></div><span className="source-count">Mobile · CCTV · IP camera</span></div>
                <article className="inspection-card">
                  <div className="inspection-thumb" aria-label="Connected camera source"><span>CAM 04</span></div>
                  <div className="inspection-copy">
                    <div className="inspection-title"><div><span className="status-dot" /> Ready</div><time>Secure connection</time></div>
                    <h3>Capture now or connect a source</h3>
                    <p>Start on iPhone, iPad, Android, or forward images from a fixed camera workflow.</p>
                    <div className="finding-row">
                      <div className="finding good"><FileCheck2 size={15} /><span><small>Mobile capture</small><strong>Camera ready</strong></span></div>
                      <div className="finding good"><Activity size={15} /><span><small>API ingestion</small><strong>Available</strong></span></div>
                      <div className="finding warn"><Layers3 size={15} /><span><small>Deployment</small><strong>SaaS or AWS</strong></span></div>
                    </div>
                  </div>
                </article>
              </>
            )}
          </section>

          <aside className="context-panel">
            <div className="context-top"><p className="kicker">ACTIVE PROFILE</p><div className="profile-icon"><Sparkles size={21} /></div><h2>{profile.name}</h2><p>{profile.detail}</p></div>
            <div className="policy-list">
              <div><span>Vision analysis</span><strong>Enabled</strong></div>
              <div><span>Detection scope</span><strong>{profile.policies}</strong></div>
              <div><span>Knowledge context</span><strong>{profile.knowledge}</strong></div>
              <div><span>Evidence output</span><strong>Structured</strong></div>
            </div>
            <button className="profile-button" onClick={() => setShowProfiles(true)}>Manage profile <span>↗</span></button>
            <div className="privacy-note"><ShieldCheck size={17} /><p><strong>Private by design</strong><br />Authentication uses your Trominos Clerk session. Images are sent directly to the configured API.</p></div>
          </aside>
        </div>}

        {view === 'pipeline-history' && <InspectionHistory auth={auth} purpose="operational" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onScopeChange={handleInspectionScopeChange} />}
        {view === 'evaluation-history' && auth.isAdmin && <InspectionHistory auth={auth} purpose="evaluation" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onScopeChange={handleInspectionScopeChange} />}

        {view === 'pipeline' && <PipelineRun auth={auth} purpose="operational" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onHistory={() => setView('pipeline-history')} onScopeChange={handleInspectionScopeChange} />}
        {view === 'evaluation' && auth.isAdmin && <PipelineRun auth={auth} purpose="evaluation" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onHistory={() => setView('evaluation-history')} onScopeChange={handleInspectionScopeChange} />}

        {view === 'knowledge' && auth.isAdmin && <KnowledgeBasePage organizationName={auth.organizationName} />}
        {view === 'clients' && auth.isAdmin && <ClientManagement auth={auth} onInspect={(orgId, projectId) => { setInspectionScope({ orgId, orgName: '', projectId, projectName: '' }); setView('pipeline'); }} onHistory={(orgId, projectId) => { setInspectionScope({ orgId, orgName: '', projectId, projectName: '' }); setView('pipeline-history'); }} />}
        {view === 'identity' && auth.isAdmin && <IdentityAccess />}
        {view === 'administrators' && auth.isAdmin && <Administrators currentUserId={auth.userId} />}
        {view === 'portfolio-budgets' && auth.isAdmin && <PortfolioBudgets />}
        {view === 'project-templates' && auth.isAdmin && <ProjectTemplates />}
        {view === 'team' && auth.isManager && <Team organizationName={auth.organizationName} />}
        {view === 'prompts' && auth.isAdmin && <PromptStudio organizationName={auth.organizationName} />}
        {(['models', 'usage'] as AppView[]).includes(view) && auth.isAdmin && <AdminConsole view={view as AdminView} organizationName={auth.organizationName} />}

        <nav className="mobile-tabs" aria-label="Mobile navigation">
          <button className={view === 'pipeline' ? 'active' : ''} onClick={() => setView('pipeline')}><Workflow size={19} /><span>Inspect</span></button>
          <button className={view === 'pipeline-history' ? 'active' : ''} onClick={() => setView('pipeline-history')}><History size={19} /><span>History</span></button>
          {auth.isAdmin && <button className={adminViews.includes(view as AdminView) || view === 'evaluation' || view === 'evaluation-history' ? 'active' : ''} onClick={() => setView('clients')}><Building2 size={19} /><span>Admin</span></button>}
        </nav>
      </section>

      {showProfiles && (
        <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowProfiles(false); }}>
          <section className="profile-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-title">
            <div className="sheet-handle" />
            <div className="sheet-heading"><div><p className="kicker">CONFIGURATION</p><h2 id="profile-title">Choose an inspection profile</h2></div><button onClick={() => setShowProfiles(false)} aria-label="Close"><X size={20} /></button></div>
            <p className="sheet-copy">Profiles control the analysis path, policy scope, and knowledge used to evaluate each image.</p>
            <div className="profile-options">
              {profiles.map((item) => (
                <button key={item.id} className={item.id === profileId ? 'selected' : ''} onClick={() => { setProfileId(item.id); setResult(null); setShowProfiles(false); }}>
                  <span className="option-icon">{item.id === 'compliance' ? <FileCheck2 size={20} /> : <ScanSearch size={20} />}</span>
                  <span><strong>{item.name}</strong><small>{item.label}</small><em>{item.detail}</em></span>
                  <span className="radio">{item.id === profileId && <Check size={14} />}</span>
                </button>
              ))}
            </div>
            <div className="profile-future"><Layers3 size={18} /><p><strong>Designed for configurable domains</strong><br />Add warehouse, factory, retail, security, or customer-specific profiles as the backend configuration layer expands.</p></div>
          </section>
        </div>
      )}
    </main>
  );
}
