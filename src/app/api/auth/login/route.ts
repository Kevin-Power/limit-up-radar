import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { signToken, setSessionCookie } from "@/lib/auth";

// 速率限制：IP in-memory 滑動視窗。
// 注意：serverless 多實例環境下，每個實例各自有獨立記憶體，
// 此限制僅為「盡力而為（best-effort）」，無法跨實例共享狀態。
// 若需強保證應改用集中式存儲（如 Redis/Upstash）。
const WINDOW_MS = 60_000; // 1 分鐘視窗
const MAX_ATTEMPTS = 5; // 每視窗最多 5 次
const FAILURE_DELAY_MS = 500; // 失敗時固定延遲，拖慢暴力破解

const attempts = new Map<string, number[]>();

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** 回傳 true 表示已超過速率限制。同時記錄本次嘗試並清理過期記錄。 */
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  attempts.set(ip, recent);

  // 機會性清理：避免 Map 無限增長
  if (attempts.size > 1000) {
    for (const [key, times] of attempts) {
      const live = times.filter((t) => now - t < WINDOW_MS);
      if (live.length === 0) attempts.delete(key);
      else attempts.set(key, live);
    }
  }

  return recent.length > MAX_ATTEMPTS;
}

/** 常數時間字串比對，防時序攻擊。長度不同也保持比對成本後回傳 false。 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // 長度不同必不相等，但仍對等長 buffer 做一次比對避免提前返回洩漏長度
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  if (isRateLimited(ip)) {
    await delay(FAILURE_DELAY_MS);
    return NextResponse.json(
      { error: "嘗試次數過多，請稍後再試" },
      { status: 429 },
    );
  }

  const { password } = await req.json();
  const correctPassword = process.env.AUTH_PASSWORD;

  if (!correctPassword) {
    return NextResponse.json({ error: "AUTH_PASSWORD not configured" }, { status: 500 });
  }

  if (typeof password !== "string" || !safeEqual(password, correctPassword)) {
    await delay(FAILURE_DELAY_MS);
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
