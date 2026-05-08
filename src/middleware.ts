import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PUBLIC_PATHS = [
  "/api/auth/",
  "/landing",
  "/_next/",
  "/favicon",
  "/manifest",
  "/icons/",
];

// Static asset extensions (only these bypass auth, not arbitrary "." paths)
const STATIC_EXT_RE = /\.(ico|png|jpg|jpeg|svg|webp|gif|css|js|map|txt|xml|woff2?|ttf|otf|json)$/i;

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname.startsWith(p));
}

function isStaticAsset(pathname: string) {
  // Never treat /api/* as static even if it contains a dot
  if (pathname.startsWith("/api/")) return false;
  return STATIC_EXT_RE.test(pathname);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public paths and true static files only
  if (isPublic(pathname) || isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Check session cookie
  const token = req.cookies.get("session")?.value;
  if (token) {
    try {
      const secret = new TextEncoder().encode(process.env.JWT_SECRET);
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      // Invalid/expired token — fall through to unauthorized
    }
  }

  // API routes return 401 JSON; pages redirect to landing
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const loginUrl = new URL("/landing", req.url);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
