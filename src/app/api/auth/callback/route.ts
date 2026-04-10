import { NextRequest, NextResponse } from "next/server";
import { signToken, setSessionCookie } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000";
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  // Verify state against cookie
  const savedState = req.cookies.get("line-oauth-state")?.value;
  const returnTo = req.cookies.get("line-return-to")?.value || "/";

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(`${baseUrl}/?error=auth_invalid_state`);
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${baseUrl}/api/auth/callback`,
        client_id: process.env.LINE_CHANNEL_ID!,
        client_secret: process.env.LINE_CHANNEL_SECRET!,
      }),
    });

    if (!tokenRes.ok) {
      console.error("LINE token exchange failed:", await tokenRes.text());
      return NextResponse.redirect(`${baseUrl}/?error=auth_token_failed`);
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile
    const profileRes = await fetch("https://api.line.me/v2/profile", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!profileRes.ok) {
      console.error("LINE profile fetch failed:", await profileRes.text());
      return NextResponse.redirect(`${baseUrl}/?error=auth_profile_failed`);
    }

    const profile = await profileRes.json();
    const token = await signToken({
      userId: profile.userId,
      displayName: profile.displayName,
      pictureUrl: profile.pictureUrl || "",
    });

    const response = NextResponse.redirect(`${baseUrl}${returnTo}`);
    setSessionCookie(response, token);

    // Clear OAuth cookies
    response.cookies.set("line-oauth-state", "", { path: "/", maxAge: 0 });
    response.cookies.set("line-return-to", "", { path: "/", maxAge: 0 });

    return response;
  } catch (err) {
    console.error("LINE auth callback error:", err);
    return NextResponse.redirect(`${baseUrl}/?error=auth_failed`);
  }
}
