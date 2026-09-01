'use client';

import { ChevronRight, FileText, LoaderCircle, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { KbCatalogNode, KbDocument, KbDocumentPage } from './types';

function sourceName(key: string) {
  return key.split('/').pop() ?? key;
}

export function SourceDrawer({ corpus, fetchPage, onClose }: {
  corpus: KbCatalogNode;
  fetchPage: (cursor?: string) => Promise<KbDocumentPage>;
  onClose: () => void;
}) {
  const [documents, setDocuments] = useState<KbDocument[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async (nextCursor?: string) => {
    setLoading(true); setError(null);
    try {
      const page = await fetchPage(nextCursor);
      setDocuments((current) => nextCursor ? [...current, ...page.documents] : page.documents);
      setCursor(page.next_cursor);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load sources.');
    } finally { setLoading(false); }
  };

  useEffect(() => {
    let active = true;
    const bootstrap = async () => {
      try {
        const page = await fetchPage();
        if (!active) return;
        setDocuments(page.documents);
        setCursor(page.next_cursor);
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Unable to load sources.');
      } finally {
        if (active) setLoading(false);
      }
    };
    void bootstrap();
    return () => { active = false; };
  }, [corpus.id, fetchPage]);

  return <div className="kb-source-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="kb-source-drawer" role="dialog" aria-modal="true" aria-labelledby="kb-source-title">
      <header><div><p>SOURCE DOCUMENTS</p><h2 id="kb-source-title">{corpus.label}</h2><small>{corpus.source_count.toLocaleString()} documents · metadata sidecars attached</small></div><button onClick={onClose} aria-label="Close source list"><X size={19} /></button></header>
      {error && <p className="kb-source-error">{error}</p>}
      <ul>{documents.map((document) => <li key={document.key}><FileText size={17} /><div><strong>{sourceName(document.key)}</strong><span>{document.status.replaceAll('_', ' ').toLowerCase()} · {document.size?.toLocaleString() ?? 'unknown'} bytes</span>{document.sidecar_key && <small>Metadata attached</small>}</div><ChevronRight size={15} /></li>)}</ul>
      {loading && <div className="kb-source-loading"><LoaderCircle className="spinner" size={18} /> Loading sources…</div>}
      {!loading && !documents.length && !error && <div className="kb-source-loading">No source documents in this corpus.</div>}
      {cursor && !loading && <button className="kb-source-more" onClick={() => void load(cursor)}>Load more sources</button>}
    </aside>
  </div>;
}
