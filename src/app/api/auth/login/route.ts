import { NextRequest, NextResponse } from "next/server";
import { signToken, setSessionCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json();
  const correctPassword = process.env.AUTH_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ error: "AUTH_PASSWORD not configured" }, { status: 500 });
  }

  if (password !== correctPassword) {
    return NextResponse.json({ error: "密碼錯誤" }, { status: 401 });
  }

  const token = await signToken({
    userId: "admin",
    displayName: "大師",
    pictureUrl: "",
  });

  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token);
  return response;
}
