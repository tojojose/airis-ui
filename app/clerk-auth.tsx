'use client';

import { useEffect, useRef, useState } from 'react';
import { API_URL } from './api-config';

export type VisinexaAuthState = {
  ready: boolean;
  signedIn: boolean;
  /** Clerk user id of the signed-in person. Used by the Administrators screen
   *  to disable "revoke yourself"; the API enforces that guard regardless. */
  userId: string | null;
  isAdmin: boolean;
  /** Client Manager in the active organization. Probed from the API rather
   *  than read out of the token: the API is what enforces it, and a claim the
   *  UI trusts but the server disagrees with is a screen full of 403s. */
  isManager: boolean;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string;
};

type ClerkOrganization = { id: string; slug?: string | null; name?: string | null };
type ClerkUser = { id?: string | null };
type ClerkResources = { user?: ClerkUser | null; organization?: ClerkOrganization | null };
type ClerkBrowser = {
  load: () => Promise<void>;
  user?: ClerkUser | null;
  organization?: ClerkOrganization | null;
  session?: { getToken: (options?: { skipCache?: boolean }) => Promise<string | null> };
  openSignIn: () => void;
  addListener?: (listener: (resources: ClerkResources) => void) => () => void;
  mountUserButton: (element: HTMLDivElement) => void;
  unmountUserButton?: (element: HTMLDivElement) => void;
  mountOrganizationSwitcher: (element: HTMLDivElement, options?: Record<string, unknown>) => void;
  unmountOrganizationSwitcher?: (element: HTMLDivElement) => void;
};

declare global { interface Window { Clerk?: ClerkBrowser; } }

const clerkScript = 'https://inspired-caribou-5743.clerk.accounts.dev/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
const ADMIN_ORG_ID = 'org_3IPVJfrTM15wLLm9HHMT5ovDxDi';

export function isVisinexaAdmin(organization?: ClerkOrganization | null) {
  return Boolean(organization && (organization.id === ADMIN_ORG_ID || organization.slug === 'trominos-admin'));
}

function toAuthState(ready: boolean, resources?: ClerkResources): VisinexaAuthState {
  const organization = resources?.organization ?? window.Clerk?.organization ?? null;
  const user = resources?.user ?? window.Clerk?.user ?? null;
  const signedIn = Boolean(user);
  return {
    ready,
    signedIn,
    userId: user?.id ?? null,
    isAdmin: isVisinexaAdmin(organization),
    isManager: false,
    organizationId: organization?.id ?? null,
    organizationSlug: organization?.slug ?? null,
    organizationName: organization?.name ?? (signedIn ? 'Personal workspace' : 'Operations workspace'),
  };
}

export async function getClerkToken(forceRefresh = false) {
  return window.Clerk?.session?.getToken(forceRefresh ? { skipCache: true } : undefined) ?? null;
}

export function ClerkAuth({ onChange }: { onChange?: (state: VisinexaAuthState) => void }) {
  const [state, setState] = useState<VisinexaAuthState>(() => ({ ready: false, signedIn: false, userId: null, isAdmin: false, isManager: false, organizationId: null, organizationSlug: null, organizationName: 'Operations workspace' }));
  const userButton = useRef<HTMLDivElement>(null);
  const orgSwitcher = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const update = async (resources?: ClerkResources) => {
      if (!active) return;
      let next = toAuthState(true, resources);
      if (next.signedIn) {
        // ONE call, and it answers 200 for every signed-in client user. The
        // previous pair of probes asked their questions by provoking 403s -
        // which put two red errors in the console on every page load and made
        // a real failure indistinguishable from the app working correctly.
        try {
          const token = await window.Clerk?.session?.getToken();
          const response = await fetch(`${API_URL}/v1/projects/me`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (response.ok) {
            const me = await response.json() as { is_admin?: boolean; role?: string };
            next = { ...next, isAdmin: next.isAdmin || Boolean(me.is_admin),
                     isManager: me.role === 'org:client_manager' };
          }
        } catch { /* navigation falls back to the Clerk organization alone */ }
      }
      if (!active) return;
      setState(next);
      onChange?.(next);
    };
    const start = async () => {
      if (!window.Clerk) return;
      await window.Clerk.load();
      update({ user: window.Clerk.user, organization: window.Clerk.organization });
      unsubscribe = window.Clerk.addListener?.((resources) => { void update(resources); });
    };
    const existing = document.querySelector<HTMLScriptElement>('[data-airis-clerk]');
    if (existing) {
      if (window.Clerk) void start();
      else existing.addEventListener('load', start, { once: true });
    } else {
      const script = document.createElement('script');
      script.src = clerkScript;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.dataset.airisClerk = 'true';
      script.dataset.clerkPublishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? 'pk_test_aW5zcGlyZWQtY2FyaWJvdS01NzQzLmNsZXJrLmFjY291bnRzLmRldiQ';
      script.addEventListener('load', start, { once: true });
      document.head.appendChild(script);
    }
    return () => { active = false; unsubscribe?.(); };
  }, [onChange]);

  useEffect(() => {
    const accountTarget = userButton.current;
    const orgTarget = orgSwitcher.current;
    if (!state.ready || !state.signedIn || !accountTarget || !orgTarget || !window.Clerk) return;
    window.Clerk.mountOrganizationSwitcher(orgTarget, {
      hidePersonal: true,
      afterSelectOrganizationUrl: window.location.href,
      appearance: { elements: { organizationSwitcherTrigger: 'airis-org-trigger' } },
    });
    window.Clerk.mountUserButton(accountTarget);
    return () => {
      window.Clerk?.unmountOrganizationSwitcher?.(orgTarget);
      window.Clerk?.unmountUserButton?.(accountTarget);
    };
  }, [state.ready, state.signedIn]);

  if (!state.signedIn) return <button className="sign-in" disabled={!state.ready} onClick={() => window.Clerk?.openSignIn()}>{state.ready ? 'Sign in' : 'Connecting…'}</button>;
  return <div className="clerk-controls"><div className="clerk-org" ref={orgSwitcher} aria-label="Switch organization" /><div className="clerk-user" ref={userButton} aria-label="Account" /></div>;
}
