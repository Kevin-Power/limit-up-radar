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
  market: string;            // "上市" | "上櫃" | "興櫃"
  latestClose: number;
  firstClose: number;
  daysLimitUp: number;       // how many days hit limit-up in rolling 10-day window
  totalDaysInWindow: number; // total trading days in data window (max 10)
  streak: number;            // current streak from latest day's data
  gain: number;              // % gain from first to latest within the window
  risk: "高危" | "注意" | "觀察";
  status: "正常交易" | "預警中";
  lastSeen: string;          // date of last limit-up
}

export async function GET() {
  const dataDir = path.join(process.cwd(), "data", "daily");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dataDir))
      .filter((f) => f.endsWith(".json"))
      .sort()
      .slice(-10); // rolling 10-day window per TWSE disposal rule
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

  // Track each stock across the 10-day window
  const stockAppearances = new Map<
    string,
    {
      name: string;
      industry: string;
      market: string;
      firstClose: number;
      latestClose: number;
      maxStreak: number;
      daysLimitUp: number;
      lastSeen: string;
      changePcts: number[];
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
            market: s.market ?? "上市",
            firstClose: s.close,
            latestClose: s.close,
            maxStreak: s.streak,
            daysLimitUp: 1,
            lastSeen: day.date,
            changePcts: [s.change_pct],
          });
        } else {
          existing.latestClose = s.close;
          existing.daysLimitUp += 1;
          existing.maxStreak = Math.max(existing.maxStreak, s.streak);
          existing.lastSeen = day.date;
          existing.changePcts.push(s.change_pct);
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

    const abnormalDays = data.changePcts.filter((p) => Math.abs(p) >= 3.5).length;
    const status: "正常交易" | "預警中" = abnormalDays >= 6 ? "預警中" : "正常交易";

    let risk: "高危" | "注意" | "觀察";

    if (data.daysLimitUp >= 5 || data.maxStreak >= 5 || gain >= 30) {
      risk = "高危";
    } else if (data.daysLimitUp >= 3 || data.maxStreak >= 3 || gain >= 20) {
      risk = "注意";
    } else {
      risk = "觀察";
    }

    candidates.push({
      code,
      name: data.name,
      industry: data.industry,
      market: data.market,
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
