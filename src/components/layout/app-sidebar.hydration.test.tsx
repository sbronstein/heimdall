// @vitest-environment jsdom
import React, { act } from 'react';
import { renderToString } from 'react-dom/server';
import { hydrateRoot } from 'react-dom/client';
import { describe, it, afterEach, vi, expect } from 'vitest';

vi.mock('@clerk/nextjs', () => ({
  useUser: () => ({
    user: {
      fullName: 'Steve Bronstein',
      imageUrl: 'https://img.clerk.com/test',
      emailAddresses: [{ emailAddress: 'steve@bronstein.org' }]
    }
  }),
  SignOutButton: ({ children }: { children?: React.ReactNode }) => <>{children}</>
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/overview',
  useRouter: () => ({ push: vi.fn() })
}));

vi.mock('@/hooks/use-media-query', () => ({
  useMediaQuery: () => ({ isOpen: true })
}));

vi.mock('@/hooks/use-nav', () => ({
  useFilteredNavItems: (items: unknown) => items
}));

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children?: React.ReactNode }) =>
    React.createElement('a', { href }, children)
}));

// Mock the sidebar UI components — same strategy as ssr.test.tsx.
// SidebarMenuButton uses asChild to avoid rendering real <button> around children with <div>s.
vi.mock('@/components/ui/sidebar', () => {
  const passThrough = ({ children, asChild: _asChild, isActive: _isActive, tooltip: _tooltip, ...rest }: { children?: React.ReactNode; asChild?: boolean; isActive?: boolean; tooltip?: unknown; [key: string]: unknown }) => (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  );
  const SidebarMenuButton = ({ children, asChild, size: _size, isActive: _isActive, tooltip: _tooltip, ...rest }: { children?: React.ReactNode; asChild?: boolean; size?: string; isActive?: boolean; tooltip?: unknown; [key: string]: unknown }) => (
    asChild
      ? <span {...(rest as React.HTMLAttributes<HTMLSpanElement>)}>{children}</span>
      : <button {...(rest as React.ButtonHTMLAttributes<HTMLButtonElement>)}>{children}</button>
  );
  return {
    Sidebar: passThrough,
    SidebarContent: passThrough,
    SidebarFooter: passThrough,
    SidebarGroup: passThrough,
    SidebarGroupLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    SidebarHeader: passThrough,
    SidebarMenu: passThrough,
    SidebarMenuButton,
    SidebarMenuItem: passThrough,
    SidebarMenuSub: passThrough,
    // When asChild=true, SidebarMenuSubButton renders as the child element (e.g. <a>).
    // Passthrough to avoid nested <a> inside <a> when Link is the child.
    SidebarMenuSubButton: ({ children, asChild: _asChild, isActive: _isActive }: { children?: React.ReactNode; asChild?: boolean; isActive?: boolean }) => (
      <span>{children}</span>
    ),
    SidebarMenuSubItem: passThrough,
    SidebarRail: () => <div />
  };
});

// Mock Collapsible primitives
vi.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CollapsibleContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  CollapsibleTrigger: ({ children, asChild: _asChild }: { children?: React.ReactNode; asChild?: boolean }) => <div>{children}</div>
}));

// Mock DropdownMenu primitives
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuContent: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuGroup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children?: React.ReactNode; onClick?: () => void }) => <div onClick={onClick}>{children}</div>,
  DropdownMenuLabel: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children, asChild: _asChild }: { children?: React.ReactNode; asChild?: boolean }) => <div>{children}</div>
}));

// Mock icons
vi.mock('@tabler/icons-react', () => ({
  IconBell: () => <span />,
  IconChevronRight: () => <span />,
  IconChevronsDown: () => <span />,
  IconLogout: () => <span />,
  IconUserCircle: () => <span />
}));

vi.mock('@/components/icons', () => ({
  Icons: new Proxy({}, { get: () => () => <span /> })
}));

import AppSidebar from '@/components/layout/app-sidebar';

describe('AppSidebar hydration mount (BUG-01 regression)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('hydrates without rewriting the DOM (SSR matches client render)', async () => {
    const ssrHtml = renderToString(React.createElement(AppSidebar));
    const container = document.createElement('div');
    container.innerHTML = ssrHtml;
    document.body.appendChild(container);

    // Snapshot SSR DOM shape before hydration. We normalize whitespace because React's
    // hydration touches text-node boundaries even on a clean hydration.
    const ssrShape = normalizeShape(container);

    // React 19 + jsdom does NOT reliably surface hydration mismatches via console.error or
    // onRecoverableError (verified empirically — even text divergences don't fire either
    // callback in this environment). The deterministic signal is structural: if hydration
    // detects a mismatch, React rewrites the affected subtree to match the client render.
    // We capture both callbacks defensively in case React's behavior changes, but the
    // load-bearing assertion is the post-hydration DOM shape comparison.
    const recoverableErrors: unknown[] = [];
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    let didThrow = false;
    try {
      await act(async () => {
        hydrateRoot(container, React.createElement(AppSidebar), {
          onRecoverableError: (error) => {
            recoverableErrors.push(error);
          }
        });
        // Give React a microtask + macrotask to commit and run effects.
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      });
    } catch {
      didThrow = true;
    }

    // 1. Hydration must not throw a hard exception (would indicate a runtime crash).
    expect(didThrow, 'hydrateRoot threw — the component crashed during hydration').toBe(false);

    // 2. STRUCTURAL: SSR DOM shape must equal post-hydration DOM shape. A mismatch causes
    //    React to silently rewrite the subtree; this assertion catches that.
    const postShape = normalizeShape(container);
    expect(
      postShape,
      'Post-hydration DOM differs from SSR — React rewrote the subtree, indicating a hydration mismatch'
    ).toBe(ssrShape);

    // 3. DEFENSIVE backstop: no hydration-tagged onRecoverableError calls. Currently
    //    inert in jsdom/React 19 (per empirical check) but kept so it activates if the
    //    React/jsdom contract evolves.
    const hydrationErrors = recoverableErrors.filter((err) => {
      const msg = err instanceof Error ? err.message : String(err);
      return /hydrat/i.test(msg) || /did not match/i.test(msg) || /server.*client/i.test(msg);
    });
    expect(hydrationErrors).toEqual([]);

    // 4. DEFENSIVE backstop: no hydration-tagged console.error calls.
    const hydrationCalls = errorSpy.mock.calls.filter(([firstArg]) =>
      typeof firstArg === 'string' &&
      (/hydrat/i.test(firstArg) || /did not match/i.test(firstArg))
    );
    expect(hydrationCalls).toEqual([]);

    errorSpy.mockRestore();
  });
});

/**
 * Produce a stable structural fingerprint of `root`'s descendants — element tagnames,
 * attribute names+values, and text-content trimmed. Used to compare SSR vs post-hydration
 * DOM to detect React's silent mismatch recovery.
 */
function normalizeShape(root: Element): string {
  function walk(node: Node): string {
    if (node.nodeType === 3 /* TEXT_NODE */) {
      const text = (node.textContent ?? '').replace(/\s+/g, ' ').trim();
      return text ? `t:${text}` : '';
    }
    if (node.nodeType !== 1 /* ELEMENT_NODE */) return '';
    const el = node as Element;
    const attrs = Array.from(el.attributes)
      .map((a) => `${a.name}=${a.value}`)
      .sort()
      .join(',');
    const children = Array.from(el.childNodes).map(walk).filter(Boolean).join('|');
    return `<${el.tagName.toLowerCase()} ${attrs}>${children}</${el.tagName.toLowerCase()}>`;
  }
  return walk(root);
}
