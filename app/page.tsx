'use client';

import {
  Activity,
  Bell,
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
  Sparkles,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminConsole, type AdminView } from './admin-console';
import { API_URL } from './api-config';
import { ClerkAuth, getClerkToken, type AirisAuthState } from './clerk-auth';
import { KnowledgeBasePage } from './knowledge-base/knowledge-base-page';
import { ClientManagement } from './client-management';
import { InspectionHistory } from './inspection-history';
import { PipelineRun } from './pipeline-run';
import { PortfolioBudgets } from './portfolio-budgets';
import { ProjectTemplates } from './project-templates';

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

type PortfolioView = 'clients' | 'portfolio-budgets' | 'project-templates';
type AppView = 'analyze' | 'pipeline' | 'pipeline-history' | 'evaluation' | 'evaluation-history' | PortfolioView | AdminView;
const adminViews: AppView[] = ['clients', 'portfolio-budgets', 'project-templates', 'knowledge', 'prompts', 'models', 'usage'];
const initialAuth: AirisAuthState = { ready: false, signedIn: false, isAdmin: false, organizationId: null, organizationSlug: null, organizationName: 'Operations workspace' };

export default function Home() {
  const [profileId, setProfileId] = useState('safety');
  const [showProfiles, setShowProfiles] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const [dragging, setDragging] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [auth, setAuth] = useState<AirisAuthState>(initialAuth);
  const [view, setView] = useState<AppView>('pipeline');
  const [inspectionScope, setInspectionScope] = useState({ orgId: '', projectId: '' });
  const cameraInput = useRef<HTMLInputElement>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const profile = useMemo(() => profiles.find((item) => item.id === profileId) ?? profiles[0], [profileId]);
  const visibleFindings = useMemo(() => result?.findings.filter((finding) =>
    finding.display_status !== 'hidden_refuted' && finding.verification_status !== 'refuted') ?? [], [result]);
  const handleAuthChange = useCallback((next: AirisAuthState) => {
    setAuth(next);
    if (!next.isAdmin) setView((current) => adminViews.includes(current as AdminView) ? 'pipeline' : current);
  }, []);

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

  return (
    <main className="app-shell">
      <aside className={`sidebar ${auth.isAdmin ? 'admin-sidebar' : ''}`}>
        <div className="brand-lockup"><div className="brand-mark"><ShieldCheck size={22} strokeWidth={2.2} /></div><div><strong>airis</strong><span>vision governance</span></div></div>
        <nav aria-label="Primary navigation">
          {auth.isAdmin && <p className="nav-section nav-section-first">SOLUTION DISCOVERY</p>}
          <button className={`nav-item ${view === 'pipeline' ? 'active' : ''}`} onClick={() => setView('pipeline')}><Workflow size={18} /><span>New Inspection</span></button>
          <button className={`nav-item subnav-item ${view === 'pipeline-history' ? 'active' : ''}`} aria-label="Inspection history" onClick={() => setView('pipeline-history')}><History size={15} /><span>Inspection History</span></button>
          {auth.isAdmin && <>
            <p className="nav-section">CLIENT PORTFOLIOS</p>
            <button className={`nav-item ${view === 'clients' ? 'active' : ''}`} onClick={() => setView('clients')}><Building2 size={18} /><span>Clients &amp; Projects</span></button>
            <button className={`nav-item subnav-item ${view === 'portfolio-budgets' ? 'active' : ''}`} onClick={() => setView('portfolio-budgets')}><CircleDollarSign size={15} /><span>Budgets &amp; Usage</span></button>
            <button className={`nav-item subnav-item ${view === 'project-templates' ? 'active' : ''}`} onClick={() => setView('project-templates')}><Layers3 size={15} /><span>Project Templates</span></button>
            <p className="nav-section">AI GOVERNANCE</p>
            <button className={`nav-item ${view === 'knowledge' ? 'active' : ''}`} onClick={() => setView('knowledge')}><BookOpenText size={18} /><span>Knowledge Base</span></button>
            <button className={`nav-item ${view === 'prompts' ? 'active' : ''}`} onClick={() => setView('prompts')}><FilePenLine size={18} /><span>Prompt Studio</span></button>
            <button className={`nav-item ${view === 'models' ? 'active' : ''}`} onClick={() => setView('models')}><Bot size={18} /><span>Models</span></button>
            <button className={`nav-item ${view === 'evaluation' ? 'active' : ''}`} onClick={() => { setInspectionScope({ orgId: '', projectId: '' }); setView('evaluation'); }}><FlaskConical size={18} /><span>Evaluation Lab</span></button>
            <button className={`nav-item subnav-item ${view === 'evaluation-history' ? 'active' : ''}`} onClick={() => setView('evaluation-history')}><History size={15} /><span>Evaluation History</span></button>
            <p className="nav-section">USAGE ANALYTICS</p>
            <button className={`nav-item ${view === 'usage' ? 'active' : ''}`} onClick={() => setView('usage')}><CircleDollarSign size={18} /><span>Usage &amp; Cost</span></button>
          </>}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <div>
              <div className="eyebrow">{auth.isAdmin ? 'AIRIS ADMIN' : 'VISION GOVERNANCE'}</div>
              <div className="workspace-title">{auth.organizationName}</div>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="connection"><span /> API connected</span>
            <button className="icon-button" aria-label="Notifications"><Bell size={18} /></button>
            {auth.isAdmin && <div className="persona-card topbar-persona"><span className="admin">A</span><div><strong>Airis Admin</strong><small>{auth.organizationName}</small></div></div>}
            <ClerkAuth onChange={handleAuthChange} />
          </div>
        </header>

        {view === 'analyze' && <div className="content-grid">
          <section className="main-column">
            <div className="welcome-row">
              <div>
                <p className="kicker">VISUAL INTELLIGENCE · LIVE</p>
                <h1>{result ? 'Inspection evidence' : 'What would you like to inspect?'}</h1>
                <p className="lede">{result ? 'Review the detected risks, confidence, and supporting context before taking action.' : 'Capture or upload an image. Airis applies your organization’s visual policies and supporting knowledge.'}</p>
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

        {view === 'pipeline-history' && <InspectionHistory auth={auth} purpose="operational" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} />}
        {view === 'evaluation-history' && auth.isAdmin && <InspectionHistory auth={auth} purpose="evaluation" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} />}

        {view === 'pipeline' && <PipelineRun auth={auth} purpose="operational" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onHistory={() => setView('pipeline-history')} />}
        {view === 'evaluation' && auth.isAdmin && <PipelineRun auth={auth} purpose="evaluation" initialOrgId={inspectionScope.orgId} initialProjectId={inspectionScope.projectId} onHistory={() => setView('evaluation-history')} />}

        {view === 'knowledge' && auth.isAdmin && <KnowledgeBasePage organizationName={auth.organizationName} />}
        {view === 'clients' && auth.isAdmin && <ClientManagement auth={auth} onInspect={(orgId, projectId) => { setInspectionScope({ orgId, projectId }); setView('pipeline'); }} onHistory={(orgId, projectId) => { setInspectionScope({ orgId, projectId }); setView('pipeline-history'); }} />}
        {view === 'portfolio-budgets' && auth.isAdmin && <PortfolioBudgets />}
        {view === 'project-templates' && auth.isAdmin && <ProjectTemplates />}
        {view !== 'knowledge' && !(['clients', 'portfolio-budgets', 'project-templates'] as AppView[]).includes(view) && (['prompts', 'models', 'usage'] as AppView[]).includes(view) && auth.isAdmin && <AdminConsole view={view as AdminView} organizationName={auth.organizationName} />}

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
