import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const channelId = process.env.LINE_CHANNEL_ID;
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";

  if (!channelId) {
    return NextResponse.json({ error: "LINE_CHANNEL_ID not configured" }, { status: 500 });
  }

  const state = crypto.randomUUID();
  const returnTo = req.nextUrl.searchParams.get("returnTo") || "/";
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const lineUrl = new URL("https://access.line.me/oauth2/v2.1/authorize");
  lineUrl.searchParams.set("response_type", "code");
  lineUrl.searchParams.set("client_id", channelId);
  lineUrl.searchParams.set("redirect_uri", redirectUri);
  lineUrl.searchParams.set("state", state);
  lineUrl.searchParams.set("scope", "profile openid");

  const response = NextResponse.redirect(lineUrl.toString());

  // Store state in httpOnly cookie for CSRF verification (5 min TTL)
  response.cookies.set("line-oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  response.cookies.set("line-return-to", returnTo, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 300,
  });

  return response;
}
