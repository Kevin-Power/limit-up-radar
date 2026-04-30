import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { scoreStock, calculateTrendingGroups, calculatePriceLevels } from "@/lib/scoring";

const DAILY_DIR = path.join(process.cwd(), "data", "daily");
const REV_DIR = path.join(process.cwd(), "data", "revenue");

function loadJSON(filePath: string) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return null;
  }
}

export async function GET() {
  const files = fs.readdirSync(DAILY_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
  if (!files.length) return NextResponse.json({ error: "no data" }, { status: 404 });

  const today = loadJSON(path.join(DAILY_DIR, files[0]));
  const yesterday = files.length > 1 ? loadJSON(path.join(DAILY_DIR, files[1])) : null;
  const dayBefore = files.length > 2 ? loadJSON(path.join(DAILY_DIR, files[2])) : null;
  if (!today) return NextResponse.json({ error: "no data" }, { status: 404 });

  // Revenue map
  const revMap: Record<string, { revYoY: number | null }> = {};
  try {
    const revFiles = fs.readdirSync(REV_DIR).filter((f) => f.endsWith(".json")).sort().reverse();
    if (revFiles.length) {
      const rev = loadJSON(path.join(REV_DIR, revFiles[0]));
      if (rev?.stocks) for (const s of rev.stocks) revMap[s.code] = { revYoY: s.revYoY };
    }
  } catch { /* ignore */ }

  const ms = today.market_summary;
  const groups = today.groups || [];
  const totalLimitUp = groups.reduce((s: number, g: { stocks: unknown[] }) => s + g.stocks.length, 0);

  // Trending groups: appearing in 2+ of last 3 days (matches focus API)
  const prevDayGroups: { name: string }[][] = [];
  if (yesterday?.groups) prevDayGroups.push(yesterday.groups);
  if (dayBefore?.groups) prevDayGroups.push(dayBefore.groups);
  const { trending: trendingGroupNames } = calculateTrendingGroups(groups, prevDayGroups);
  const trendingGroups = groups.filter((g: { name: string }) => trendingGroupNames.has(g.name));

  // Score using shared logic (consistent with focus API)
  interface ScoredStock {
    code: string;
    name: string;
    close: number;
    group: string;
    score: number;
    revYoY: number | null;
    majorNet: number;
    tags: string[];
  }

  const picks: ScoredStock[] = [];
  for (const g of groups) {
    const sorted = [...g.stocks].sort((a: { volume: number }, b: { volume: number }) => b.volume - a.volume);
    const leaderCode = sorted[0]?.code;
    for (const s of g.stocks) {
      const rev = revMap[s.code];
      const { score, tags } = scoreStock({
        stock: s,
        group: g,
        trendingGroups: trendingGroupNames,
        groupVolumeLeaderCode: leaderCode,
        revYoY: rev?.revYoY,
      });
      if (score >= 50) {
        picks.push({
          code: s.code, name: s.name, close: s.close, group: g.name,
          score, revYoY: rev?.revYoY ?? null, majorNet: s.major_net, tags,
        });
      }
    }
  }
  picks.sort((a, b) => b.score - a.score);

  // Generate text report
  const date = today.date;
  const taiex = ms.taiex_close;
  const chg = ms.taiex_change_pct;
  const chgSign = chg > 0 ? "+" : "";
  const adv = ms.advance;
  const dec = ms.decline;
  const foreignNet = ms.foreign_net;
  const foreignB = foreignNet ? (foreignNet / 1e8).toFixed(1) : "N/A";
  const foreignDir = foreignNet > 0 ? "買超" : "賣超";

  let text = `📊 股文觀指 每日速報 ${date}\n`;
  text += `━━━━━━━━━━━━━━━━━━━\n\n`;
  text += `🏛 大盤 ${taiex.toLocaleString()} (${chgSign}${chg.toFixed(2)}%)\n`;
  text += `📈 漲 ${adv} / 📉 跌 ${dec} / 🔴 漲停 ${totalLimitUp} 檔\n`;
  text += `💰 外資${foreignDir} ${Math.abs(Number(foreignB))} 億\n\n`;

  text += `🔥 今日漲停族群 (${groups.length} 個)\n`;
  for (const g of groups) {
    const isT = trendingGroups.includes(g);
    text += `${isT ? "🔄" : "▪️"} ${g.name} (${g.stocks.length} 檔)${isT ? " ← 延續" : ""}\n`;
  }

  if (trendingGroups.length > 0) {
    text += `\n⚡ 延續性族群: ${trendingGroups.map((g: { name: string }) => g.name).join("、")}\n`;
  }

  if (picks.length > 0) {
    text += `\n🎯 明日焦點 TOP ${Math.min(picks.length, 10)}\n`;
    text += `━━━━━━━━━━━━━━━━━━━\n`;
    for (const p of picks.slice(0, 10)) {
      const revStr = p.revYoY != null ? ` 營收YoY ${p.revYoY > 0 ? "+" : ""}${p.revYoY.toFixed(0)}%` : "";
      const netStr = p.majorNet > 0 ? ` 法人+${(p.majorNet / 1000).toFixed(0)}張` : "";
      const lvl = calculatePriceLevels(p.close);
      text += `\n📍 ${p.code} ${p.name} [${p.score}分]\n`;
      text += `  收盤 $${p.close} | ${p.tags.join(" / ")}${revStr}${netStr}\n`;
      text += `  追價 $${lvl.entryAggressive} | 停損 $${lvl.stopLoss} | 目標 $${lvl.target1}~$${lvl.target2}\n`;
    }
  }

  text += `\n━━━━━━━━━━━━━━━━━━━\n`;
  text += `📱 完整分析 → limit-up-radar.vercel.app\n`;
  text += `⚠️ 以上僅供參考，不構成投資建議\n`;

  return NextResponse.json({
    date,
    text,
    summary: {
      taiex,
      taiexChg: chg,
      limitUp: totalLimitUp,
      groups: groups.length,
      trendingGroups: trendingGroups.length,
      topPicks: picks.length,
    },
  }, {
    headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=3600" },
  });
}
