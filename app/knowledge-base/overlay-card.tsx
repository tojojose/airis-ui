import { Building2, Factory, FileText, LockKeyhole, MapPinned } from 'lucide-react';
import type { KbCatalogNode } from './types';

type OverlayKind = 'industry' | 'organization' | 'project';

const config = {
  industry: { label: 'Industry overlay', Icon: Factory, badge: 'Vertical standard' },
  organization: { label: 'Organization overlay', Icon: Building2, badge: 'Private' },
  project: { label: 'Project overlay', Icon: MapPinned, badge: 'Project-specific' },
};

export function OverlayCard({ kind, node, fallback, active = true, onToggle }: {
  kind: OverlayKind;
  node?: KbCatalogNode;
  fallback: string;
  active?: boolean;
  onToggle?: () => void;
}) {
  const { label, Icon, badge } = config[kind];
  const enabled = Boolean(node);
  return (
    <article className={`kb-overlay-card ${enabled ? 'enabled' : 'empty'} ${enabled && !active ? 'inactive' : ''}`}>
      <div className="kb-overlay-icon"><Icon size={19} /></div>
      <div className="kb-overlay-content">
        <div className="kb-overlay-heading"><h3>{label}</h3>{enabled && onToggle ? <button type="button" className="kb-overlay-toggle" onClick={onToggle} aria-pressed={active} aria-label={`${active ? 'Disable' : 'Enable'} ${label}`}>{active ? '✓' : '○'}</button> : <span className="kb-overlay-check" aria-label={enabled ? 'Enabled' : 'Not configured'}>{enabled ? '✓' : '—'}</span>}</div>
        <div className="kb-overlay-label"><strong>{node?.label ?? fallback}</strong><em>{enabled ? badge : 'Not configured'}</em></div>
        <p>{node ? <><FileText size={14} /> {node.source_count.toLocaleString()} source documents</> : <><LockKeyhole size={14} /> Add approved sources to enable</>}</p>
      </div>
    </article>
  );
}
