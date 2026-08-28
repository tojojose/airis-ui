'use client';

import {
  AlertOctagon,
  Check,
  ChevronDown,
  CircleDashed,
  FileImage,
  ImagePlus,
  LoaderCircle,
  RotateCcw,
  Route,
  ShieldCheck,
  Tag,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type AirisAuthState } from './clerk-auth';

type Through = 'ingest' | 'route' | 'detect' | 'inspect' | 'escalate';
type RunStatus = 'ok' | 'skipped' | 'failed' | 'not_built';
type ConfigStatus = 'live' | 'off' | 'not_built';
type ModelInfo = Record<string, unknown>;

type StageInfo = {
  stage: string;
  number: number;
  status: ConfigStatus;
  endpoint?: string;
  model?: ModelInfo | null;
  description?: string;
};

type StageRecord = {
  stage: string;
  number: number;
  status: RunStatus;
  latency_ms: number;
  cost_usd: number;
  detail: Record<string, unknown>;
  error?: string;
};

type Stage1Response = {
  domain: string;
  router_source: 'project_metadata' | 'classifier' | 'fallback';
  fallback_reason?: 'blocked' | 'low_confidence' | 'unknown_domain';
  confidence: string;
  prompt_name: string;
  hazards: string[];
  queries: string[];
  model: ModelInfo | null;
  note: string;
  latency_ms: number;
};

type Citation = {
  section?: string;
  source_doc?: string;
  excerpt?: string;
  score?: number;
  kb?: string;
};

type ComplianceFinding = {
  id: string;
  category: string;
  description: string;
  severity: 'high' | 'medium' | 'low';
  confidence: string;
  confidence_score: number;
  bbox: [number, number, number, number] | null;
  citations: Citation[];
  escalation: {
    verdict: string;
    reason: string;
    model_id: string;
    crop_px?: [number, number];
  } | null;
};

type ComplianceResponse = {
  parse_ok: boolean;
  findings: ComplianceFinding[];
  models?: Record<string, unknown>;
};

type PipelineRunOut = {
  request_id: string;
  ran_through: Through;
  latency_ms: number;
  cost: { total_usd: number; [key: string]: unknown };
  stages: StageRecord[];
  stage0: { derivative?: string; [key: string]: unknown } | null;
  stage1: Stage1Response | null;
  findings: ComplianceResponse | null;
};

type Props = { auth: AirisAuthState };

const stageDefinitions = [
  { stage: 'ingest', number: 0, title: 'Ingest', description: 'Decode, correct orientation, hash and read capture metadata.' },
  { stage: 'route', number: 1, title: 'Route', description: 'Identify the site domain and narrow regulatory retrieval.' },
  { stage: 'detect', number: 2, title: 'Detect', description: 'Ground inspection with object and PPE counts.' },
  { stage: 'inspect', number: 3, title: 'Inspect', description: 'Reason over visible evidence and retrieved regulations.' },
  { stage: 'escalate', number: 4, title: 'Escalate', description: 'Request a second opinion for uncertain findings.' },
] as const;

const throughOptions: Array<{ value: Through; label: string; cost: string }> = [
  { value: 'ingest', label: 'Ingest only', cost: 'Image preparation only; no paid model.' },
  { value: 'route', label: 'Route', cost: 'Effectively free; no paid model is called.' },
  { value: 'detect', label: 'Detect', cost: 'Runs enabled grounding; model cost depends on configuration.' },
  { value: 'inspect', label: 'Inspect', cost: 'Calls the paid compliance model.' },
  { value: 'escalate', label: 'Escalate', cost: 'Adds a more expensive second-opinion model.' },
];

function formatCost(value?: number) {
  if (!value) return '—';
  return `$${value < 0.01 ? value.toFixed(6) : value.toFixed(4)}`;
}

function formatLatency(value?: number) {
  if (value === undefined || value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`;
}

function modelName(model?: ModelInfo | null) {
  if (!model) return 'No model';
  const named = model.model_id ?? model.id ?? model.name ?? model.model;
  return typeof named === 'string' ? named : 'Configured model';
}

function humanize(value: string) {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isPipelineRunOut(value: unknown): value is PipelineRunOut {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PipelineRunOut>;
  return typeof candidate.request_id === 'string'
    && typeof candidate.ran_through === 'string'
    && Array.isArray(candidate.stages)
    && Boolean(candidate.cost && typeof candidate.cost.total_usd === 'number');
}

function responseMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') return fallback;
  const detail = (payload as { detail?: unknown }).detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((item) => typeof item === 'string' ? item : JSON.stringify(item)).join(' ');
  return fallback;
}

function failedImpact(stage: string) {
  if (stage === 'route') return 'Regulatory retrieval was widened instead of narrowed.';
  if (stage === 'detect') return 'Findings continued without object-detection grounding.';
  if (stage === 'escalate') return 'No second opinion was available; primary findings remain visible.';
  return 'This required stage failed, so no complete inspection result is available.';
}

function StageIcon({ status }: { status: RunStatus | ConfigStatus | 'waiting' }) {
  if (status === 'ok' || status === 'live') return <Check size={18} />;
  if (status === 'failed') return <AlertOctagon size={18} />;
  if (status === 'not_built') return <CircleDashed size={18} />;
  if (status === 'skipped' || status === 'off') return <ChevronDown size={18} />;
  return <Workflow size={18} />;
}

export function PipelineRun({ auth }: Props) {
  const [configured, setConfigured] = useState<StageInfo[]>([]);
  const [configError, setConfigError] = useState<string | null>(null);
  const [through, setThrough] = useState<Through>('inspect');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [run, setRun] = useState<PipelineRunOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showRefuted, setShowRefuted] = useState(true);
  const [activeFinding, setActiveFinding] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  useEffect(() => {
    if (!auth.signedIn) return;
    let active = true;
    void (async () => {
      try {
        const token = await getClerkToken();
        if (!token) throw new Error('Sign in to load the pipeline configuration.');
        const params = new URLSearchParams();
        if (auth.organizationId) params.set('org_id', auth.organizationId);
        const suffix = params.size ? `?${params}` : '';
        const response = await fetch(`${API_URL}/v1/pipeline/stages${suffix}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) throw new Error(responseMessage(payload, `Could not load pipeline configuration (${response.status}).`));
        if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { stages?: unknown }).stages)) {
          throw new Error('The pipeline configuration response was not recognized.');
        }
        if (active) {
          setConfigured((payload as { stages: StageInfo[] }).stages);
          setConfigError(null);
        }
      } catch (caught) {
        if (active) setConfigError(caught instanceof Error ? caught.message : 'Could not load pipeline configuration.');
      }
    })();
    return () => { active = false; };
  }, [auth.organizationId, auth.signedIn]);

  const timeline = useMemo(() => stageDefinitions.map((definition) => {
    const record = run?.stages.find((item) => item.number === definition.number);
    const info = configured.find((item) => item.number === definition.number);
    return { ...definition, record, info };
  }), [configured, run]);

  const findings = useMemo(() => {
    const all = run?.findings?.findings ?? [];
    return showRefuted ? all : all.filter((finding) => finding.escalation?.verdict !== 'refuted');
  }, [run, showRefuted]);

  const refutedCount = run?.findings?.findings.filter((finding) => finding.escalation?.verdict === 'refuted').length ?? 0;
  const stageCost = run?.stages.reduce((sum, stage) => sum + (stage.cost_usd || 0), 0) ?? 0;
  const costMatches = run ? Math.abs(stageCost - run.cost.total_usd) < 0.0000005 : true;
  const selectedCost = throughOptions.find((item) => item.value === through)?.cost;
  const configLoading = auth.signedIn && configured.length === 0 && !configError;

  function selectFile(next?: File) {
    if (!next) return;
    setError(null);
    setRun(null);
    if (!next.type.startsWith('image/')) {
      setError('Choose a JPEG, PNG or WebP image.');
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      setError('This image is over the 10 MB gateway limit.');
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(next);
    setPreview(URL.createObjectURL(next));
  }

  function reset() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setPreview(null);
    setRun(null);
    setError(null);
    setActiveFinding(null);
  }

  async function runPipeline() {
    if (!file) return;
    setRunning(true);
    setError(null);
    setRun(null);
    try {
      const token = await getClerkToken(true);
      if (!token) throw new Error('Sign in with your Trominos account before running the pipeline.');
      const body = new FormData();
      body.append('image', file);
      if (auth.organizationId) body.append('org_id', auth.organizationId);
      const response = await fetch(`${API_URL}/v1/pipeline/run?through=${through}&include_derivative=true`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok) throw new Error(responseMessage(payload, `Pipeline run failed (${response.status}).`));
      if (!isPipelineRunOut(payload)) {
        throw new Error('The backend returned its legacy two-stage pipeline response. Deploy the five-stage PipelineRunOut contract before this screen can display a valid run.');
      }
      setRun(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The pipeline run could not be completed.');
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="pipeline-page">
      <header className="pipeline-heading">
        <div>
          <p className="kicker">EXPLAINABLE EXECUTION</p>
          <h1>Pipeline run</h1>
          <p>Follow one work-site image through preparation, routing, grounding, compliance inspection and escalation.</p>
        </div>
        <div className="pipeline-heading-badge"><Workflow size={18} /><span><strong>Five-stage trace</strong><small>Nothing hidden</small></span></div>
      </header>

      <section className="pipeline-timeline-card" aria-label="Pipeline stages">
        <div className="pipeline-card-title">
          <div><span>PIPELINE MAP</span><strong>{run ? `Run ${run.request_id}` : 'Configured execution path'}</strong></div>
          <span className="pipeline-refresh-state">{configLoading ? <><LoaderCircle className="spinner" size={14} /> Loading configuration</> : configError ? 'Configuration unavailable' : 'Configuration live'}</span>
        </div>
        <div className="pipeline-timeline">
          {timeline.map(({ record, info, ...definition }) => {
            const status: RunStatus | ConfigStatus | 'waiting' = record?.status ?? info?.status ?? 'waiting';
            const note = typeof record?.detail?.note === 'string' ? record.detail.note : '';
            return (
              <article className={`pipeline-stage status-${status}`} key={definition.stage}>
                <div className="stage-number">{definition.number}</div>
                <div className="stage-status-icon"><StageIcon status={status} /></div>
                <div className="stage-copy">
                  <div><h2>{definition.title}</h2><span className={`stage-chip ${status}`}>{status === 'off' ? 'off · skipped' : status}</span></div>
                  <p>{info?.description || definition.description}</p>
                  <dl>
                    <div><dt>Latency</dt><dd>{formatLatency(record?.latency_ms)}</dd></div>
                    <div><dt>Cost</dt><dd>{formatCost(record?.cost_usd)}</dd></div>
                    <div><dt>Model</dt><dd>{modelName(info?.model)}</dd></div>
                  </dl>
                  {(status === 'skipped' || status === 'off') && <p className="stage-explanation"><strong>Deliberately off.</strong> {note || 'This built stage is disabled by configuration.'}</p>}
                  {status === 'failed' && <p className="stage-explanation failed"><strong>{record?.error || 'Stage failed.'}</strong> {failedImpact(definition.stage)}</p>}
                  {status === 'not_built' && <p className="stage-explanation unbuilt"><strong>Not built.</strong> This stage does not exist in the current software yet.</p>}
                </div>
              </article>
            );
          })}
        </div>
        {configError && <div className="pipeline-inline-warning"><TriangleAlert size={16} />{configError}</div>}
      </section>

      <div className="pipeline-work-grid">
        <section className="pipeline-upload-card">
          <div className="pipeline-card-title"><div><span>NEW RUN</span><strong>Inspection source</strong></div></div>
          <div
            className={`pipeline-dropzone ${dragging ? 'dragging' : ''} ${preview ? 'has-file' : ''}`}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]); }}
            onClick={() => { if (!preview) input.current?.click(); }}
          >
            {preview ? <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Selected pipeline source" />
              <button className="pipeline-remove" onClick={(event) => { event.stopPropagation(); reset(); }} aria-label="Remove image"><X size={17} /></button>
              <div className="pipeline-file-meta"><FileImage size={18} /><span><strong>{file?.name}</strong><small>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : ''}</small></span></div>
            </> : <>
              <div className="pipeline-upload-icon"><ImagePlus size={25} /></div>
              <h2>Upload a work-site image</h2>
              <p>Drop a photo here or choose one from this device.</p>
              <button className="secondary-button" onClick={(event) => { event.stopPropagation(); input.current?.click(); }}><ImagePlus size={17} /> Choose image</button>
              <small>JPEG, PNG or WebP · up to 10 MB</small>
            </>}
            <input ref={input} hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => selectFile(event.target.files?.[0])} />
          </div>

          <label className="pipeline-through-label" htmlFor="pipeline-through">Run through</label>
          <select id="pipeline-through" className="pipeline-through" value={through} onChange={(event) => setThrough(event.target.value as Through)}>
            {throughOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
          <div className={`pipeline-cost-note cost-${through}`}><CircleDashed size={16} /><span>{selectedCost}</span></div>
          {error && <div className="pipeline-error" role="alert"><TriangleAlert size={18} /><span>{error}</span></div>}
          <button className="primary-button pipeline-run-button" disabled={!file || running || !auth.signedIn} onClick={runPipeline}>
            {running ? <LoaderCircle className="spinner" size={18} /> : <Workflow size={18} />}
            {running ? 'Running pipeline…' : 'Run pipeline'}
          </button>
          {!auth.signedIn && <p className="pipeline-signin-note">Sign in to run an inspection.</p>}
        </section>

        <section className="pipeline-route-card">
          <div className="pipeline-card-title"><div><span>ROUTING CONTEXT</span><strong>{run?.stage1 ? humanize(run.stage1.domain) : 'Available after routing'}</strong></div><Route size={20} /></div>
          {run?.stage1 ? <>
            {run.stage1.fallback_reason === 'blocked' && <div className="pipeline-data-gap"><TriangleAlert size={16} /><span>The site type was identified correctly, but no regulations are loaded for it. This is a data gap, not a routing failure.</span></div>}
            <dl className="route-details">
              <div><dt>Source</dt><dd>{humanize(run.stage1.router_source)}</dd></div>
              <div><dt>Confidence label</dt><dd>{run.stage1.confidence}</dd></div>
              <div><dt>Prompt</dt><dd>{run.stage1.prompt_name}</dd></div>
              <div><dt>Model call</dt><dd>{run.stage1.model ? modelName(run.stage1.model) : 'None — route is free'}</dd></div>
            </dl>
            <div className="hazard-section"><span><Tag size={14} /> HAZARD CONTEXT</span><div>{run.stage1.hazards.map((hazard) => <em key={hazard}>{humanize(hazard)}</em>)}</div></div>
          </> : <div className="pipeline-empty-route"><Route size={26} /><p>{run?.ran_through === 'ingest' ? 'This run stopped after ingest, so no routing response exists.' : 'Route an image to see its domain, prompt and hazard context.'}</p></div>}
        </section>
      </div>

      {run && <>
        <section className="pipeline-summary-card">
          <div><span>TOTAL LATENCY</span><strong>{formatLatency(run.latency_ms)}</strong></div>
          <div><span>TOTAL COST</span><strong>{formatCost(run.cost.total_usd)}</strong><small className={costMatches ? 'reconciled' : 'mismatch'}>{costMatches ? 'Stage costs reconciled' : `Stage sum ${formatCost(stageCost)} does not match`}</small></div>
          <div><span>RAN THROUGH</span><strong>{humanize(run.ran_through)}</strong>{run.ran_through === 'route' && <small className="reconciled">No paid model called</small>}</div>
          <div><span>REQUEST</span><strong className="request-id">{run.request_id}</strong></div>
        </section>

        {run.findings && <section className="pipeline-findings-section">
          <div className="pipeline-findings-heading">
            <div><p className="kicker">COMPLIANCE EVIDENCE</p><h2>Findings</h2><p>Boxes are drawn only on the orientation-corrected derivative returned by ingest.</p></div>
            {refutedCount > 0 && <label className="refuted-toggle"><input type="checkbox" checked={showRefuted} onChange={(event) => setShowRefuted(event.target.checked)} /><span>Show refuted ({refutedCount})</span></label>}
          </div>
          {!run.findings.parse_ok && <div className="pipeline-parse-warning"><AlertOctagon size={18} /><span><strong>Model output could not be parsed.</strong> This is not the same as finding no violations.</span></div>}
          {run.findings.parse_ok && run.findings.findings.length === 0 && <div className="pipeline-clear-state"><ShieldCheck size={30} /><div><strong>No violations found</strong><p>The response parsed successfully and contained no compliance findings.</p></div></div>}

          {run.findings.findings.length > 0 && <div className="findings-workspace">
            <div className="corrected-image-panel">
              {run.stage0?.derivative ? <div className="corrected-image-wrap">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={run.stage0.derivative} alt="Orientation-corrected inspection source" />
                {findings.map((finding, index) => finding.bbox && <button
                  key={finding.id}
                  className={`finding-box severity-${finding.severity} ${activeFinding === finding.id ? 'active' : ''} ${finding.escalation?.verdict === 'refuted' ? 'refuted' : ''}`}
                  style={{ left: `${finding.bbox[0] * 100}%`, top: `${finding.bbox[1] * 100}%`, width: `${(finding.bbox[2] - finding.bbox[0]) * 100}%`, height: `${(finding.bbox[3] - finding.bbox[1]) * 100}%` }}
                  onClick={() => setActiveFinding(finding.id)}
                  aria-label={`Finding ${index + 1}: ${finding.description}`}
                ><span>{index + 1}</span></button>)}
              </div> : <div className="derivative-missing"><FileImage size={27} /><p>The corrected derivative was not returned, so boxes cannot be drawn safely.</p></div>}
            </div>
            <div className="pipeline-finding-list">
              {findings.map((finding, index) => {
                const refuted = finding.escalation?.verdict === 'refuted';
                return <article
                  className={`pipeline-finding ${refuted ? 'is-refuted' : ''} ${activeFinding === finding.id ? 'active' : ''}`}
                  key={finding.id}
                  onMouseEnter={() => setActiveFinding(finding.id)}
                  onMouseLeave={() => setActiveFinding(null)}
                  onClick={() => setActiveFinding(finding.id)}
                >
                  <header><span className={`finding-index severity-${finding.severity}`}>{index + 1}</span><div><small>{finding.category}</small><strong>{finding.description}</strong></div><em className={`severity ${finding.severity}`}>{finding.severity}</em></header>
                  <div className="finding-confidence"><span><strong>{finding.confidence_score.toFixed(0)}%</strong> blended confidence</span><span><strong>{finding.confidence}</strong> model label</span>{!finding.bbox && <span><strong>No box</strong> absence finding</span>}</div>
                  {refuted && <div className="refuted-verdict"><X size={15} /><span><strong>Refuted by escalation</strong>{finding.escalation?.reason}</span></div>}
                  {finding.citations.map((citation, citationIndex) => {
                    const unidentified = !citation.section || citation.section.toLowerCase() === 'see excerpt';
                    return <div className="finding-citation" key={`${finding.id}-${citationIndex}`}>
                      <span>{unidentified ? 'Section unidentified' : `Section ${citation.section}`}{citation.kb ? ` · ${citation.kb}` : ''}</span>
                      {citation.excerpt && <blockquote>{citation.excerpt}</blockquote>}
                    </div>;
                  })}
                </article>;
              })}
              {!findings.length && refutedCount > 0 && <div className="filtered-empty">Refuted findings are hidden by the current filter.</div>}
            </div>
          </div>}

          {run.findings.models && <div className="pipeline-models"><span>MODELS BY STAGE</span><div>{Object.entries(run.findings.models).map(([stage, model]) => <p key={stage}><strong>{humanize(stage)}</strong><em>{typeof model === 'string' ? model : JSON.stringify(model)}</em></p>)}</div></div>}
        </section>}
      </>}

      {run && <button className="secondary-button pipeline-new-run" onClick={reset}><RotateCcw size={16} /> New pipeline run</button>}
    </div>
  );
}
