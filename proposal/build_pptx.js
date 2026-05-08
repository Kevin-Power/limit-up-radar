const pptxgen = require("pptxgenjs");

// === COLOR PALETTE: 股文觀指 (financial trader dark theme) ===
const C = {
  bg:       "0F172A", // deep navy (slate-900)
  bgCard:   "1E293B", // slate-800
  bgLight:  "F8FAFC", // off-white for content slides
  red:      "EF4444", // primary accent (漲停)
  redDark:  "B91C1C",
  amber:    "F59E0B", // highlight
  green:    "10B981", // success
  blue:     "3B82F6",
  white:    "FFFFFF",
  text:     "0F172A",
  textMute: "475569",
  textDim:  "94A3B8",
  border:   "334155",
};

const FONT = "Microsoft JhengHei";   // Chinese-friendly
const FONT_BODY = "Microsoft JhengHei";

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";  // 10" × 5.625"
pres.author = "股文觀指 大師專區";
pres.title = "股文觀指 商業提案";

// ============================================================
// Helpers
// ============================================================
const W = 10, H = 5.625;
const makeShadow = () => ({ type: "outer", blur: 6, offset: 2, angle: 135, color: "000000", opacity: 0.18 });

function addDarkBg(slide) {
  slide.background = { color: C.bg };
}

function addLightBg(slide) {
  slide.background = { color: C.bgLight };
}

function addHeader(slide, title, subtitle) {
  slide.addText(title, {
    x: 0.5, y: 0.3, w: 9, h: 0.55,
    fontSize: 28, fontFace: FONT, bold: true, color: C.text, margin: 0,
  });
  if (subtitle) {
    slide.addText(subtitle, {
      x: 0.5, y: 0.85, w: 9, h: 0.35,
      fontSize: 13, fontFace: FONT, color: C.textMute, margin: 0,
    });
  }
}

function addPageNum(slide, n, total) {
  slide.addText(`${n} / ${total}`, {
    x: 9.0, y: 5.3, w: 0.9, h: 0.25,
    fontSize: 9, fontFace: FONT, color: C.textDim, align: "right", margin: 0,
  });
}

const TOTAL = 16;

// ============================================================
// SLIDE 1: Cover
// ============================================================
{
  const s = pres.addSlide();
  addDarkBg(s);
  // Red accent bar on left
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: 0.15, h: H,
    fill: { color: C.red }, line: { color: C.red, width: 0 },
  });
  // Brand mark
  s.addText("// 股文觀指 大師專區", {
    x: 0.7, y: 1.2, w: 9, h: 0.5,
    fontSize: 16, fontFace: FONT, color: C.red, bold: true, margin: 0,
  });
  // Main title
  s.addText("台股漲停族群操作平台", {
    x: 0.7, y: 1.85, w: 9, h: 1.0,
    fontSize: 44, fontFace: FONT, bold: true, color: C.white, margin: 0,
  });
  // Tagline
  s.addText("資料驅動 · 真實回測 · 公開透明", {
    x: 0.7, y: 2.95, w: 9, h: 0.5,
    fontSize: 18, fontFace: FONT, color: C.textDim, margin: 0,
  });
  // 79% callout
  s.addText([
    { text: "79", options: { fontSize: 60, bold: true, color: C.red } },
    { text: "%", options: { fontSize: 36, bold: true, color: C.red } },
    { text: "  隔日開盤勝率", options: { fontSize: 16, color: C.white } },
  ], { x: 0.7, y: 3.7, w: 9, h: 0.9, fontFace: FONT, margin: 0 });
  s.addText("99 樣本 / 10 天 / 樣本加權 · 真實 TWSE OHLC", {
    x: 0.7, y: 4.55, w: 9, h: 0.3,
    fontSize: 11, fontFace: FONT, color: C.textDim, margin: 0,
  });
  // URL footer
  s.addText("limit-up-radar.vercel.app", {
    x: 0.7, y: 5.1, w: 9, h: 0.3,
    fontSize: 12, fontFace: FONT, color: C.amber, italic: true, margin: 0,
  });
}

// ============================================================
// SLIDE 2: 散戶痛點
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "散戶在漲停股操作的三大痛點", "資訊雜訊多、缺乏可驗證數據、操作仰賴片段經驗");
  const pains = [
    { num: "01", title: "資訊分散各處", desc: "交易所、券商 App、財經網、社群討論——\n散戶要自己手動整理族群、連板、量價、籌碼" },
    { num: "02", title: "隔日表現難驗證", desc: "市場只討論「今天誰漲停」\n沒人系統性追蹤隔日真實開盤/收盤表現" },
    { num: "03", title: "操作仰賴片段經驗", desc: "缺乏可量化的勝率、報酬數據\n買賣決策受情緒與群眾雜訊影響" },
  ];
  pains.forEach((p, i) => {
    const x = 0.5 + i * 3.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.7, w: 2.95, h: 3.3,
      fill: { color: C.white }, line: { color: C.border, width: 1 },
      shadow: makeShadow(),
    });
    // Number
    s.addText(p.num, {
      x, y: 1.9, w: 2.95, h: 0.7,
      fontSize: 44, fontFace: FONT, bold: true, color: C.red, align: "center", margin: 0,
    });
    s.addText(p.title, {
      x, y: 2.7, w: 2.95, h: 0.5,
      fontSize: 18, fontFace: FONT, bold: true, color: C.text, align: "center", margin: 0,
    });
    s.addText(p.desc, {
      x: x + 0.2, y: 3.3, w: 2.55, h: 1.6,
      fontSize: 12, fontFace: FONT_BODY, color: C.textMute, align: "center", margin: 0,
    });
  });
  addPageNum(s, 2, TOTAL);
}

// ============================================================
// SLIDE 3: 平台一覽
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "平台一覽：自動化資料管線", "每日 17:00 抓取 · 三層健全性驗證 · 16 個功能頁面");

  // 4-step pipeline
  const steps = [
    { icon: "01", t: "TWSE / TPEx", d: "公開官方資料\n股價、法人、營收" },
    { icon: "02", t: "GitHub Actions", d: "每日 17:00\n自動排程抓取" },
    { icon: "03", t: "三層驗證", d: "TAIEX、漲幅、樣本數\n通過才上線" },
    { icon: "04", t: "Vercel 部署", d: "自動部署\n用戶即時看到" },
  ];
  steps.forEach((st, i) => {
    const x = 0.4 + i * 2.4;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.6, w: 2.05, h: 2.0,
      fill: { color: C.bg }, line: { color: C.bg, width: 0 },
      shadow: makeShadow(),
    });
    s.addText(st.icon, {
      x, y: 1.75, w: 2.05, h: 0.6,
      fontSize: 28, fontFace: FONT, bold: true, color: C.amber, align: "center", margin: 0,
    });
    s.addText(st.t, {
      x, y: 2.4, w: 2.05, h: 0.4,
      fontSize: 14, fontFace: FONT, bold: true, color: C.white, align: "center", margin: 0,
    });
    s.addText(st.d, {
      x: x + 0.15, y: 2.85, w: 1.75, h: 0.7,
      fontSize: 10, fontFace: FONT_BODY, color: C.textDim, align: "center", margin: 0,
    });
    if (i < 3) {
      // Arrow
      s.addText("→", {
        x: x + 2.05, y: 2.4, w: 0.35, h: 0.4,
        fontSize: 22, fontFace: FONT, color: C.red, align: "center", bold: true, margin: 0,
      });
    }
  });

  // Stats row at bottom
  const stats = [
    { v: "33", l: "個交易日資料" },
    { v: "1,934", l: "檔月營收追蹤" },
    { v: "16", l: "個功能頁面" },
    { v: "$0", l: "目前營運成本" },
  ];
  stats.forEach((st, i) => {
    const x = 0.4 + i * 2.4;
    s.addText(st.v, {
      x, y: 4.1, w: 2.05, h: 0.6,
      fontSize: 32, fontFace: FONT, bold: true, color: C.red, align: "center", margin: 0,
    });
    s.addText(st.l, {
      x, y: 4.7, w: 2.05, h: 0.3,
      fontSize: 11, fontFace: FONT, color: C.textMute, align: "center", margin: 0,
    });
  });
  addPageNum(s, 3, TOTAL);
}

// ============================================================
// SLIDES 4-8: 5 大功能
// ============================================================
const features = [
  {
    n: 4, num: "功能 01", title: "明日焦點", subtitle: "AI 篩選次日值得追蹤標的",
    bullets: [
      "綜合評分系統（最高 100+ 分）",
      "趨勢族群、營收成長、法人買超、連板、龍頭",
      "提供進場、停損、目標參考區間（情境提示）",
    ],
    metric: { v: "47", l: "今日精選標的" },
    color: C.red,
  },
  {
    n: 5, num: "功能 02", title: "隔日表現", subtitle: "用真實 TWSE OHLC 驗證",
    bullets: [
      "個股漲停後實際隔日開盤、收盤表現",
      "統計開盤/收盤勝率、平均開盤與收盤報酬、最佳與最差案例",
      "資料來源：TWSE STOCK_DAY + TPEx tradingStock",
    ],
    metric: { v: "99", l: "實際樣本數" },
    color: C.amber,
  },
  {
    n: 6, num: "功能 03", title: "營收速報", subtitle: "永豐金 Sinopac 月營收資料",
    bullets: [
      "1,934 檔上市櫃公司月營收",
      "YoY 成長率、累計營收、同產業比較",
      "搭配技術面，篩選有基本面支撐的個股",
    ],
    metric: { v: "1,934", l: "檔月營收覆蓋（Sinopac）" },
    color: C.green,
  },
  {
    n: 7, num: "功能 04", title: "處置預測", subtitle: "風險控管前置作業",
    bullets: [
      "依交易所規則預測高波動處置風險",
      "強勢股追高前先看是否在處置邊緣",
      "協助辨識規則型處置風險（不保證涵蓋所有黑天鵝）",
    ],
    metric: { v: "T+0", l: "即時風險評估" },
    color: C.blue,
  },
  {
    n: 8, num: "功能 05", title: "交易教室", subtitle: "6 堂結構化教學課程",
    bullets: [
      "為什麼要關注漲停股、看懂族群分類",
      "進場時機、隔日沖策略、風險控管",
      "實戰工作流程 SOP",
    ],
    metric: { v: "6", l: "堂免費課程" },
    color: C.amber,
  },
];

features.forEach((f) => {
  const s = pres.addSlide();
  addLightBg(s);
  // Top mini-label
  s.addText(f.num, {
    x: 0.5, y: 0.3, w: 3, h: 0.3,
    fontSize: 12, fontFace: FONT, bold: true, color: f.color, charSpacing: 4, margin: 0,
  });
  s.addText(f.title, {
    x: 0.5, y: 0.65, w: 9, h: 0.7,
    fontSize: 36, fontFace: FONT, bold: true, color: C.text, margin: 0,
  });
  s.addText(f.subtitle, {
    x: 0.5, y: 1.4, w: 9, h: 0.4,
    fontSize: 16, fontFace: FONT, color: C.textMute, margin: 0,
  });

  // Left: bullets
  s.addText(
    f.bullets.map((b, i) => ({
      text: b,
      options: { bullet: { code: "25A0" }, color: C.text, fontSize: 16, paraSpaceAfter: 14, breakLine: i < f.bullets.length - 1 },
    })),
    { x: 0.5, y: 2.3, w: 5.5, h: 2.8, fontFace: FONT_BODY, margin: 0 }
  );

  // Right: metric callout box
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.5, y: 2.3, w: 3.0, h: 2.5,
    fill: { color: C.bg }, line: { color: C.bg, width: 0 },
    shadow: makeShadow(),
  });
  // accent stripe
  s.addShape(pres.shapes.RECTANGLE, {
    x: 6.5, y: 2.3, w: 0.08, h: 2.5,
    fill: { color: f.color }, line: { color: f.color, width: 0 },
  });
  s.addText(f.metric.v, {
    x: 6.5, y: 2.9, w: 3.0, h: 1.0,
    fontSize: 60, fontFace: FONT, bold: true, color: f.color, align: "center", margin: 0,
  });
  s.addText(f.metric.l, {
    x: 6.5, y: 3.95, w: 3.0, h: 0.4,
    fontSize: 14, fontFace: FONT, color: C.white, align: "center", margin: 0,
  });

  // Footer link
  s.addText(`查看：limit-up-radar.vercel.app/${f.title === "明日焦點" ? "focus" : f.title === "隔日表現" ? "next-day" : f.title === "營收速報" ? "revenue" : f.title === "處置預測" ? "disposal" : "learn"}`, {
    x: 0.5, y: 5.05, w: 9, h: 0.3,
    fontSize: 10, fontFace: FONT, color: C.textDim, italic: true, margin: 0,
  });
  addPageNum(s, f.n, TOTAL);
});

// ============================================================
// SLIDE 9: 79% HERO 勝率
// ============================================================
{
  const s = pres.addSlide();
  addDarkBg(s);
  // Top label
  s.addText("回測結果（10 天 / 99 樣本）", {
    x: 0.5, y: 0.5, w: 9, h: 0.4,
    fontSize: 18, fontFace: FONT, color: C.amber, bold: true, charSpacing: 6, margin: 0,
  });
  s.addText("用 TWSE 真實隔日 OHLC 計算 · 樣本加權 · 非估計值", {
    x: 0.5, y: 0.95, w: 9, h: 0.4,
    fontSize: 13, fontFace: FONT, color: C.textDim, margin: 0,
  });

  // BIG 79% in center
  s.addText("79%", {
    x: 0.5, y: 1.6, w: 9, h: 2.4,
    fontSize: 220, fontFace: FONT, bold: true, color: C.red, align: "center", margin: 0,
  });
  s.addText("隔日開盤勝率", {
    x: 0.5, y: 4.0, w: 9, h: 0.5,
    fontSize: 22, fontFace: FONT, color: C.white, align: "center", margin: 0,
  });

  // Metrics row at bottom
  const m = [
    { v: "78 / 99", l: "命中 / 總樣本" },
    { v: "+3.25%", l: "平均開盤報酬" },
    { v: "10 天", l: "回測區間" },
  ];
  m.forEach((mm, i) => {
    const x = 0.5 + i * 3.15;
    s.addText(mm.v, {
      x, y: 4.65, w: 2.95, h: 0.4,
      fontSize: 22, fontFace: FONT, bold: true, color: C.amber, align: "center", margin: 0,
    });
    s.addText(mm.l, {
      x, y: 5.05, w: 2.95, h: 0.3,
      fontSize: 11, fontFace: FONT, color: C.textDim, align: "center", margin: 0,
    });
  });
  addPageNum(s, 9, TOTAL);
}

// ============================================================
// SLIDE 10: 競爭定位
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "競爭定位：聚焦 + 透明", "不做大而全，在「漲停股隔日追蹤」場景中做最深");

  // Comparison table
  const headers = ["項目", "CMoney", "Goodinfo", "券商 App", "股文觀指"];
  const rows = [
    ["漲停股清單", "✓", "✓", "✓", "✓"],
    ["族群自動分類", "○", "△", "✗", "✓ AI"],
    ["隔日真實 OHLC 回測", "✗", "✗", "✗", "✓ 99 樣本"],
    ["月營收交叉分析", "△", "✓", "△", "✓ 1934 檔"],
    ["進出場參考區間", "○", "✗", "○", "✓"],
    ["公開透明（程式碼/方法）", "✗", "✗", "✗", "✓ GitHub"],
  ];
  const colW = [2.6, 1.5, 1.5, 1.5, 1.9];
  const tableData = [
    headers.map((h, i) => ({
      text: h,
      options: {
        fill: { color: C.bg }, color: C.white, bold: true, fontSize: 13,
        align: "center", valign: "middle", fontFace: FONT,
      },
    })),
    ...rows.map((r) => r.map((cell, i) => ({
      text: cell,
      options: {
        fontSize: 12, color: i === 4 ? C.red : C.text,
        bold: i === 4 || i === 0,
        align: i === 0 ? "left" : "center", valign: "middle",
        fontFace: FONT, margin: 0,
        fill: i === 4 ? { color: "FEF2F2" } : undefined,
      },
    }))),
  ];
  s.addTable(tableData, {
    x: 0.5, y: 1.5, w: 9, colW,
    border: { pt: 1, color: C.border },
    rowH: 0.5,
  });
  s.addText("○ 部分支援   △ 有限   ✗ 不支援   ✓ 完整", {
    x: 0.5, y: 5.0, w: 9, h: 0.3,
    fontSize: 10, fontFace: FONT, color: C.textDim, italic: true, margin: 0,
  });
  addPageNum(s, 10, TOTAL);
}

// ============================================================
// SLIDE 11: 商業模式 (3 stages)
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "商業模式：三階段漸進", "免費獲客 → 月費社群 → 教學課程");

  const stages = [
    { num: "01", title: "免費獲客期", duration: "0-3 月", price: "免費", desc: "用平台真實數據建立信任\n累積 SEO 流量與口碑", color: C.blue },
    { num: "02", title: "LINE 群月費", duration: "3-6 月", price: "NT$ 299-599 / 月", desc: "每日精選清單推送\n觀察名單、操作紀律提醒", color: C.amber },
    { num: "03", title: "進階教學課程", duration: "6 月+", price: "NT$ 3,000-5,000 / 期", desc: "完整方法論、實戰演練\n承接需要深度的進階用戶", color: C.red },
  ];
  stages.forEach((st, i) => {
    const x = 0.4 + i * 3.2;
    // Card
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.6, w: 3.0, h: 3.5,
      fill: { color: C.white }, line: { color: C.border, width: 1 },
      shadow: makeShadow(),
    });
    // Top stripe
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.6, w: 3.0, h: 0.12,
      fill: { color: st.color }, line: { color: st.color, width: 0 },
    });
    // Stage num
    s.addText(st.num, {
      x: x + 0.2, y: 1.85, w: 1.0, h: 0.5,
      fontSize: 32, fontFace: FONT, bold: true, color: st.color, margin: 0,
    });
    s.addText(st.duration, {
      x: x + 1.5, y: 1.95, w: 1.4, h: 0.35,
      fontSize: 11, fontFace: FONT, color: C.textMute, align: "right", margin: 0,
    });
    s.addText(st.title, {
      x: x + 0.2, y: 2.5, w: 2.6, h: 0.5,
      fontSize: 18, fontFace: FONT, bold: true, color: C.text, margin: 0,
    });
    s.addText(st.price, {
      x: x + 0.2, y: 3.05, w: 2.6, h: 0.4,
      fontSize: 14, fontFace: FONT, bold: true, color: st.color, margin: 0,
    });
    s.addText(st.desc, {
      x: x + 0.2, y: 3.55, w: 2.6, h: 1.4,
      fontSize: 12, fontFace: FONT_BODY, color: C.textMute, margin: 0,
    });
  });
  addPageNum(s, 11, TOTAL);
}

// ============================================================
// SLIDE 12: 財務預測
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "財務預測：保守情境推估", "僅以月費 NT$ 299-599 × 付費人數計算（不含課程加購）");

  // 3 scenario cards + bar chart
  const scenarios = [
    { v: "100", label: "付費用戶（保守）", min: 29900, max: 59900, color: C.blue },
    { v: "500", label: "付費用戶（穩健）", min: 149500, max: 299500, color: C.amber },
    { v: "2,000", label: "付費用戶（成熟）", min: 598000, max: 1198000, color: C.red },
  ];
  scenarios.forEach((sc, i) => {
    const x = 0.4 + i * 3.2;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.6, w: 3.0, h: 1.7,
      fill: { color: C.white }, line: { color: C.border, width: 1 },
      shadow: makeShadow(),
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 1.6, w: 0.08, h: 1.7,
      fill: { color: sc.color }, line: { color: sc.color, width: 0 },
    });
    s.addText(sc.v, {
      x: x + 0.2, y: 1.7, w: 2.7, h: 0.7,
      fontSize: 40, fontFace: FONT, bold: true, color: sc.color, margin: 0,
    });
    s.addText(sc.label, {
      x: x + 0.2, y: 2.4, w: 2.7, h: 0.3,
      fontSize: 12, fontFace: FONT, color: C.textMute, margin: 0,
    });
    s.addText([
      { text: "月收入：", options: { fontSize: 11, color: C.textMute } },
      { text: `NT$ ${sc.min.toLocaleString()}`, options: { fontSize: 13, bold: true, color: C.text } },
      { text: " - ", options: { fontSize: 11, color: C.textMute } },
      { text: `${sc.max.toLocaleString()}`, options: { fontSize: 13, bold: true, color: C.text } },
    ], {
      x: x + 0.2, y: 2.8, w: 2.7, h: 0.4,
      fontFace: FONT, margin: 0,
    });
  });

  // Chart at bottom
  s.addChart(pres.charts.BAR, [
    { name: "月費 NT$299", labels: ["100 人", "500 人", "2,000 人"], values: [29900, 149500, 598000] },
    { name: "月費 NT$599", labels: ["100 人", "500 人", "2,000 人"], values: [59900, 299500, 1198000] },
  ], {
    x: 0.5, y: 3.6, w: 9, h: 1.5,
    barDir: "col",
    chartColors: [C.blue, C.red],
    chartArea: { fill: { color: C.bgLight } },
    catAxisLabelColor: C.textMute,
    valAxisLabelColor: C.textMute,
    catAxisLabelFontFace: FONT,
    valAxisLabelFontFace: FONT,
    valGridLine: { color: "E2E8F0", size: 0.5 },
    catGridLine: { style: "none" },
    showLegend: true, legendPos: "t",
    legendFontFace: FONT,
    legendFontSize: 10,
    showValue: false,
  });
  addPageNum(s, 12, TOTAL);
}

// ============================================================
// SLIDE 13: 行銷規劃
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "行銷規劃：低成本獲客", "三層漏斗：流量 → 信任 → 付費");

  const funnel = [
    { w: 8.0, color: C.blue, t: "上層流量", v: "SEO + 內容", d: "經營「漲停股」「隔日表現」「月營收」等台股長尾關鍵字" },
    { w: 6.5, color: C.amber, t: "中層信任", v: "真實數據揭露", d: "公開 79% 勝率、99 樣本回測、開源演算法，建立差異化信任" },
    { w: 5.0, color: C.red, t: "下層付費", v: "LINE 群轉換", d: "高互動社群每日精選推送，自然轉成月費會員" },
  ];
  funnel.forEach((f, i) => {
    const x = (W - f.w) / 2;
    const y = 1.6 + i * 1.15;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y, w: f.w, h: 1.0,
      fill: { color: f.color }, line: { color: f.color, width: 0 },
      shadow: makeShadow(),
    });
    s.addText(f.t, {
      x: x + 0.3, y: y + 0.1, w: 2.5, h: 0.4,
      fontSize: 16, fontFace: FONT, bold: true, color: C.white, margin: 0,
    });
    s.addText(f.v, {
      x: x + 0.3, y: y + 0.5, w: 2.5, h: 0.4,
      fontSize: 13, fontFace: FONT, color: C.white, margin: 0,
    });
    s.addText(f.d, {
      x: x + 3.0, y: y + 0.2, w: f.w - 3.2, h: 0.7,
      fontSize: 12, fontFace: FONT_BODY, color: C.white, margin: 0,
    });
  });
  s.addText("成本結構：Vercel 免費方案 + GitHub Actions 免費 + TWSE 公開 API（運營成本 NT$ 0）", {
    x: 0.5, y: 5.05, w: 9, h: 0.3,
    fontSize: 11, fontFace: FONT, color: C.textMute, italic: true, align: "center", margin: 0,
  });
  addPageNum(s, 13, TOTAL);
}

// ============================================================
// SLIDE 14: 6 月路線圖
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "6 個月路線圖", "穩定資料 → 付費測試 → 課程商品化");

  const roadmap = [
    { month: "M1-M2", title: "穩定基礎", color: C.blue, bullets: ["每日資料更新無中斷", "回測樣本擴充至 200+", "強化健全性驗證"] },
    { month: "M3-M4", title: "付費測試", color: C.amber, bullets: ["LINE 群開放招募", "首批 50 人付費內測", "蒐集用戶實際操作回饋"] },
    { month: "M5-M6", title: "課程上架", color: C.red, bullets: ["6 堂課程內容定稿", "上架 Hahow / Teachable", "建立會員留存機制"] },
  ];
  // Connector line
  s.addShape(pres.shapes.LINE, {
    x: 1.0, y: 2.7, w: 8.0, h: 0,
    line: { color: C.border, width: 2 },
  });
  roadmap.forEach((r, i) => {
    const x = 1.0 + i * 2.7;
    // Circle
    s.addShape(pres.shapes.OVAL, {
      x: x + 1.2, y: 2.4, w: 0.6, h: 0.6,
      fill: { color: r.color }, line: { color: C.white, width: 3 },
    });
    s.addText(`${i + 1}`, {
      x: x + 1.2, y: 2.4, w: 0.6, h: 0.6,
      fontSize: 16, fontFace: FONT, bold: true, color: C.white, align: "center", valign: "middle", margin: 0,
    });
    // Month
    s.addText(r.month, {
      x: x, y: 1.7, w: 3.0, h: 0.3,
      fontSize: 11, fontFace: FONT, bold: true, color: r.color, align: "center", margin: 0,
    });
    s.addText(r.title, {
      x: x, y: 2.0, w: 3.0, h: 0.4,
      fontSize: 18, fontFace: FONT, bold: true, color: C.text, align: "center", margin: 0,
    });
    // Bullets card
    s.addShape(pres.shapes.RECTANGLE, {
      x: x + 0.15, y: 3.3, w: 2.7, h: 1.7,
      fill: { color: C.white }, line: { color: C.border, width: 1 },
      shadow: makeShadow(),
    });
    s.addText(
      r.bullets.map((b, j) => ({
        text: b,
        options: { bullet: true, fontSize: 12, color: C.textMute, paraSpaceAfter: 6, breakLine: j < r.bullets.length - 1 },
      })),
      { x: x + 0.35, y: 3.45, w: 2.4, h: 1.4, fontFace: FONT_BODY, margin: 0 }
    );
  });
  addPageNum(s, 14, TOTAL);
}

// ============================================================
// SLIDE 15: 風險聲明
// ============================================================
{
  const s = pres.addSlide();
  addLightBg(s);
  addHeader(s, "風險聲明：誠實揭露", "我們相信信任的基礎在於不掩蓋限制");

  const risks = [
    { t: "樣本短", d: "目前回測僅 99 筆 / 10 天，未涵蓋多空頭循環。績效在不同市況下會有顯著差異。" },
    { t: "個人開發", d: "尚無團隊、客服、客戶服務窗口。系統故障時的恢復時間取決於開發者個人時間。" },
    { t: "無金融牌照", d: "本平台不是金融顧問業者。所有內容僅供參考，不構成任何投資建議或保證。" },
    { t: "資料延遲", d: "每日資料於收盤後約 2.5 小時更新。盤中即時資訊請以券商即時報價為準。" },
    { t: "市場風險", d: "投資有風險。漲停股操作為高波動策略，可能造成本金虧損。請在自身可承受範圍內操作。" },
  ];

  risks.forEach((r, i) => {
    const y = 1.55 + i * 0.7;
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: 9.0, h: 0.6,
      fill: { color: C.white }, line: { color: C.border, width: 1 },
    });
    s.addShape(pres.shapes.RECTANGLE, {
      x: 0.5, y, w: 0.08, h: 0.6,
      fill: { color: C.amber }, line: { color: C.amber, width: 0 },
    });
    s.addText(r.t, {
      x: 0.75, y: y + 0.05, w: 1.5, h: 0.5,
      fontSize: 13, fontFace: FONT, bold: true, color: C.text, valign: "middle", margin: 0,
    });
    s.addText(r.d, {
      x: 2.3, y: y + 0.05, w: 7.1, h: 0.5,
      fontSize: 11, fontFace: FONT_BODY, color: C.textMute, valign: "middle", margin: 0,
    });
  });
  addPageNum(s, 15, TOTAL);
}

// ============================================================
// SLIDE 16: CTA
// ============================================================
{
  const s = pres.addSlide();
  addDarkBg(s);
  // Red bar
  s.addShape(pres.shapes.RECTANGLE, {
    x: 0, y: 0, w: W, h: 0.15,
    fill: { color: C.red }, line: { color: C.red, width: 0 },
  });

  s.addText("下一步", {
    x: 0.5, y: 0.7, w: 9, h: 0.5,
    fontSize: 14, fontFace: FONT, color: C.amber, bold: true, charSpacing: 8, margin: 0,
  });
  s.addText("從這裡開始", {
    x: 0.5, y: 1.25, w: 9, h: 1.0,
    fontSize: 56, fontFace: FONT, bold: true, color: C.white, margin: 0,
  });

  // Three CTAs
  const ctas = [
    { num: "01", t: "立即體驗平台", d: "limit-up-radar.vercel.app\n所有功能登入後即可使用" },
    { num: "02", t: "加入早期付費測試", d: "成為首批 50 名 LINE 群會員\n用每日真實數據驗證價值" },
    { num: "03", t: "投資合作洽談", d: "適合做小規模商業化驗證\n資料管線已完整、產品已成型" },
  ];
  ctas.forEach((c, i) => {
    const x = 0.4 + i * 3.2;
    s.addShape(pres.shapes.RECTANGLE, {
      x, y: 2.7, w: 3.0, h: 2.0,
      fill: { color: C.bgCard }, line: { color: C.bgCard, width: 0 },
      shadow: makeShadow(),
    });
    s.addText(c.num, {
      x: x + 0.2, y: 2.85, w: 2.7, h: 0.4,
      fontSize: 14, fontFace: FONT, bold: true, color: C.red, margin: 0,
    });
    s.addText(c.t, {
      x: x + 0.2, y: 3.25, w: 2.7, h: 0.5,
      fontSize: 18, fontFace: FONT, bold: true, color: C.white, margin: 0,
    });
    s.addText(c.d, {
      x: x + 0.2, y: 3.8, w: 2.7, h: 0.85,
      fontSize: 11, fontFace: FONT_BODY, color: C.textDim, margin: 0,
    });
  });

  s.addText("limit-up-radar.vercel.app", {
    x: 0.5, y: 4.95, w: 9, h: 0.5,
    fontSize: 22, fontFace: FONT, bold: true, color: C.amber, align: "center", italic: true, margin: 0,
  });
}

// ============================================================
// Write
// ============================================================
pres.writeFile({ fileName: "股文觀指_商業簡報.pptx" })
  .then((f) => console.log(`Saved: ${f}`))
  .catch((e) => { console.error(e); process.exit(1); });
