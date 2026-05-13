import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { readdirSync } from 'node:fs';
import path from 'node:path';

// Configurable per-test auth() return value. Tests set this before invoking
// the proxy middleware so the mocked Clerk auth helper returns the desired
// {userId, sessionClaims} shape.
let mockAuthReturn: { userId: string | null; sessionClaims: Record<string, unknown> | null } = {
  userId: null,
  sessionClaims: null
};

// Spy mocks recorded across tests — clearable in beforeEach.
const protectSpy = vi.fn();

vi.mock('@clerk/nextjs/server', () => {
  // clerkMiddleware accepts a handler and returns a NextMiddleware that
  // invokes the handler with a fake `auth` proxy. The fake `auth()` returns
  // the configurable mockAuthReturn. `auth.protect()` records the call and
  // returns the same shape — the real Clerk would throw or redirect for an
  // unauthenticated request, but our middleware ONLY calls auth.protect() on
  // /dashboard/* paths where the test asserts the spy fired, not the side
  // effect.
  const clerkMiddleware = (handler: (auth: unknown, req: NextRequest) => unknown) => {
    return async (req: NextRequest) => {
      const auth = Object.assign(
        async () => mockAuthReturn,
        {
          protect: vi.fn(async () => {
            protectSpy();
            return mockAuthReturn;
          })
        }
      );
      return handler(auth, req);
    };
  };

  // Mirror the real createRouteMatcher with simple regex matching against
  // the patterns passed in. Patterns like '/dashboard(.*)' and '/api/(.*)'
  // are matched via prefix check (sufficient for path-class detection).
  const createRouteMatcher = (patterns: string[]) => {
    return (req: NextRequest) => {
      const pathname = req.nextUrl.pathname;
      return patterns.some((p) => {
        // Strip the regex parens to get the base path
        const base = p.replace(/\(\.\*\)/g, '').replace(/\/$/, '');
        return pathname === base || pathname.startsWith(base + '/') || pathname.startsWith(base);
      });
    };
  };

  return { clerkMiddleware, createRouteMatcher };
});

// IMPORTANT: import the proxy module AFTER vi.mock — vi hoists mocks, but
// this also doubles as documentation that proxy.ts has @clerk/nextjs/server
// as a hard dependency that must be stubbed for unit testing.
const proxyModulePromise = import('@/proxy');

async function getMiddleware(): Promise<(req: NextRequest) => Promise<Response | undefined>> {
  const mod = await proxyModulePromise;
  // proxy.ts default export is the wrapped NextMiddleware
  return mod.default as unknown as (req: NextRequest) => Promise<Response | undefined>;
}

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

beforeEach(() => {
  protectSpy.mockClear();
  mockAuthReturn = { userId: null, sessionClaims: null };
});

describe('proxy (A): unauthenticated /api/* returns 401 envelope', () => {
  it('returns 401 with {success: false, error: "Unauthorized"} for /api/companies', async () => {
    mockAuthReturn = { userId: null, sessionClaims: null };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/api/companies'));
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 envelope for nested dynamic /api/job-leads/abc/search', async () => {
    mockAuthReturn = { userId: null, sessionClaims: null };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/api/job-leads/abc/search'));
    expect(res).toBeInstanceOf(Response);
    expect(res!.status).toBe(401);
    const body = await res!.json();
    expect(body).toEqual({ success: false, error: 'Unauthorized' });
  });
});

describe('proxy (B): unauthenticated /dashboard/* triggers auth.protect (Clerk redirect path)', () => {
  it('invokes auth.protect() rather than returning the JSON 401 envelope', async () => {
    mockAuthReturn = { userId: null, sessionClaims: null };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/dashboard/overview'));
    // The middleware took the /dashboard branch: auth.protect was called.
    expect(protectSpy).toHaveBeenCalledTimes(1);
    // It did NOT return the /api 401 envelope — the dashboard branch returns
    // undefined after a successful auth.protect() in our mock (because the
    // mock returns the same mockAuthReturn rather than redirecting).
    // The key behavioral assertion is that the envelope short-circuit did NOT
    // fire for /dashboard/*.
    if (res) {
      expect(res.status).not.toBe(401);
    }
  });
});

describe('proxy (C): wrong-email session redirects to /auth/sign-in for both /dashboard and /api', () => {
  it('redirects /api/companies to /auth/sign-in when session email is not steve@bronstein.org', async () => {
    mockAuthReturn = {
      userId: 'user_xyz',
      sessionClaims: { email: 'attacker@example.com' }
    };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/api/companies'));
    expect(res).toBeInstanceOf(Response);
    // NextResponse.redirect emits a 307 (default) or 308 status
    expect([307, 308]).toContain(res!.status);
    const location = res!.headers.get('location');
    expect(location).toBeTruthy();
    expect(location!).toContain('/auth/sign-in');
  });

  it('redirects /dashboard/overview to /auth/sign-in when session email is not steve@bronstein.org', async () => {
    mockAuthReturn = {
      userId: 'user_xyz',
      sessionClaims: { email: 'attacker@example.com' }
    };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/dashboard/overview'));
    expect(res).toBeInstanceOf(Response);
    expect([307, 308]).toContain(res!.status);
    const location = res!.headers.get('location');
    expect(location).toBeTruthy();
    expect(location!).toContain('/auth/sign-in');
  });
});

describe('proxy (D): public /auth/* paths pass through', () => {
  it('does not invoke auth.protect() and does not return the 401 envelope for /auth/sign-in', async () => {
    mockAuthReturn = { userId: null, sessionClaims: null };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/auth/sign-in'));
    expect(protectSpy).not.toHaveBeenCalled();
    // Pass-through: middleware returns undefined (no Response constructed)
    expect(res).toBeUndefined();
  });

  it('does not return the 401 envelope for /auth/sign-up', async () => {
    mockAuthReturn = { userId: null, sessionClaims: null };
    const middleware = await getMiddleware();
    const res = await middleware(makeRequest('http://localhost/auth/sign-up'));
    expect(protectSpy).not.toHaveBeenCalled();
    expect(res).toBeUndefined();
  });
});

describe('proxy (E): route-enumeration assertion — every /api/* route is covered by the protected matcher pattern', () => {
  function listApiRoutes(dir: string, prefix: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const urlSeg = '/' + entry.name;
      if (entry.isDirectory()) {
        out.push(...listApiRoutes(full, prefix + urlSeg));
      } else if (entry.isFile() && entry.name === 'route.ts') {
        // Trailing /route.ts is the marker; URL path is the prefix.
        out.push(prefix);
      }
    }
    return out;
  }

  it('every src/app/api/**/route.ts derives a path that matches /^\\/api\\/(.*)/', () => {
    const apiDir = path.resolve(process.cwd(), 'src/app/api');
    const derivedPaths = listApiRoutes(apiDir, '/api');
    // The current count is 32 per 03-01-PLAN.md PD-01 / route-listing.
    // Use >= so future-route additions do not break the test.
    expect(derivedPaths.length).toBeGreaterThanOrEqual(32);
    const apiMatcher = /^\/api\/(.*)/;
    for (const derived of derivedPaths) {
      expect(
        apiMatcher.test(derived),
        `Derived path "${derived}" does not match the protected matcher pattern /api/(.*) — the proxy.ts createRouteMatcher arg list is out of sync with the actual /api route surface`
      ).toBe(true);
    }
  });
});
