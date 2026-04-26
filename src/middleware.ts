import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Define which routes require authentication
const PROTECTED_ROUTES = [
  "/",
  "/analytics",
  "/downtime",
  "/devices",
  "/projects",
  "/reports",
  "/settings",
  "/access",
  "/shared",
];

// Routes that should NOT redirect to login
const PUBLIC_ROUTES = [
  "/login",
  "/signup",
  "/register",
  "/verify-otp",
  "/forgot-password",
];

/**
 * Middleware to protect routes and require authentication
 * Run before any route handler
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ✅ Skip middleware for static files and assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/icons") ||
    pathname.startsWith("/assets") ||
    /\.(.*)$/.test(pathname) // any file with an extension (.png, .jpg, .svg, .ico, etc.)
  ) {
    return NextResponse.next();
  }

  // Get auth token from cookie or Authorization header
  const tokenFromCookie = request.cookies.get("auth_token")?.value;
  const tokenFromHeader = request.headers.get("authorization")?.replace("Bearer ", "");
  const token = tokenFromCookie || tokenFromHeader;

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  // ✅ Fixed: exact match for "/" to prevent every path matching as protected
  const isProtectedRoute = PROTECTED_ROUTES.some((route) => {
    if (route === "/") return pathname === "/";
    return pathname.startsWith(route);
  });

  // Log for debugging
  console.log(`[Middleware] Path: ${pathname}, Token: ${token ? "✓" : "✗"}, Protected: ${isProtectedRoute}, Public: ${isPublicRoute}`);

  // ── Allow public routes without auth ──
  if (isPublicRoute) {
    // If already authenticated and trying to access auth pages, redirect to dashboard
    if (token && (pathname === "/login" || pathname === "/signup" || pathname === "/register")) {
      console.log(`[Middleware] Authenticated user at auth page, redirecting to dashboard`);
      return NextResponse.redirect(new URL("/", request.url));
    }
    console.log(`[Middleware] Allowing public route: ${pathname}`);
    return NextResponse.next();
  }

  // ── Protect authenticated routes ──
  if (isProtectedRoute) {
    if (!token) {
      console.log(`[Middleware] No token found for route: ${pathname}, redirecting to login`);
      return NextResponse.redirect(new URL("/login", request.url));
    }
    console.log(`[Middleware] Token found for route: ${pathname}, allowing access`);
  }

  return NextResponse.next();
}

/**
 * Configure which routes the middleware applies to
 */
export const config = {
  matcher: [
    "/",
    "/analytics/:path*",
    "/downtime/:path*",
    "/devices/:path*",
    "/projects/:path*",
    "/reports/:path*",
    "/settings/:path*",
    "/access/:path*",
    "/shared/:path*",
  ],
};
