import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

const ALLOWED_EMAIL = 'steve@bronstein.org';
// Protected matcher covers BOTH /dashboard/* (browser) and /api/* (browser + CLI).
// Public /auth/* paths are intentionally excluded so the sign-in flow stays reachable (D-05).
const isProtectedRoute = createRouteMatcher(['/dashboard(.*)', '/api/(.*)']);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  if (!isProtectedRoute(req)) return;

  const isApiPath = req.nextUrl.pathname.startsWith('/api/');

  if (isApiPath) {
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
