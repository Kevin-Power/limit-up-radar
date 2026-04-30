"use client";

import Link from "next/link";
import useSWR from "swr";
import TopNav from "@/components/TopNav";
import NavBar from "@/components/NavBar";

interface RealBacktest {
  totalDays: number;
  totalSamples: number;
  avgOpenWinRate: number;
  avgCloseWinRate: number;
  avgOpenReturn: number;
  avgCloseReturn: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export default function SopClient() {
  const { data: focusData } = useSWR<{ realBacktest?: RealBacktest }>("/api/focus", fetcher);
  const bt = focusData?.realBacktest;

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-block px-3 py-1 rounded-full bg-red/10 text-red text-xs font-bold mb-3">
            操作手冊
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-txt-0 tracking-tight">
            明日焦點 · 實戰 SOP
          </h1>
          <p className="mt-3 text-sm text-txt-2 max-w-xl mx-auto">
            從盤後選股到隔日開盤賣出的完整操作流程<br/>
            基於真實 TWSE 隔日 OHLC 回測數據設計
          </p>
        </div>

        {/* Real Backtest Summary */}
        {bt && (
          <div className="bg-gradient-to-br from-red/5 via-amber/5 to-red/5 border-2 border-red/30 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="px-2 py-0.5 bg-red text-white text-[10px] font-bold rounded">真實回測</span>
              <h2 className="text-sm font-bold text-txt-0">最佳策略：隔日開盤賣</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-bg-1 border border-red/30 rounded-lg p-4 text-center">
                <div className="text-3xl font-extrabold text-red tabular-nums">{bt.avgOpenWinRate}%</div>
                <div className="text-xs text-txt-3 mt-1">隔日開盤賣勝率</div>
              </div>
              <div className="bg-bg-1 border border-amber/30 rounded-lg p-4 text-center">
                <div className="text-3xl font-extrabold text-amber tabular-nums">+{bt.avgOpenReturn}%</div>
                <div className="text-xs text-txt-3 mt-1">平均報酬</div>
              </div>
            </div>
            <p className="text-[10px] text-txt-4 mt-3 text-center">
              {bt.totalDays} 天 · {bt.totalSamples} 個樣本 · 用 TWSE 真實隔日成交價計算
            </p>
          </div>
        )}

        {/* Timeline */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">⏰ 每日時間表</h2>
          <div className="space-y-2">
            {[
              { time: "14:30 - 14:35", action: "台股收盤，TWSE 公布資料", color: "bg-bg-2" },
              { time: "14:35 - 14:40", action: "平台自動更新（GitHub Actions）", color: "bg-bg-2" },
              { time: "14:40 - 21:00", action: "看明日焦點 → 下單", color: "bg-amber/10 border-amber/30" },
              { time: "隔日 09:00 - 09:05", action: "開盤後 5 分鐘內賣出（最關鍵！）", color: "bg-red/10 border-red/30" },
            ].map((item, i) => (
              <div key={i} className={`flex gap-4 p-3 rounded-lg border border-border ${item.color}`}>
                <div className="text-xs font-mono text-txt-3 w-32 flex-shrink-0">{item.time}</div>
                <div className="text-sm text-txt-1">{item.action}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Three Steps */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">🎯 三步驟操作</h2>
          <div className="space-y-4">

            {/* Step 1 */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-red/15 text-red font-bold flex items-center justify-center flex-shrink-0">1</div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-txt-0">盤後選股（14:40 後）</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-txt-2">
                    <li>• 進入 <Link href="/focus" className="text-red hover:underline">明日焦點頁面</Link></li>
                    <li>• 看「精選追蹤標的」清單</li>
                    <li>• <strong className="text-red">只選評分 ≥ 60 分的</strong></li>
                    <li>• 一次最多挑 3-5 檔（不要全壓）</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-blue/15 text-blue font-bold flex items-center justify-center flex-shrink-0">2</div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-txt-0">盤後或隔日開盤前下單</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-txt-2">
                    <li>• <strong>盤後零股</strong>（14:30-16:30）：用今日收盤價買零股</li>
                    <li>• <strong>隔日 09:00 開盤前</strong>：掛漲停價限價單（會以開盤價成交）</li>
                    <li className="text-red">• ⚠️ 不要用市價單，可能高接</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-red/5 border-2 border-red/30 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-red text-white font-bold flex items-center justify-center flex-shrink-0">3</div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-txt-0">隔日 09:05 前賣出（最重要！）</h3>
                  <p className="mt-2 text-sm text-txt-2">開盤後 <strong className="text-red">5 分鐘內</strong>掛市價單賣出</p>
                  <div className="mt-3 p-3 bg-bg-1 rounded-lg border border-border">
                    <p className="text-xs text-txt-3 mb-2">為什麼？真實回測證明：</p>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-txt-2">隔日開盤賣</span>
                        <span className="text-red font-bold">勝率 {bt?.avgOpenWinRate ?? 77}% / 報酬 +{bt?.avgOpenReturn ?? 3.2}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-txt-2">隔日收盤賣</span>
                        <span className="text-green font-bold">勝率 {bt?.avgCloseWinRate ?? 58}% / 報酬 +{bt?.avgCloseReturn ?? 2.25}%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber mt-2">
                      ⚠️ 拖到收盤勝率掉約 19%，獲利減少約 30%
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-red">紀律 &gt; 判斷</p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* Money Management */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">💰 資金配置</h2>
          <div className="bg-bg-1 border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-2 text-txt-3 text-xs">
                <tr>
                  <th className="text-left px-4 py-2">等級</th>
                  <th className="text-right px-4 py-2">單檔比例</th>
                  <th className="text-right px-4 py-2">總部位上限</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-txt-1">新手</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">5%</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">30%</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-txt-1">進階</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">10%</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">50%</td>
                </tr>
                <tr className="border-t border-border">
                  <td className="px-4 py-3 text-txt-1">專業</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">15%</td>
                  <td className="text-right px-4 py-3 text-txt-1 tabular-nums">70%</td>
                </tr>
              </tbody>
            </table>
            <div className="px-4 py-3 bg-amber/5 border-t border-border text-xs text-txt-2">
              💡 永遠保留 <strong className="text-amber">30% 現金</strong>應對突發狀況
            </div>
          </div>
        </section>

        {/* Discipline Rules */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">🛑 紀律規則</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="bg-green/5 border border-green/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-green mb-2">✅ 必須做</h3>
              <ul className="space-y-1.5 text-xs text-txt-2">
                <li>1. 進場前查評分、族群、營收 YoY</li>
                <li>2. 進場同時設好停損價（-7%）</li>
                <li>3. 開盤就賣，不要看盤</li>
                <li>4. 每筆交易記錄結果（贏輸都記）</li>
              </ul>
            </div>
            <div className="bg-red/5 border border-red/30 rounded-xl p-4">
              <h3 className="text-sm font-bold text-red mb-2">❌ 絕對不要做</h3>
              <ul className="space-y-1.5 text-xs text-txt-2">
                <li>1. 看到飆股就追，沒看評分就買</li>
                <li>2. 賺錢還想抱到收盤（貪心）</li>
                <li>3. 賠錢凹單，跌破停損還抱</li>
                <li>4. 一檔押超過總資金 15%</li>
                <li>5. 用融資借錢操作</li>
              </ul>
            </div>
          </div>
        </section>

        {/* Expected Performance */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">📊 預期績效範例</h2>
          <div className="bg-bg-1 border border-border rounded-xl p-5">
            <p className="text-sm text-txt-2 mb-4">
              假設你每天買 5 檔、每檔 2 萬元（總 10 萬）：
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-txt-3">每日預期報酬</span>
                <span className="text-red font-bold">10 萬 × {bt?.avgOpenReturn ?? 3.2}% ≈ +{Math.round(100000 * (bt?.avgOpenReturn ?? 3.2) / 100).toLocaleString()} 元</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-txt-3">月交易日數</span>
                <span className="text-txt-1">22 天</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-txt-3">勝率分布</span>
                <span className="text-txt-1">約 17 天賺、5 天賠</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-txt-1 font-bold">預估月報酬</span>
                <span className="text-red font-extrabold text-lg">約 +{Math.round((bt?.avgOpenReturn ?? 3.2) * 22 * (bt?.avgOpenWinRate ?? 77) / 100)}%</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber/10 border border-amber/30 rounded-lg">
              <p className="text-[11px] text-txt-2 leading-relaxed">
                ⚠️ <strong>注意</strong>：基於 {bt?.totalSamples ?? 81} 筆小樣本回測。
                實際操作扣除手續費、證交稅（約 0.4%）、滑價會降低報酬。
                <strong className="text-red">過去績效不代表未來。</strong>
              </p>
            </div>
          </div>
        </section>

        {/* When to stop */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">🆘 何時該停止</h2>
          <div className="bg-bg-1 border-l-4 border-amber rounded-r-xl p-5">
            <p className="text-sm text-txt-1 mb-3">連續 <strong className="text-amber">5 天以上勝率 &lt; 50%</strong> → 暫停操作，檢查：</p>
            <ul className="space-y-1.5 text-sm text-txt-2 ml-4">
              <li>• 大盤連跌（TAIEX 月線下彎）？</li>
              <li>• 主力連續性族群消失？</li>
              <li>• 漲停家數 &lt; 30 檔（市場過冷）？</li>
            </ul>
            <p className="mt-3 text-xs text-txt-3">市場狀況不對時，<strong>休息也是一種策略</strong>。</p>
          </div>
        </section>

        {/* Quick Tools */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">📱 配套工具</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {[
              { label: "選股", href: "/focus", desc: "明日焦點" },
              { label: "個股研究", href: "/workspace", desc: "研究工作台" },
              { label: "盤前評估", href: "/global", desc: "國際市場" },
              { label: "營收查詢", href: "/revenue", desc: "1934 檔" },
              { label: "處置警示", href: "/disposal", desc: "風險預警" },
              { label: "學習基礎", href: "/learn", desc: "6 堂教學" },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="block bg-bg-1 border border-border rounded-lg p-3 hover:border-red/30 transition-colors text-center"
              >
                <div className="text-sm font-bold text-txt-0">{t.label}</div>
                <div className="text-[10px] text-txt-4 mt-0.5">{t.desc}</div>
              </Link>
            ))}
          </div>
        </section>

        {/* Disclaimer */}
        <div className="text-[10px] text-txt-4 text-center pb-4">
          以上為基於歷史數據的操作建議，不構成投資建議。投資有風險，請自行判斷。
        </div>
      </main>
    </>
  );
}
