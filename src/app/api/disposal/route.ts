/**
 * 處置預測 API
 *
 * Computes disposal risk by scanning accumulated daily JSON files.
 * TWSE disposes stocks when: ≥3 limit-up days in 6 days, or ≥10-day gain ≥30%.
 * We approximate this using streak counts and price gains from our daily data.
 */
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";

interface StockEntry {
  code: string;
  name: string;
  industry: string;
  close: number;
  change_pct: number;
  volume: number;
  streak: number;
  market?: string;
}

interface GroupEntry {
  name: string;
  color: string;
  stocks: StockEntry[];
}

interface DailyFile {
  date: string;
  groups: GroupEntry[];
}

export interface DisposalCandidate {
  code: string;
  name: string;
  industry: string;
  latestClose: number;
  firstClose: number;
  daysLimitUp: number;       // how many days hit limit-up in our data window
  totalDaysInWindow: number; // total trading days in data window
  streak: number;            // current streak from latest day's data
  gain: number;              // % gain from first appearance to latest
  risk: "高危" | "注意" | "觀察";
  status: "正常交易" | "預警中" | "已處置";
  lastSeen: string;          // date of last limit-up
}

export async function GET() {
  const dataDir = path.join(process.cwd(), "data", "daily");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dataDir)).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return NextResponse.json([], { status: 200 });
  }

  const dailyFiles: DailyFile[] = [];
  for (const file of files) {
    try {
      const raw = await fs.readFile(path.join(dataDir, file), "utf8");
      dailyFiles.push(JSON.parse(raw));
    } catch { /* skip */ }
  }

  if (dailyFiles.length === 0) {
    return NextResponse.json([], { status: 200 });
  }

  // Track each stock's appearances across days
  const stockAppearances = new Map<
    string,
    {
      name: string;
      industry: string;
      firstClose: number;
      latestClose: number;
      maxStreak: number;
      daysLimitUp: number;
      lastSeen: string;
    }
  >();

  for (const day of dailyFiles) {
    for (const g of day.groups) {
      for (const s of g.stocks) {
        const existing = stockAppearances.get(s.code);
        if (!existing) {
          stockAppearances.set(s.code, {
            name: s.name,
            industry: s.industry,
            firstClose: s.close,
            latestClose: s.close,
            maxStreak: s.streak,
            daysLimitUp: 1,
            lastSeen: day.date,
          });
        } else {
          existing.latestClose = s.close;
          existing.daysLimitUp += 1;
          existing.maxStreak = Math.max(existing.maxStreak, s.streak);
          existing.lastSeen = day.date;
        }
      }
    }
  }

  const totalDays = dailyFiles.length;
  const candidates: DisposalCandidate[] = [];

  for (const [code, data] of stockAppearances.entries()) {
    const gain = data.firstClose > 0
      ? ((data.latestClose - data.firstClose) / data.firstClose) * 100
      : 0;

    // TWSE disposal criteria: streak ≥ 3 limit-up days in ≤ 6 trading days
    let risk: "高危" | "注意" | "觀察";
    let status: "正常交易" | "預警中" | "已處置";

    if (data.maxStreak >= 5 || gain >= 30 || data.daysLimitUp >= 5) {
      risk = "高危";
      status = data.maxStreak >= 5 ? "預警中" : "正常交易";
    } else if (data.maxStreak >= 3 || gain >= 20 || data.daysLimitUp >= 3) {
      risk = "注意";
      status = "正常交易";
    } else {
      risk = "觀察";
      status = "正常交易";
    }

    candidates.push({
      code,
      name: data.name,
      industry: data.industry,
      latestClose: data.latestClose,
      firstClose: data.firstClose,
      daysLimitUp: data.daysLimitUp,
      totalDaysInWindow: totalDays,
      streak: data.maxStreak,
      gain: +gain.toFixed(1),
      risk,
      status,
      lastSeen: data.lastSeen,
    });
  }

  // Sort: high risk first, then by streak desc
  const riskOrder = { "高危": 0, "注意": 1, "觀察": 2 };
  candidates.sort((a, b) => {
    const rd = riskOrder[a.risk] - riskOrder[b.risk];
    if (rd !== 0) return rd;
    return b.streak - a.streak || b.gain - a.gain;
  });

  return NextResponse.json(candidates, {
    headers: {
      "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600",
    },
  });
}
