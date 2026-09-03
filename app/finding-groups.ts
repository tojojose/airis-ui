export type FindingOutcome = 'actionable' | 'review' | 'dismissed';

export type GroupableFinding = {
  id?: string;
  category?: string;
  description?: string;
  severity?: string;
  claim_code?: string;
  verification_status?: string;
  verification_reason?: string;
  display_status?: string;
  applicability_status?: string;
  applicability_reason?: string;
  escalation?: { verdict?: string; reason?: string } | null;
  citations?: Array<{ section?: string; source_doc?: string }>;
};

export type FindingGroup<T extends GroupableFinding> = {
  key: string;
  title: string;
  category: string;
  severity: string;
  outcome: FindingOutcome;
  actionable: number;
  review: number;
  dismissed: number;
  items: T[];
};

const CLAIM_TITLES: Record<string, string> = {
  'ppe.head_protection.missing': 'Head protection',
  'ppe.head_protection.issue': 'Head protection',
  'ppe.high_visibility.missing': 'High-visibility apparel',
  'ppe.high_visibility.issue': 'High-visibility apparel',
  'ppe.hand_protection.missing': 'Hand protection',
  'ppe.eye_protection.missing': 'Eye protection',
  'ppe.hearing_protection.missing': 'Hearing protection',
  'access_egress.pedestrian_vehicle_separation.missing': 'Pedestrian and vehicle separation',
  'traffic.channelizer.improper_placement': 'Traffic-channelizer placement',
  'traffic.warning_device.missing': 'Advance warning devices',
  'fall_protection.edge_protection.missing': 'Edge and fall protection',
};

const SEVERITY_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 };

function normalizedDescription(value = '') {
  return value.toLowerCase()
    .replace(/\b(one|a|an)\s+(worker|person|employee)\b/g, 'person')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .trim();
}

function humanize(value = '') {
  return value.replaceAll('_', ' ').replaceAll('.', ' · ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function findingOutcome(finding: GroupableFinding): FindingOutcome {
  if (finding.applicability_status === 'not_applicable'
      || finding.display_status === 'hidden_refuted'
      || finding.verification_status === 'refuted'
      || finding.escalation?.verdict === 'refuted') return 'dismissed';
  if (finding.display_status === 'actionable'
      || finding.verification_status === 'confirmed'
      || finding.escalation?.verdict === 'confirmed') return 'actionable';
  return 'review';
}

function titleFor(finding: GroupableFinding) {
  const code = finding.claim_code || '';
  if (CLAIM_TITLES[code]) return CLAIM_TITLES[code];
  if (code) return humanize(code.replace(/\.(missing|issue)$/, ''));
  return finding.category ? humanize(finding.category) : 'Safety observation';
}

export function groupFindings<T extends GroupableFinding>(findings: T[]): FindingGroup<T>[] {
  const groups = new Map<string, FindingGroup<T>>();
  for (const finding of findings) {
    const citationKey = (finding.citations || [])
      .map((citation) => `${citation.section || ''}:${citation.source_doc || ''}`)
      .sort().join('|');
    const identity = finding.claim_code || `${finding.category || 'OTHER'}:${normalizedDescription(finding.description)}`;
    const key = `${identity}|${citationKey}`;
    const outcome = findingOutcome(finding);
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(finding);
      existing[outcome] += 1;
      if ((SEVERITY_RANK[finding.severity || ''] || 0) > (SEVERITY_RANK[existing.severity] || 0)) {
        existing.severity = finding.severity || existing.severity;
      }
      if (outcome === 'actionable') existing.outcome = 'actionable';
      else if (outcome === 'review' && existing.outcome === 'dismissed') existing.outcome = 'review';
      continue;
    }
    groups.set(key, {
      key,
      title: titleFor(finding),
      category: finding.category || 'OTHER',
      severity: finding.severity || 'medium',
      outcome,
      actionable: outcome === 'actionable' ? 1 : 0,
      review: outcome === 'review' ? 1 : 0,
      dismissed: outcome === 'dismissed' ? 1 : 0,
      items: [finding],
    });
  }
  const outcomeRank: Record<FindingOutcome, number> = { actionable: 3, review: 2, dismissed: 1 };
  return [...groups.values()].sort((left, right) =>
    outcomeRank[right.outcome] - outcomeRank[left.outcome]
    || (SEVERITY_RANK[right.severity] || 0) - (SEVERITY_RANK[left.severity] || 0)
    || left.title.localeCompare(right.title));
}

export function groupSummary(group: FindingGroup<GroupableFinding>) {
  const parts = [];
  if (group.actionable) parts.push(`${group.actionable} confirmed`);
  if (group.review) parts.push(`${group.review} need review`);
  if (group.dismissed) parts.push(`${group.dismissed} dismissed`);
  return parts.join(' · ');
}
