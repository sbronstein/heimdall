// @vitest-environment jsdom
import React from 'react';
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

  it('hydrates without React hydration warnings', async () => {
    const html = renderToString(React.createElement(AppSidebar));
    const container = document.createElement('div');
    container.innerHTML = html;
    document.body.appendChild(container);

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    hydrateRoot(container, React.createElement(AppSidebar));

    // Flush so React commits and any hydration mismatch errors surface.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    const hydrationCalls = errorSpy.mock.calls.filter(([firstArg]) =>
      typeof firstArg === 'string' &&
      (/hydrat/i.test(firstArg) || /did not match/i.test(firstArg))
    );

    expect(
      hydrationCalls,
      `Unexpected hydration warnings:\n${hydrationCalls.map((c) => c.join(' ')).join('\n')}`
    ).toEqual([]);

    errorSpy.mockRestore();
  });
});
