'use client';

import { Bell, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { API_URL } from './api-config';
import { getClerkToken, type VisinexaAuthState } from './clerk-auth';

type BudgetNotice = {
  org_id: string; project_id: string; scope: string; threshold: number;
  percent: number; month: string; created_at: string; read: boolean;
};

export function NotificationCenter({ auth }: { auth: VisinexaAuthState }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BudgetNotice[]>([]);

  useEffect(() => {
    if (!auth.signedIn) { setItems([]); return; }
    let active = true;
    void (async () => {
      try {
        const token = await getClerkToken();
        if (!token) return;
        const endpoint = auth.isAdmin ? '/v1/admin/notifications' : '/v1/projects/notifications';
        const response = await fetch(`${API_URL}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) return;
        const payload = await response.json() as { notifications?: BudgetNotice[] };
        if (active) setItems(payload.notifications || []);
      } catch { /* Alerts are advisory; the rest of the workspace remains usable. */ }
    })();
    return () => { active = false; };
  }, [auth.isAdmin, auth.organizationId, auth.signedIn]);

  const unread = items.filter((item) => !item.read).length;
  return <div className="notification-center">
    <button className="icon-button" aria-label={`Notifications${unread ? ` (${unread} new)` : ''}`} onClick={() => setOpen(!open)}><Bell size={18} />{unread > 0 && <span className="notification-badge">{unread > 9 ? '9+' : unread}</span>}</button>
    {open && <section className="notification-panel"><header><div><strong>Budget alerts</strong><small>Project administrators are notified at 80%. AI processing pauses at 90%.</small></div><button onClick={() => setOpen(false)} aria-label="Close notifications"><X size={16} /></button></header>{items.length ? <div className="notification-list">{items.map((item) => <article key={`${item.org_id}-${item.project_id}-${item.scope}-${item.threshold}-${item.month}`}><TriangleAlert size={17} /><div><strong>{item.scope === 'client' ? 'Client' : 'Project'} reached {item.threshold}%</strong><span>{item.percent.toFixed(1)}% used for {item.month}</span><small>{item.project_id}</small></div></article>)}</div> : <p className="notification-empty">No budget alerts.</p>}</section>}
  </div>;
}
