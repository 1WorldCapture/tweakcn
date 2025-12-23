import { NextResponse, type NextRequest } from "next/server";

import { API_AUTH_PREFIX, DEFAULT_LOGIN_REDIRECT } from "./routes";

export async function middleware(request: NextRequest) {
  // Avoid DB access in middleware (Edge runtime). Delegate session lookup to the auth route handler.
  let session: any = null;
  try {
    const res = await fetch(new URL(`${API_AUTH_PREFIX}/get-session`, request.url), {
      method: "GET",
      headers: request.headers,
      cache: "no-store",
    });

    if (res.ok) {
      session = await res.json();
    }
  } catch {
    session = null;
  }

  const pathname = request.nextUrl.pathname;

  const isApiAuth = pathname.startsWith(API_AUTH_PREFIX);

  if (isApiAuth) {
    return NextResponse.next();
  }

  if (!session) {
    return NextResponse.redirect(new URL(DEFAULT_LOGIN_REDIRECT, request.url));
  }

  if (session) {
    // Redirect logged-in users from /dashboard or /settings (root) to /settings/themes
    if (pathname === "/dashboard" || pathname === "/settings") {
      return NextResponse.redirect(new URL("/settings/themes", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/editor/theme/:themeId", "/dashboard", "/settings/:path*", "/success"],
};
