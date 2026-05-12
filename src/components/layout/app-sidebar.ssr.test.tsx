import React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { describe, it, beforeAll, vi, expect } from 'vitest';

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

// Mock the sidebar UI components so AppSidebar renders without SidebarProvider context.
// The structural assertions (no <div> in <button>, UserAvatarProfile markup) are still
// exercised because the mocks pass children through.
vi.mock('@/components/ui/sidebar', () => {
  const passThrough = ({ children, asChild: _asChild, ...rest }: { children?: React.ReactNode; asChild?: boolean; [key: string]: unknown }) => (
    <div {...(rest as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
  );
  // When asChild=true, SidebarMenuButton renders as the child element (e.g. <a>), not <button>.
  // We use a <span> passthrough for asChild to avoid false positives in the no-div-in-button assertion.
  const SidebarMenuButton = ({ children, asChild, size: _size, ...rest }: { children?: React.ReactNode; asChild?: boolean; size?: string; [key: string]: unknown }) => (
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
    SidebarMenuSubButton: ({ children, asChild: _asChild, ...rest }: { children?: React.ReactNode; asChild?: boolean; [key: string]: unknown }) => (
      <a {...(rest as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>{children}</a>
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

describe('AppSidebar SSR structural (BUG-01 regression)', () => {
  let html: string;
  let dom: JSDOM;

  beforeAll(() => {
    html = renderToString(React.createElement(AppSidebar));
    dom = new JSDOM(html, { url: 'http://localhost/' });
  });

  it('SSR renders without throwing', () => {
    expect(() => renderToString(React.createElement(AppSidebar))).not.toThrow();
  });

  it('contains no <div> inside any <button>', () => {
    const { document } = dom.window;
    const buttons = document.querySelectorAll('button');

    buttons.forEach((btn) => {
      const nestedDiv = btn.querySelector('div');
      expect(
        nestedDiv,
        `Found a <div> inside a <button>. Button outerHTML (truncated):\n${btn.outerHTML.slice(0, 500)}`
      ).toBeNull();
    });
  });

  it('renders UserAvatarProfile markup (no {user && ...} gating)', () => {
    expect(html).toContain('flex items-center gap-2');
  });

  it('renders the mocked user fullName and email', () => {
    expect(html).toContain('Steve Bronstein');
    expect(html).toContain('steve@bronstein.org');
  });
});
