import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_EMAIL = 'steve@bronstein.org';
// Protected matcher covers BOTH /dashboard/* (browser) and /api/* (browser + CLI).
// Public /auth/* paths are intentionally excluded so the sign-in flow stays reachable (D-05).
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/api/(.*)']);

// Edge-compatible SHA-256 helper (Web Crypto). Middleware runs in the Edge runtime
// where Node's `crypto` module is not available; `crypto.subtle.digest` is. Used to
// verify the bearer-token bypass on /api/* paths against process.env.API_TOKEN_HASH.
async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (!isProtectedRoute(req)) return;

  const isApiPath = req.nextUrl.pathname.startsWith('/api/');

  if (isApiPath) {
    // D-19 / D-21: long-lived Bearer-token bypass for the Claude Code skill.
    // The skill cannot present a Clerk session cookie (it runs outside a browser),
    // so we accept `Authorization: Bearer <token>` when SHA-256(token) matches
    // process.env.API_TOKEN_HASH AND process.env.SINGLE_USER_EMAIL === ALLOWED_EMAIL.
    // Multi-tenant deployments are protected by the explicit SINGLE_USER_EMAIL gate.
    // On any failure (missing/invalid token, missing env gate) we silently fall
    // through to the existing Clerk session check — preserving the {success,error}
    // envelope contract for unauthenticated callers.
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      const expected = process.env.API_TOKEN_HASH;
      const singleUser = process.env.SINGLE_USER_EMAIL;
      if (expected && token && singleUser === ALLOWED_EMAIL) {
        const hash = await sha256Hex(token);
        if (hash === expected) {
          // Bypass Clerk entirely — let the request through.
          return;
        }
      }
      // Otherwise fall through to Clerk's session check below.
    }

    // CD-02: /api/* MUST return the API-V1 envelope on unauthenticated calls.
    // Clerk's default auth.protect() emits an HTML redirect to /auth/sign-in, which
    // breaks the {success, data, error, meta} contract for CLI consumers.
    // Call auth() WITHOUT .protect() and short-circuit ourselves with NextResponse.json.
    const { userId, sessionClaims } = await auth();
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const email = sessionClaims?.email as string | undefined;
    if (email && email !== ALLOWED_EMAIL) {
      // D-03: email lock applies to /api/* the same as /dashboard/*.
      return NextResponse.redirect(new URL('/auth/sign-in', req.url));
    }
    return;
  }

  // /dashboard/* path: preserve original behavior — auth.protect() emits an HTML
  // redirect to sign-in for unauthenticated browser callers (correct UX).
  const { sessionClaims } = await auth.protect();
  const email = sessionClaims?.email as string | undefined;
  if (email && email !== ALLOWED_EMAIL) {
    return NextResponse.redirect(new URL('/auth/sign-in', req.url));
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)'
  ]
};
