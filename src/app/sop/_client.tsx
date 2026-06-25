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

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const fmtRtn = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`;

export default function SopClient() {
  const { data: focusData, error, isLoading } = useSWR<{ realBacktest?: RealBacktest }>(
    "/api/focus",
    fetcher
  );
  const bt = focusData?.realBacktest;

  // Show explicit error/loading state — never show fabricated metrics
  if (error) {
    return (
      <>
        <TopNav />
        <NavBar />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-20 text-center">
          <h1 className="text-xl font-bold text-red mb-2">回測資料無法載入</h1>
          <p className="text-sm text-txt-3">請稍後再試或檢查網路連線</p>
        </main>
      </>
    );
  }
  if (isLoading || !bt) {
    return (
      <>
        <TopNav />
        <NavBar />
        <main className="max-w-3xl mx-auto px-4 md:px-6 py-20 text-center text-txt-3">
          載入中...
        </main>
      </>
    );
  }

  return (
    <>
      <TopNav />
      <NavBar />
      <main className="max-w-3xl mx-auto px-4 md:px-6 py-8 space-y-8">
        {/* Hero */}
        <div className="text-center">
          <div className="inline-block px-3 py-1 rounded-full bg-red/10 text-red text-xs font-bold mb-3">
            個人紀律紀錄
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-txt-0 tracking-tight">
            明日焦點 · 實戰 SOP
          </h1>
          <p className="mt-3 text-sm text-txt-2 max-w-xl mx-auto">
            個人從盤後研究到隔日出場的流程紀錄分享（非操作指示）<br/>
            統計基於真實 TWSE 隔日 OHLC，未含交易成本與滑價
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
                <div className="text-3xl font-extrabold text-amber tabular-nums">{fmtRtn(bt.avgOpenReturn)}%</div>
                <div className="text-xs text-txt-3 mt-1">平均報酬</div>
              </div>
            </div>
            <p className="text-[10px] text-txt-4 mt-3 text-center">
              {bt.totalDays} 天 · {bt.totalSamples} 個樣本 · 用 TWSE 真實隔日成交價計算 · 毛報酬（未含成本與滑價）
            </p>
            <p className="text-[10px] text-txt-4 mt-1 text-center">
              勝率為隔日開盤報酬 &gt; 0 的比例，非漲停板繼續率
            </p>
          </div>
        )}

        {/* Timeline */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">⏰ 每日時間表</h2>
          <div className="space-y-2">
            {[
              { time: "14:30", action: "台股收盤，TWSE 陸續公布資料", color: "bg-bg-2" },
              { time: "約 17:00", action: "平台自動更新（GitHub Actions，等法人資料定版後抓取）", color: "bg-bg-2" },
              { time: "17:00 - 21:00", action: "看明日焦點 → 做隔日功課", color: "bg-amber/10 border-amber/30" },
              { time: "隔日 09:00 - 09:05", action: "（個人紀律）開盤 5 分鐘內出場", color: "bg-red/10 border-red/30" },
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
                    <li>• 看「精選追蹤標的」清單（分數 ≥50 都會列出）</li>
                    <li>• <strong className="text-red">實際下單建議只選 ≥ 60 分</strong>（保守原則）</li>
                    <li>• 一次最多挑 3-5 檔（不要全壓）</li>
                  </ul>
                  <div className="mt-3 p-3 bg-amber/10 border border-amber/30 rounded-lg">
                    <p className="text-xs text-amber font-bold mb-1">⚠️ 看到「連3紅注意回測」標記時：</p>
                    <p className="text-xs text-txt-2">連漲 3 日以上標的：次日續板率下降，建議倉位減半・開盤前 5 分鐘必須出場・不留隔夜</p>
                  </div>
                  <p className="mt-2 text-[11px] text-txt-4 leading-relaxed">
                    💡 註：上方回測勝率是「分數 ≥50 全樣本、未含成本」的毛數字。
                    ≥60 高分群與含成本後的實際分布，
                    見<Link href="/stats" className="text-red hover:underline">統計頁「誠實統計」</Link>，以實算為準。
                  </p>
                </div>
              </div>
            </div>

            {/* Step 1.5 — 盤前複核清單（08:30-09:00） */}
            <details className="bg-bg-1 border border-amber/30 rounded-xl overflow-hidden group">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber/15 text-amber">盤前</span>
                  <span className="text-sm font-bold text-txt-0">隔日 08:30–09:00 複核清單</span>
                </div>
                <span className="text-txt-3 text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-5 pb-4">
                <p className="text-xs text-txt-3 mb-3">開盤前確認以下項目，任一「不符」考慮縮量或取消</p>
                <ul className="space-y-2 text-xs text-txt-2">
                  <li className="flex items-start gap-2"><span className="text-amber mt-0.5">□</span><span>美股昨收 / 期指方向（台指期開盤方向）</span></li>
                  <li className="flex items-start gap-2"><span className="text-amber mt-0.5">□</span><span>族群今日盤前是否仍熱門（個股相關新聞無重大利空）</span></li>
                  <li className="flex items-start gap-2"><span className="text-amber mt-0.5">□</span><span>個股昨晚有無重大公告（財報、增資、除息、警示）</span></li>
                  <li className="flex items-start gap-2"><span className="text-amber mt-0.5">□</span><span>揭示價 / 試撮價在收盤 ±3% 內（未被砸盤）</span></li>
                  <li className="flex items-start gap-2"><span className="text-amber mt-0.5">□</span><span>股本夠大、流動性足夠（漲停板可以出場）</span></li>
                </ul>
                <p className="text-[10px] text-txt-4 mt-3">盤前氣勢不強 → 不買。觀望也是策略。</p>
              </div>
            </details>

            {/* Step 2 */}
            <div className="bg-bg-1 border border-border rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-full bg-blue/15 text-blue font-bold flex items-center justify-center flex-shrink-0">2</div>
                <div className="flex-1">
                  <h3 className="text-base font-bold text-txt-0">盤後或隔日開盤前下單</h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-txt-2">
                    <li>• <strong>盤後零股</strong>（14:30–16:30）：於盤後集合競價買零股（以 16:30 集競定價成交，非收盤價；小型股可能未能全額成交）</li>
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
                        <span className="text-red font-bold">勝率 {bt.avgOpenWinRate}% / 報酬 {fmtRtn(bt.avgOpenReturn)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-txt-2">隔日收盤賣</span>
                        <span className="text-green font-bold">勝率 {bt.avgCloseWinRate}% / 報酬 {fmtRtn(bt.avgCloseReturn)}%</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-amber mt-2">
                      ⚠️ 拖到收盤勝率掉約 {Math.round(bt.avgOpenWinRate - bt.avgCloseWinRate)}%，
                      獲利{bt.avgOpenReturn > 0
                        ? `減少約 ${Math.round((bt.avgOpenReturn - bt.avgCloseReturn) / bt.avgOpenReturn * 100)}%`
                        : `差距 ${fmtRtn(bt.avgOpenReturn - bt.avgCloseReturn)}%`}
                    </p>
                  </div>
                  <p className="mt-3 text-sm font-bold text-red">紀律 &gt; 判斷</p>
                </div>
              </div>
            </div>

            {/* 357 Advanced — collapsible */}
            <details className="bg-bg-1 border border-border rounded-xl overflow-hidden group">
              <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
                <span className="text-sm font-bold text-txt-0">進階：開盤 5 分鐘觀察（357 法則）</span>
                <span className="text-txt-3 text-xs group-open:rotate-180 transition-transform">▼</span>
              </summary>
              <div className="px-5 pb-5">
                <p className="text-xs text-txt-3 mb-3">漲停次日開盤幅度是關鍵訊號，根據 PDF 357 法則分三個節點判斷：</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-bg-2 text-txt-3">
                        <th className="text-left px-3 py-2">開盤幅度</th>
                        <th className="text-left px-3 py-2">訊號解讀</th>
                        <th className="text-left px-3 py-2">建議動作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      <tr><td className="px-3 py-2 font-mono text-red font-bold">≥ +9.5%</td><td className="px-3 py-2 text-txt-1">續漲停</td><td className="px-3 py-2 text-txt-2">強力護板，續抱，停損設昨漲停價</td></tr>
                      <tr><td className="px-3 py-2 font-mono text-red">+7% ~ +9.5%</td><td className="px-3 py-2 text-txt-1">超強拉抬</td><td className="px-3 py-2 text-txt-2">持有，破 VP 才出場</td></tr>
                      <tr><td className="px-3 py-2 font-mono text-amber">+5% ~ +7%</td><td className="px-3 py-2 text-txt-1">強勢追價</td><td className="px-3 py-2 text-txt-2">量能配合則守，看 2 個 5 分 K</td></tr>
                      <tr><td className="px-3 py-2 font-mono text-amber">+3% ~ +5%</td><td className="px-3 py-2 text-txt-1">中低開（相對漲停）</td><td className="px-3 py-2 text-txt-2">容易刷洗，需量推升，觀察 1 個 5 分 K</td></tr>
                      <tr><td className="px-3 py-2 font-mono text-txt-2">0% ~ +3%</td><td className="px-3 py-2 text-txt-1">平開弱勢</td><td className="px-3 py-2 text-txt-2">謹慎，開盤不回升考慮出場</td></tr>
                      <tr><td className="px-3 py-2 font-mono text-green">低於 0%</td><td className="px-3 py-2 text-txt-1">直接跌</td><td className="px-3 py-2 text-txt-2 font-bold text-red">開盤即出場，不戀戰</td></tr>
                    </tbody>
                  </table>
                </div>
                <p className="text-[10px] text-txt-4 mt-3">VP = VWAP 成交量加權平均價，需盤中看實時行情，本平台不提供即時資料</p>
              </div>
            </details>

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

        {/* 波段 358 法則 — collapsible */}
        <section>
          <details className="bg-bg-1 border border-border rounded-xl overflow-hidden group">
            <summary className="flex items-center justify-between px-5 py-4 cursor-pointer list-none">
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue/15 text-blue">進階</span>
                <span className="text-sm font-bold text-txt-0">波段操作 358 法則</span>
              </div>
              <span className="text-txt-3 text-xs group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className="px-5 pb-5">
              <p className="text-xs text-txt-3 mb-3">漲停後不賣、想做波段時的判斷框架（高風險，僅供研究）</p>
              <div className="space-y-3">
                <div className="p-3 bg-blue/5 border border-blue/20 rounded-lg">
                  <p className="text-xs font-bold text-blue mb-1">三個觀察週期</p>
                  <p className="text-xs text-txt-2">漲停後連續 3 天 → 延伸 5 天 → 延伸 8 天。每個節點重新評估出場時機。</p>
                </div>
                <div className="p-3 bg-green/5 border border-green/20 rounded-lg">
                  <p className="text-xs font-bold text-green mb-2">持倉口訣</p>
                  <ul className="space-y-1 text-xs text-txt-2">
                    <li>• 高有過高（今高 &gt; 前高）</li>
                    <li>• 低不過低（今低 &gt; 前低）</li>
                    <li>• 收盤比前一天高</li>
                  </ul>
                  <p className="text-[11px] text-txt-3 mt-2">三條件同時成立 → 可繼續持有</p>
                </div>
                <div className="p-3 bg-red/5 border border-red/30 rounded-lg">
                  <p className="text-xs font-bold text-red mb-1">出場訊號</p>
                  <p className="text-xs text-txt-2">第一次跌破 5 日均線收盤 → 無條件出場，不等反彈</p>
                </div>
                <p className="text-[10px] text-txt-4">波段操作需要盤中即時監控，不適合僅做盤後分析的策略，風險遠高於隔日開盤賣</p>
              </div>
            </div>
          </details>
        </section>

        {/* Cost Reality — education, replaces the old monthly-return projection */}
        <section>
          <h2 className="text-lg font-bold text-txt-0 mb-4">📊 成本的真實影響（教育示例）</h2>
          <div className="bg-bg-1 border border-border rounded-xl p-5">
            <p className="text-sm text-txt-2 mb-4">
              回測的「平均 {fmtRtn(bt.avgOpenReturn)}%」是<strong className="text-amber">毛報酬</strong>。
              現股來回都有固定成本，以下兩個情境各自從毛報酬獨立計算：
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-txt-3">回測平均毛報酬</span>
                <span className="text-txt-1 font-bold tabular-nums">{fmtRtn(bt.avgOpenReturn)}%</span>
              </div>
              <div className="flex justify-between border-b border-border pb-2">
                <span className="text-txt-3">情境 A：扣費稅（手續費×2 ＋ 當沖稅 合計 0.435%）</span>
                <span className="text-amber font-bold tabular-nums">≈ {fmtRtn(bt.avgOpenReturn - 0.435)}%</span>
              </div>
              <div className="flex justify-between pt-2">
                <span className="text-txt-3">情境 B：保守含滑價（費稅＋滑價合計 1%）</span>
                <span className="text-amber font-bold tabular-nums">≈ {fmtRtn(bt.avgOpenReturn - 1.0)}%</span>
              </div>
            </div>
            <div className="mt-4 p-3 bg-amber/10 border border-amber/30 rounded-lg">
              <p className="text-[11px] text-txt-2 leading-relaxed">
                ⚠️ 而且「平均」常被少數暴衝樣本拉高——<strong>中位數通常更低</strong>；
                小型股跳空開盤的「開盤價」也未必是你成交得到的價格。
                完整的「中位數 / 截尾平均 / 多空分段 / 信賴區間」
                見<Link href="/stats" className="text-red hover:underline">統計頁「誠實統計」</Link>。
                <strong className="text-red">過去統計不代表未來，不構成投資建議。</strong>
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
          以上為個人操作紀律之紀錄分享，非投顧服務，不構成投資建議。投資有風險，請自行判斷。
        </div>
      </main>
    </>
  );
}
