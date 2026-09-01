'use client';

import { Building2, ChevronDown, ChevronRight, Factory, FileText, Globe2, Landmark, MapPin, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { KbCatalogNode } from './types';

const iconFor = (kind: string) => {
  if (kind === 'country') return <Globe2 size={16} />;
  if (kind === 'authority_level') return <Landmark size={16} />;
  if (kind === 'authority') return <ShieldCheck size={16} />;
  if (kind === 'industry') return <Factory size={16} />;
  if (kind === 'jurisdiction') return <MapPin size={16} />;
  if (kind === 'document_family' || kind === 'edition') return <FileText size={16} />;
  return <Building2 size={16} />;
};

function collectExpanded(nodes: KbCatalogNode[], out = new Set<string>()) {
  for (const node of nodes) {
    if (node.children.length) out.add(node.id);
    collectExpanded(node.children, out);
  }
  return out;
}

function TreeNode({ node, depth, selectedId, expanded, onToggle, onSelect }: {
  node: KbCatalogNode;
  depth: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (node: KbCatalogNode) => void;
}) {
  const hasChildren = node.children.length > 0;
  const isOpen = expanded.has(node.id);
  const selected = selectedId === node.id;
  return (
    <li className="kb-tree-item">
      <div className={`kb-tree-row ${selected ? 'selected' : ''}`} style={{ '--tree-depth': depth } as React.CSSProperties}>
        <button className="kb-tree-toggle" disabled={!hasChildren} onClick={() => onToggle(node.id)} aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${node.label}`} aria-expanded={hasChildren ? isOpen : undefined}>
          {hasChildren ? (isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />) : <span />}
        </button>
        <button className="kb-tree-select" onClick={() => onSelect(node)} aria-current={selected ? 'true' : undefined}>
          {iconFor(node.kind)}
          <span>{node.label}</span>
          <em>{node.source_count.toLocaleString()}</em>
        </button>
      </div>
      {hasChildren && isOpen && <ul>{node.children.map((child) => <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}</ul>}
    </li>
  );
}

export function RegulatoryTree({ nodes, selectedId, onSelect }: { nodes: KbCatalogNode[]; selectedId: string | null; onSelect: (node: KbCatalogNode) => void }) {
  const initial = useMemo(() => collectExpanded(nodes), [nodes]);
  const [expanded, setExpanded] = useState<Set<string>>(initial);
  const onToggle = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  if (!nodes.length) return <div className="kb-empty-tree"><Globe2 size={22} /><p>No approved regulatory corpus is configured.</p></div>;
  return <ul className="kb-tree" aria-label="Regulatory authority hierarchy">{nodes.map((node) => <TreeNode key={node.id} node={node} depth={0} selectedId={selectedId} expanded={expanded} onToggle={onToggle} onSelect={onSelect} />)}</ul>;
}
