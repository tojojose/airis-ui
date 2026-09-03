'use client';

import { FileImage } from 'lucide-react';
import { useState } from 'react';

export type HistoricalFinding = {
  id?: string;
  description?: string;
  severity?: string;
  bbox?: [number, number, number, number] | null;
};

function validBox(box?: [number, number, number, number] | null) {
  if (!box || box.length !== 4 || !box.every(Number.isFinite)) return false;
  const [x1, y1, x2, y2] = box;
  return x1 >= 0 && y1 >= 0 && x2 <= 1 && y2 <= 1 && x2 > x1 && y2 > y1;
}

export function HistoryEvidenceImage({ imageUrl, findings, imageExpected = false }: {
  imageUrl: string;
  findings: HistoricalFinding[];
  imageExpected?: boolean;
}) {
  const [active, setActive] = useState('');
  const located = findings.filter((finding) => validBox(finding.bbox));

  if (!imageUrl) return imageExpected
    ? <div className="history-evidence-unavailable"><FileImage size={19} /><span>The saved evidence image is temporarily unavailable. Findings remain available below.</span></div>
    : <div className="history-evidence-unavailable legacy"><FileImage size={19} /><span>This run predates saved evidence images, so its markings cannot be reconstructed safely.</span></div>;

  return <section className="history-evidence" aria-label="Marked inspection evidence">
    <header><strong>Inspection evidence</strong><span>{located.length} located finding{located.length === 1 ? '' : 's'}</span></header>
    <div className="history-evidence-image">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imageUrl} alt="Orientation-corrected image retained with this inspection" />
      {located.map((finding) => {
        const [x1, y1, x2, y2] = finding.bbox!;
        const index = findings.indexOf(finding) + 1;
        const findingId = finding.id || `finding-${index}`;
        return <button
          type="button"
          key={findingId}
          className={`finding-box severity-${finding.severity || 'medium'} ${active === findingId ? 'active' : ''}`}
          style={{ left: `${x1 * 100}%`, top: `${y1 * 100}%`, width: `${(x2 - x1) * 100}%`, height: `${(y2 - y1) * 100}%` }}
          onMouseEnter={() => setActive(findingId)}
          onMouseLeave={() => setActive('')}
          onFocus={() => setActive(findingId)}
          onBlur={() => setActive('')}
          aria-label={`Finding ${index}: ${finding.description || 'Located finding'}`}
        ><span>{index}</span></button>;
      })}
    </div>
    {!located.length && <p>No findings in this run have a safe image location. Scene-level findings are listed below.</p>}
  </section>;
}
