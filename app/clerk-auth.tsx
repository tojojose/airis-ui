'use client';

import { useEffect, useRef, useState } from 'react';

export type AirisAuthState = {
  ready: boolean;
  signedIn: boolean;
  isAdmin: boolean;
  organizationId: string | null;
  organizationSlug: string | null;
  organizationName: string;
};

type ClerkOrganization = { id: string; slug?: string | null; name?: string | null };
type ClerkResources = { user?: unknown; organization?: ClerkOrganization | null };
type ClerkBrowser = {
  load: () => Promise<void>;
  user?: unknown;
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

export function isAirisAdmin(organization?: ClerkOrganization | null) {
  return Boolean(organization && (organization.id === ADMIN_ORG_ID || organization.slug === 'trominos-admin'));
}

function toAuthState(ready: boolean, resources?: ClerkResources): AirisAuthState {
  const organization = resources?.organization ?? window.Clerk?.organization ?? null;
  const signedIn = Boolean(resources?.user ?? window.Clerk?.user);
  return {
    ready,
    signedIn,
    isAdmin: isAirisAdmin(organization),
    organizationId: organization?.id ?? null,
    organizationSlug: organization?.slug ?? null,
    organizationName: organization?.name ?? (signedIn ? 'Personal workspace' : 'Operations workspace'),
  };
}

export async function getClerkToken(forceRefresh = false) {
  return window.Clerk?.session?.getToken(forceRefresh ? { skipCache: true } : undefined) ?? null;
}

export function ClerkAuth({ onChange }: { onChange?: (state: AirisAuthState) => void }) {
  const [state, setState] = useState<AirisAuthState>(() => ({ ready: false, signedIn: false, isAdmin: false, organizationId: null, organizationSlug: null, organizationName: 'Operations workspace' }));
  const userButton = useRef<HTMLDivElement>(null);
  const orgSwitcher = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe: (() => void) | undefined;
    const update = (resources?: ClerkResources) => {
      if (!active) return;
      const next = toAuthState(true, resources);
      setState(next);
      onChange?.(next);
    };
    const start = async () => {
      if (!window.Clerk) return;
      await window.Clerk.load();
      update({ user: window.Clerk.user, organization: window.Clerk.organization });
      unsubscribe = window.Clerk.addListener?.(update);
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
