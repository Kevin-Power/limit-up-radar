const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const { FaChartLine, FaRocket, FaShieldAlt, FaBolt, FaGlobe, FaSearch, FaChartBar, FaNewspaper, FaFileAlt, FaExclamationTriangle, FaHorseHead, FaCogs, FaCheckCircle, FaStar, FaUsers, FaDollarSign, FaTrophy, FaLightbulb, FaArrowRight, FaCrown } = require("react-icons/fa");

function renderIconSvg(IconComponent, color, size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}

async function iconToBase64Png(IconComponent, color, size = 256) {
  const svg = renderIconSvg(IconComponent, color, size);
  const pngBuffer = await sharp(Buffer.from(svg)).png().toBuffer();
  return "image/png;base64," + pngBuffer.toString("base64");
}

// Colors
const BG_DARK = "0D1117";
const BG_CARD = "161B22";
const BG_CARD2 = "1C2333";
const RED = "EF4444";
const GREEN = "22C55E";
const BLUE = "3B82F6";
const AMBER = "F59E0B";
const PURPLE = "A855F7";
const WHITE = "FFFFFF";
const GRAY = "8B949E";
const LIGHT = "E6EDF3";
const CYAN = "06B6D4";

const makeShadow = () => ({ type: "outer", blur: 8, offset: 3, angle: 135, color: "000000", opacity: 0.4 });

async function createDeck() {
  let pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";
  pres.author = "Kevin Power";
  pres.title = "漲停雷達 Limit-Up Radar";

  // Icons
  const iconChart = await iconToBase64Png(FaChartLine, "#3B82F6");
  const iconRocket = await iconToBase64Png(FaRocket, "#EF4444");
  const iconShield = await iconToBase64Png(FaShieldAlt, "#22C55E");
  const iconBolt = await iconToBase64Png(FaBolt, "#F59E0B");
  const iconGlobe = await iconToBase64Png(FaGlobe, "#06B6D4");
  const iconSearch = await iconToBase64Png(FaSearch, "#A855F7");
  const iconBar = await iconToBase64Png(FaChartBar, "#3B82F6");
  const iconNews = await iconToBase64Png(FaNewspaper, "#F59E0B");
  const iconFile = await iconToBase64Png(FaFileAlt, "#22C55E");
  const iconWarn = await iconToBase64Png(FaExclamationTriangle, "#EF4444");
  const iconHorse = await iconToBase64Png(FaHorseHead, "#A855F7");
  const iconCogs = await iconToBase64Png(FaCogs, "#06B6D4");
  const iconCheck = await iconToBase64Png(FaCheckCircle, "#22C55E");
  const iconStar = await iconToBase64Png(FaStar, "#F59E0B");
  const iconUsers = await iconToBase64Png(FaUsers, "#3B82F6");
  const iconDollar = await iconToBase64Png(FaDollarSign, "#22C55E");
  const iconTrophy = await iconToBase64Png(FaTrophy, "#F59E0B");
  const iconLight = await iconToBase64Png(FaLightbulb, "#F59E0B");
  const iconArrow = await iconToBase64Png(FaArrowRight, "#FFFFFF");
  const iconCrown = await iconToBase64Png(FaCrown, "#F59E0B");

  // ========== SLIDE 1: Title ==========
  let s1 = pres.addSlide();
  s1.background = { color: BG_DARK };
  // Top accent line
  s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: RED } });
  // Red glow circle
  s1.addShape(pres.shapes.OVAL, { x: 3.8, y: 0.8, w: 2.4, h: 2.4, fill: { color: RED, transparency: 85 } });
  s1.addImage({ data: iconChart, x: 4.5, y: 1.15, w: 1, h: 1 });
  s1.addText("漲停雷達", { x: 0.5, y: 2.5, w: 9, h: 1.2, fontSize: 54, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
  s1.addText("Limit-Up Radar", { x: 0.5, y: 3.5, w: 9, h: 0.6, fontSize: 22, fontFace: "Calibri", color: RED, align: "center", charSpacing: 8, margin: 0 });
  s1.addText("AI 驅動的台股漲停族群分類與分析平台", { x: 0.5, y: 4.2, w: 9, h: 0.5, fontSize: 16, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  // Bottom bar
  s1.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: BG_CARD } });
  s1.addText("limit-up-radar.vercel.app", { x: 0.5, y: 5.2, w: 5, h: 0.425, fontSize: 11, fontFace: "Consolas", color: CYAN, valign: "middle", margin: 0 });
  s1.addText("2026.03", { x: 5, y: 5.2, w: 4.5, h: 0.425, fontSize: 11, fontFace: "Consolas", color: GRAY, align: "right", valign: "middle", margin: 0 });

  // ========== SLIDE 2: Problem ==========
  let s2 = pres.addSlide();
  s2.background = { color: BG_DARK };
  s2.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: RED } });
  s2.addText("痛點", { x: 0.5, y: 0.3, w: 3, h: 0.6, fontSize: 32, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  s2.addText("台股投資人每天面對的困境", { x: 0.5, y: 0.85, w: 6, h: 0.4, fontSize: 14, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });

  const problems = [
    { icon: iconSearch, title: "資訊分散", desc: "要開 5-10 個網站才能掌握\n漲停股、法人、國際盤全貌", color: RED },
    { icon: iconCogs, title: "手動分析耗時", desc: "族群分類靠人工判斷\n容易遺漏關聯性", color: AMBER },
    { icon: iconWarn, title: "追高套牢", desc: "缺乏隔日表現數據驗證\n憑感覺追漲停常被套", color: PURPLE },
    { icon: iconShield, title: "忽略風險", desc: "不知道哪些股票即將被\n交易所處置，措手不及", color: BLUE },
  ];
  problems.forEach((p, i) => {
    const x = 0.5 + i * 2.35;
    s2.addShape(pres.shapes.RECTANGLE, { x, y: 1.6, w: 2.1, h: 3.2, fill: { color: BG_CARD }, shadow: makeShadow() });
    s2.addShape(pres.shapes.RECTANGLE, { x, y: 1.6, w: 2.1, h: 0.06, fill: { color: p.color } });
    s2.addShape(pres.shapes.OVAL, { x: x + 0.65, y: 2.0, w: 0.8, h: 0.8, fill: { color: p.color, transparency: 80 } });
    s2.addImage({ data: p.icon, x: x + 0.8, y: 2.15, w: 0.5, h: 0.5 });
    s2.addText(p.title, { x: x + 0.1, y: 3.0, w: 1.9, h: 0.5, fontSize: 16, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
    s2.addText(p.desc, { x: x + 0.1, y: 3.5, w: 1.9, h: 1.0, fontSize: 11, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  });

  // ========== SLIDE 3: Solution ==========
  let s3 = pres.addSlide();
  s3.background = { color: BG_DARK };
  s3.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: GREEN } });
  s3.addImage({ data: iconRocket, x: 0.5, y: 0.3, w: 0.4, h: 0.4 });
  s3.addText("解決方案", { x: 1.0, y: 0.3, w: 4, h: 0.5, fontSize: 32, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  s3.addText("一站式漲停股分析平台，從盤前到盤後全覆蓋", { x: 0.5, y: 0.85, w: 8, h: 0.4, fontSize: 14, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });

  // Big number callouts
  const solutions = [
    { num: "10", label: "功能模組", sub: "從族群分類到策略回測", color: RED },
    { num: "54", label: "漲停股追蹤", sub: "即時分類與隔日驗證", color: GREEN },
    { num: "14", label: "國際指數", sub: "全球市場一覽無遺", color: BLUE },
    { num: "30s", label: "掌握盤面", sub: "不用開 5 個網站", color: AMBER },
  ];
  solutions.forEach((s, i) => {
    const x = 0.5 + i * 2.35;
    s3.addShape(pres.shapes.RECTANGLE, { x, y: 1.6, w: 2.1, h: 1.6, fill: { color: BG_CARD }, shadow: makeShadow() });
    s3.addText(s.num, { x, y: 1.7, w: 2.1, h: 0.8, fontSize: 42, fontFace: "Consolas", bold: true, color: s.color, align: "center", margin: 0 });
    s3.addText(s.label, { x, y: 2.4, w: 2.1, h: 0.4, fontSize: 14, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
    s3.addText(s.sub, { x, y: 2.75, w: 2.1, h: 0.3, fontSize: 10, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  });

  // Bottom feature strip
  const features = ["AI 族群分類", "隔日表現驗證", "EMA 策略信號", "策略回測系統", "處置風險預警"];
  features.forEach((f, i) => {
    const x = 0.3 + i * 1.95;
    s3.addShape(pres.shapes.RECTANGLE, { x, y: 3.6, w: 1.8, h: 0.5, fill: { color: BG_CARD2 } });
    s3.addText(f, { x, y: 3.6, w: 1.8, h: 0.5, fontSize: 10, fontFace: "Microsoft JhengHei", color: LIGHT, align: "center", valign: "middle", margin: 0 });
  });

  // Bottom description
  s3.addText([
    { text: "漲停雷達", options: { bold: true, color: RED } },
    { text: " 整合每日漲停族群分類、隔日表現追蹤、技術指標選股、策略回測、國際市場監控，\n讓投資人用數據取代直覺，用系統取代手動。", options: { color: GRAY } },
  ], { x: 0.5, y: 4.4, w: 9, h: 0.8, fontSize: 12, fontFace: "Microsoft JhengHei", margin: 0 });

  // ========== SLIDE 4: 10 Features Overview ==========
  let s4 = pres.addSlide();
  s4.background = { color: BG_DARK };
  s4.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: BLUE } });
  s4.addText("10 大功能模組", { x: 0.5, y: 0.2, w: 6, h: 0.6, fontSize: 28, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  const modules = [
    { icon: iconChart, name: "每日總覽", desc: "一眼掌握盤面", c: RED },
    { icon: iconBar, name: "隔日表現", desc: "驗證追漲策略", c: GREEN },
    { icon: iconHorse, name: "快樂小馬", desc: "EMA交叉信號", c: PURPLE },
    { icon: iconCogs, name: "策略回測", desc: "歷史數據驗證", c: CYAN },
    { icon: iconSearch, name: "進階選股", desc: "多條件篩選", c: AMBER },
    { icon: iconGlobe, name: "國際市場", desc: "全球指數總覽", c: BLUE },
    { icon: iconNews, name: "市場情資", desc: "財經新聞彙整", c: RED },
    { icon: iconFile, name: "盤後報告", desc: "每日市場總結", c: GREEN },
    { icon: iconBar, name: "統計分析", desc: "長期數據規律", c: PURPLE },
    { icon: iconWarn, name: "處置預測", desc: "風險提前預警", c: AMBER },
  ];
  modules.forEach((m, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const x = 0.35 + col * 1.92;
    const y = 1.1 + row * 2.1;
    s4.addShape(pres.shapes.RECTANGLE, { x, y, w: 1.75, h: 1.8, fill: { color: BG_CARD }, shadow: makeShadow() });
    s4.addShape(pres.shapes.OVAL, { x: x + 0.5, y: y + 0.25, w: 0.7, h: 0.7, fill: { color: m.c, transparency: 80 } });
    s4.addImage({ data: m.icon, x: x + 0.6, y: y + 0.35, w: 0.5, h: 0.5 });
    s4.addText(m.name, { x: x + 0.05, y: y + 1.05, w: 1.65, h: 0.35, fontSize: 13, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
    s4.addText(m.desc, { x: x + 0.05, y: y + 1.35, w: 1.65, h: 0.3, fontSize: 10, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  });

  // ========== SLIDE 5: Feature Deep Dive 1 - Daily Overview ==========
  let s5 = pres.addSlide();
  s5.background = { color: BG_DARK };
  s5.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: RED } });
  s5.addImage({ data: iconChart, x: 0.5, y: 0.25, w: 0.35, h: 0.35 });
  s5.addText("每日總覽", { x: 0.95, y: 0.25, w: 4, h: 0.45, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  s5.addText("30 秒掌握今日盤面全貌", { x: 0.5, y: 0.75, w: 6, h: 0.35, fontSize: 13, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });

  // Left content
  const dailyFeatures = [
    "TAIEX 指數即時狀態與漲跌統計",
    "AI 自動族群分類（10+ 族群）",
    "今日亮點：最強族群、最大量、連板王",
    "三大法人買賣超即時動向",
    "漲停動力圖 Treemap 視覺化",
    "族群分布水平條圖 + 點擊導航",
  ];
  dailyFeatures.forEach((f, i) => {
    s5.addShape(pres.shapes.OVAL, { x: 0.6, y: 1.35 + i * 0.55, w: 0.18, h: 0.18, fill: { color: RED } });
    s5.addText(f, { x: 0.9, y: 1.3 + i * 0.55, w: 4.5, h: 0.35, fontSize: 12, fontFace: "Microsoft JhengHei", color: LIGHT, margin: 0 });
  });

  // Right mock dashboard
  s5.addShape(pres.shapes.RECTANGLE, { x: 5.8, y: 1.1, w: 3.8, h: 3.8, fill: { color: BG_CARD }, shadow: makeShadow() });
  s5.addText("TAIEX", { x: 6.0, y: 1.3, w: 1.5, h: 0.3, fontSize: 10, fontFace: "Consolas", color: GRAY, margin: 0 });
  s5.addText("33,689", { x: 6.0, y: 1.55, w: 2, h: 0.5, fontSize: 28, fontFace: "Consolas", bold: true, color: RED, margin: 0 });
  s5.addText("+0.45%", { x: 8.0, y: 1.65, w: 1, h: 0.3, fontSize: 14, fontFace: "Consolas", color: GREEN, margin: 0 });
  // Mock stats row
  const stats = [
    { l: "漲停", v: "54", c: RED },
    { l: "漲", v: "892", c: GREEN },
    { l: "跌", v: "421", c: RED },
  ];
  stats.forEach((st, i) => {
    s5.addText(st.l, { x: 6.0 + i * 1.15, y: 2.2, w: 1, h: 0.2, fontSize: 9, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });
    s5.addText(st.v, { x: 6.0 + i * 1.15, y: 2.4, w: 1, h: 0.3, fontSize: 16, fontFace: "Consolas", bold: true, color: st.c, margin: 0 });
  });
  // Mock group bars
  const groups = [
    { name: "AI伺服器/散熱", w: 3.2, c: RED },
    { name: "半導體測試", w: 2.4, c: BLUE },
    { name: "鋼鐵/鋼價", w: 2.8, c: AMBER },
    { name: "矽光子", w: 1.8, c: PURPLE },
    { name: "PCB/CCL", w: 1.5, c: GREEN },
  ];
  groups.forEach((g, i) => {
    const barY = 3.0 + i * 0.38;
    s5.addText(g.name, { x: 6.0, y: barY, w: 1.8, h: 0.3, fontSize: 8, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });
    s5.addShape(pres.shapes.RECTANGLE, { x: 7.8, y: barY + 0.05, w: g.w * 0.5, h: 0.2, fill: { color: g.c, transparency: 30 } });
  });

  // ========== SLIDE 6: Feature Deep Dive 2 - Next Day + EMA ==========
  let s6 = pres.addSlide();
  s6.background = { color: BG_DARK };
  s6.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: GREEN } });
  s6.addText("核心分析功能", { x: 0.5, y: 0.25, w: 6, h: 0.5, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  // Left: Next Day
  s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 4.3, h: 4.0, fill: { color: BG_CARD }, shadow: makeShadow() });
  s6.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 4.3, h: 0.06, fill: { color: GREEN } });
  s6.addImage({ data: iconBar, x: 0.7, y: 1.25, w: 0.3, h: 0.3 });
  s6.addText("隔日表現追蹤", { x: 1.1, y: 1.25, w: 3, h: 0.35, fontSize: 16, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  const nextDayItems = [
    "開盤 / 均價 / 收盤三種報酬率",
    "族群正報酬率排行榜",
    "5 種標籤分類（續漲停~直接跌）",
    "量比分析判斷資金動能",
    "歷史趨勢 10 日追蹤",
  ];
  nextDayItems.forEach((item, i) => {
    s6.addText([
      { text: "\u2022 ", options: { color: GREEN, fontSize: 12 } },
      { text: item, options: { color: LIGHT, fontSize: 11 } },
    ], { x: 0.8, y: 1.75 + i * 0.45, w: 3.8, h: 0.35, fontFace: "Microsoft JhengHei", margin: 0 });
  });

  // Right: EMA
  s6.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.3, h: 4.0, fill: { color: BG_CARD }, shadow: makeShadow() });
  s6.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.3, h: 0.06, fill: { color: PURPLE } });
  s6.addImage({ data: iconHorse, x: 5.4, y: 1.25, w: 0.3, h: 0.3 });
  s6.addText("快樂小馬 EMA 策略", { x: 5.8, y: 1.25, w: 3.5, h: 0.35, fontSize: 16, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  const emaItems = [
    "EMA11 vs EMA24 交叉信號",
    "黃金交叉 / 死亡交叉自動判定",
    "多頭排列 / 空頭排列識別",
    "差值欄位即時趨勢強弱",
    "每支股票 30 日迷你走勢圖",
  ];
  emaItems.forEach((item, i) => {
    s6.addText([
      { text: "\u2022 ", options: { color: PURPLE, fontSize: 12 } },
      { text: item, options: { color: LIGHT, fontSize: 11 } },
    ], { x: 5.5, y: 1.75 + i * 0.45, w: 3.8, h: 0.35, fontFace: "Microsoft JhengHei", margin: 0 });
  });

  // ========== SLIDE 7: Backtest + Screener ==========
  let s7 = pres.addSlide();
  s7.background = { color: BG_DARK };
  s7.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: CYAN } });
  s7.addText("進階工具", { x: 0.5, y: 0.25, w: 6, h: 0.5, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  // Left: Backtest
  s7.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 4.3, h: 4.0, fill: { color: BG_CARD }, shadow: makeShadow() });
  s7.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 1.0, w: 4.3, h: 0.06, fill: { color: CYAN } });
  s7.addImage({ data: iconCogs, x: 0.7, y: 1.25, w: 0.3, h: 0.3 });
  s7.addText("策略回測系統", { x: 1.1, y: 1.25, w: 3, h: 0.35, fontSize: 16, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  // Mock KPI
  const kpis = [
    { label: "總報酬", val: "+108%", c: GREEN },
    { label: "勝率", val: "80%", c: BLUE },
    { label: "回撤", val: "-10%", c: RED },
  ];
  kpis.forEach((k, i) => {
    s7.addText(k.val, { x: 0.7 + i * 1.3, y: 1.8, w: 1.2, h: 0.5, fontSize: 22, fontFace: "Consolas", bold: true, color: k.c, align: "center", margin: 0 });
    s7.addText(k.label, { x: 0.7 + i * 1.3, y: 2.25, w: 1.2, h: 0.25, fontSize: 9, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  });
  s7.addText([
    { text: "4 大策略", options: { bold: true, color: CYAN } },
    { text: ": EMA / KD / MACD / RSI", options: { color: LIGHT } },
    { text: "\n可調參數 + 權益曲線圖 + 交易紀錄", options: { color: GRAY, breakLine: true } },
    { text: "\n先回測再實戰，避免用真金白銀試錯", options: { color: GRAY, breakLine: true } },
  ], { x: 0.7, y: 2.7, w: 3.8, h: 1.5, fontSize: 11, fontFace: "Microsoft JhengHei", margin: 0 });

  // Right: Screener
  s7.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.3, h: 4.0, fill: { color: BG_CARD }, shadow: makeShadow() });
  s7.addShape(pres.shapes.RECTANGLE, { x: 5.2, y: 1.0, w: 4.3, h: 0.06, fill: { color: AMBER } });
  s7.addImage({ data: iconSearch, x: 5.4, y: 1.25, w: 0.3, h: 0.3 });
  s7.addText("進階選股系統", { x: 5.8, y: 1.25, w: 3.5, h: 0.35, fontSize: 16, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });
  const screenModes = [
    { name: "價值型", desc: "ROE、本益比、淨利", c: GREEN },
    { name: "成長型", desc: "營收連續成長、ROE趨勢", c: BLUE },
    { name: "技術面", desc: "KD、RSI、均線偏離", c: PURPLE },
    { name: "動能型", desc: "漲幅、量比、連板天數", c: RED },
  ];
  screenModes.forEach((m, i) => {
    const y = 1.85 + i * 0.65;
    s7.addShape(pres.shapes.RECTANGLE, { x: 5.5, y, w: 3.7, h: 0.5, fill: { color: BG_CARD2 } });
    s7.addShape(pres.shapes.RECTANGLE, { x: 5.5, y, w: 0.06, h: 0.5, fill: { color: m.c } });
    s7.addText(m.name, { x: 5.7, y, w: 1.2, h: 0.5, fontSize: 12, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, valign: "middle", margin: 0 });
    s7.addText(m.desc, { x: 6.9, y, w: 2.2, h: 0.5, fontSize: 10, fontFace: "Microsoft JhengHei", color: GRAY, valign: "middle", margin: 0 });
  });
  s7.addText("評分系統 1-100 分 + 一鍵快篩預設", { x: 5.5, y: 4.5, w: 3.7, h: 0.3, fontSize: 10, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });

  // ========== SLIDE 8: Competitor Comparison ==========
  let s8 = pres.addSlide();
  s8.background = { color: BG_DARK };
  s8.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: AMBER } });
  s8.addImage({ data: iconTrophy, x: 0.5, y: 0.25, w: 0.35, h: 0.35 });
  s8.addText("競品比較", { x: 0.95, y: 0.25, w: 4, h: 0.45, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  // Table
  const headers = ["功能", "Chengwaye", "嗨投資", "CMoney", "漲停雷達"];
  const headerRow = headers.map((h, i) => ({
    text: h,
    options: {
      fill: { color: i === 4 ? RED : BG_CARD2 },
      color: WHITE,
      bold: true,
      fontSize: 11,
      fontFace: "Microsoft JhengHei",
      align: "center",
      valign: "middle",
    },
  }));

  const rows = [
    ["族群分類", "3頁", "-", "-", "10頁"],
    ["隔日表現", "V", "-", "-", "V"],
    ["EMA 策略", "-", "-", "-", "V"],
    ["策略回測", "-", "-", "V", "V"],
    ["進階選股", "-", "V", "V", "V"],
    ["國際市場", "-", "-", "-", "V"],
    ["市場情資", "-", "-", "V", "V"],
    ["盤後報告", "-", "-", "V", "V"],
    ["處置預測", "基本", "-", "-", "含影響分析"],
    ["月費", "免費", "299-999", "499-1999", "799"],
  ];

  const tableData = [headerRow];
  rows.forEach((row) => {
    tableData.push(
      row.map((cell, i) => ({
        text: cell === "V" ? "\u2714" : cell === "-" ? "\u2716" : cell,
        options: {
          fill: { color: i % 2 === 0 ? BG_CARD : BG_CARD2 },
          color: cell === "V" || cell === "\u2714" ? GREEN : cell === "-" || cell === "\u2716" ? "555555" : i === 4 ? RED : LIGHT,
          fontSize: 10,
          fontFace: i === 0 ? "Microsoft JhengHei" : "Consolas",
          align: "center",
          valign: "middle",
        },
      }))
    );
  });

  s8.addTable(tableData, {
    x: 0.5, y: 1.0, w: 9, h: 4.2,
    border: { pt: 0.5, color: "333333" },
    colW: [1.8, 1.6, 1.6, 1.6, 2.4],
    rowH: Array(11).fill(0.38),
  });

  // ========== SLIDE 9: Pricing ==========
  let s9 = pres.addSlide();
  s9.background = { color: BG_DARK };
  s9.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: GREEN } });
  s9.addImage({ data: iconDollar, x: 0.5, y: 0.25, w: 0.35, h: 0.35 });
  s9.addText("訂閱方案", { x: 0.95, y: 0.25, w: 4, h: 0.45, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  const plans = [
    { name: "免費版", price: "$0", period: "/月", features: ["每日總覽（延遲1天）", "隔日表現（延遲1天）", "基本統計分析"], c: GRAY, border: "444444" },
    { name: "基本版", price: "$299", period: "/月", features: ["即時資料", "快樂小馬 EMA", "統計分析", "國際市場"], c: BLUE, border: BLUE },
    { name: "專業版", price: "$799", period: "/月", features: ["全部基本版功能", "策略回測系統", "進階選股", "盤後報告", "處置預測"], c: RED, border: RED },
    { name: "VIP", price: "$1,499", period: "/月", features: ["全部專業版功能", "LINE 即時通知", "API 存取", "優先技術支援"], c: AMBER, border: AMBER },
  ];
  plans.forEach((p, i) => {
    const x = 0.35 + i * 2.4;
    const isPopular = i === 2;
    s9.addShape(pres.shapes.RECTANGLE, { x, y: isPopular ? 0.95 : 1.1, w: 2.15, h: isPopular ? 4.3 : 4.0, fill: { color: BG_CARD }, shadow: makeShadow(), line: { color: p.border, width: isPopular ? 2 : 0.5 } });
    if (isPopular) {
      s9.addShape(pres.shapes.RECTANGLE, { x, y: 0.95, w: 2.15, h: 0.3, fill: { color: RED } });
      s9.addText("最受歡迎", { x, y: 0.95, w: 2.15, h: 0.3, fontSize: 10, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", valign: "middle", margin: 0 });
    }
    s9.addText(p.name, { x, y: isPopular ? 1.4 : 1.25, w: 2.15, h: 0.4, fontSize: 15, fontFace: "Microsoft JhengHei", bold: true, color: p.c, align: "center", margin: 0 });
    s9.addText(p.price, { x, y: isPopular ? 1.8 : 1.65, w: 2.15, h: 0.6, fontSize: 30, fontFace: "Consolas", bold: true, color: WHITE, align: "center", margin: 0 });
    s9.addText(p.period, { x: x + 1.2, y: isPopular ? 2.15 : 2.0, w: 0.8, h: 0.25, fontSize: 10, fontFace: "Microsoft JhengHei", color: GRAY, margin: 0 });
    p.features.forEach((f, j) => {
      s9.addText([
        { text: "\u2713 ", options: { color: GREEN, fontSize: 10 } },
        { text: f, options: { color: LIGHT, fontSize: 10 } },
      ], { x: x + 0.15, y: (isPopular ? 2.55 : 2.4) + j * 0.4, w: 1.9, h: 0.3, fontFace: "Microsoft JhengHei", margin: 0 });
    });
  });

  // ========== SLIDE 10: Daily Workflow ==========
  let s10 = pres.addSlide();
  s10.background = { color: BG_DARK };
  s10.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: PURPLE } });
  s10.addImage({ data: iconLight, x: 0.5, y: 0.25, w: 0.35, h: 0.35 });
  s10.addText("每日使用流程", { x: 0.95, y: 0.25, w: 5, h: 0.45, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  const workflow = [
    { time: "08:00", phase: "盤前", items: ["國際市場 - 判斷開盤方向", "市場情資 - 重大消息掃描"], c: BLUE, icon: iconGlobe },
    { time: "09:00", phase: "盤中", items: ["每日總覽 - 即時漲停動態", "族群分類 - 資金流向追蹤"], c: GREEN, icon: iconChart },
    { time: "14:00", phase: "盤後", items: ["盤後報告 - 今日總結", "隔日表現 - 驗證昨日策略", "快樂小馬 - 找明日標的"], c: AMBER, icon: iconFile },
    { time: "20:00", phase: "研究", items: ["策略回測 - 優化交易系統", "進階選股 - 挖掘潛力股", "處置預測 - 風險管理"], c: RED, icon: iconCogs },
  ];
  workflow.forEach((w, i) => {
    const x = 0.35 + i * 2.4;
    s10.addShape(pres.shapes.RECTANGLE, { x, y: 1.0, w: 2.15, h: 4.0, fill: { color: BG_CARD }, shadow: makeShadow() });
    s10.addShape(pres.shapes.RECTANGLE, { x, y: 1.0, w: 2.15, h: 0.06, fill: { color: w.c } });
    s10.addShape(pres.shapes.OVAL, { x: x + 0.7, y: 1.25, w: 0.7, h: 0.7, fill: { color: w.c, transparency: 80 } });
    s10.addImage({ data: w.icon, x: x + 0.8, y: 1.35, w: 0.5, h: 0.5 });
    s10.addText(w.time, { x, y: 2.1, w: 2.15, h: 0.35, fontSize: 18, fontFace: "Consolas", bold: true, color: w.c, align: "center", margin: 0 });
    s10.addText(w.phase, { x, y: 2.45, w: 2.15, h: 0.3, fontSize: 14, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
    w.items.forEach((item, j) => {
      s10.addText(item, { x: x + 0.15, y: 2.95 + j * 0.45, w: 1.85, h: 0.35, fontSize: 10, fontFace: "Microsoft JhengHei", color: LIGHT, margin: 0 });
    });
  });

  // ========== SLIDE 11: Revenue Model ==========
  let s11 = pres.addSlide();
  s11.background = { color: BG_DARK };
  s11.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: GREEN } });
  s11.addText("營收預測", { x: 0.5, y: 0.25, w: 5, h: 0.5, fontSize: 26, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, margin: 0 });

  // Chart
  s11.addChart(pres.charts.BAR, [
    { name: "月營收 (萬)", labels: ["100人", "300人", "500人", "1000人"], values: [8, 24, 40, 80] },
  ], {
    x: 0.5, y: 1.0, w: 5.5, h: 3.5,
    barDir: "col",
    chartColors: [RED],
    chartArea: { fill: { color: BG_CARD }, roundedCorners: true },
    catAxisLabelColor: GRAY,
    valAxisLabelColor: GRAY,
    valGridLine: { color: "333333", size: 0.5 },
    catGridLine: { style: "none" },
    showValue: true,
    dataLabelColor: WHITE,
    dataLabelPosition: "outEnd",
    showLegend: false,
    showTitle: true,
    title: "月營收 (萬 TWD)",
    titleColor: GRAY,
    titleFontSize: 10,
  });

  // Right stats
  const revenue = [
    { label: "以專業版 $799/月計算", value: "", c: GRAY },
    { label: "100 用戶", value: "月收 8 萬", c: BLUE },
    { label: "300 用戶", value: "月收 24 萬", c: GREEN },
    { label: "500 用戶", value: "月收 40 萬", c: AMBER },
    { label: "1000 用戶", value: "月收 80 萬", c: RED },
    { label: "開發成本回收", value: "60-75 人", c: CYAN },
  ];
  revenue.forEach((r, i) => {
    s11.addShape(pres.shapes.RECTANGLE, { x: 6.5, y: 1.0 + i * 0.65, w: 3.2, h: 0.5, fill: { color: BG_CARD } });
    s11.addText(r.label, { x: 6.6, y: 1.0 + i * 0.65, w: 1.8, h: 0.5, fontSize: 11, fontFace: "Microsoft JhengHei", color: LIGHT, valign: "middle", margin: 0 });
    s11.addText(r.value, { x: 8.4, y: 1.0 + i * 0.65, w: 1.2, h: 0.5, fontSize: 12, fontFace: "Consolas", bold: true, color: r.c, align: "right", valign: "middle", margin: 0 });
  });

  // Bottom: development cost
  s11.addShape(pres.shapes.RECTANGLE, { x: 0.5, y: 4.7, w: 9, h: 0.6, fill: { color: BG_CARD2 } });
  s11.addText([
    { text: "開發成本估值：", options: { color: GRAY } },
    { text: "40-60 萬 TWD", options: { bold: true, color: AMBER } },
    { text: "  |  SaaS 年收入 x5 估值（500用戶）：", options: { color: GRAY } },
    { text: "2,400 萬 TWD", options: { bold: true, color: RED } },
  ], { x: 0.7, y: 4.7, w: 8.6, h: 0.6, fontSize: 12, fontFace: "Microsoft JhengHei", valign: "middle", margin: 0 });

  // ========== SLIDE 12: CTA ==========
  let s12 = pres.addSlide();
  s12.background = { color: BG_DARK };
  s12.addShape(pres.shapes.RECTANGLE, { x: 0, y: 0, w: 10, h: 0.04, fill: { color: RED } });
  // Glow
  s12.addShape(pres.shapes.OVAL, { x: 3.5, y: 0.5, w: 3, h: 3, fill: { color: RED, transparency: 90 } });
  s12.addImage({ data: iconCrown, x: 4.5, y: 0.8, w: 1, h: 1 });
  s12.addText("開始使用漲停雷達", { x: 0.5, y: 2.0, w: 9, h: 0.8, fontSize: 36, fontFace: "Microsoft JhengHei", bold: true, color: WHITE, align: "center", margin: 0 });
  s12.addText("用數據取代直覺，用系統取代手動", { x: 0.5, y: 2.8, w: 9, h: 0.5, fontSize: 18, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });

  // CTA button
  s12.addShape(pres.shapes.RECTANGLE, { x: 3.2, y: 3.6, w: 3.6, h: 0.7, fill: { color: RED } });
  s12.addText("limit-up-radar.vercel.app", { x: 3.2, y: 3.6, w: 3.6, h: 0.7, fontSize: 16, fontFace: "Consolas", bold: true, color: WHITE, align: "center", valign: "middle", margin: 0, hyperlink: { url: "https://limit-up-radar.vercel.app" } });

  // Bottom stats
  const ctaStats = [
    { num: "10", label: "功能模組" },
    { num: "54+", label: "漲停股追蹤" },
    { num: "14", label: "國際指數" },
    { num: "$799", label: "/月起" },
  ];
  ctaStats.forEach((s, i) => {
    const x = 1.0 + i * 2.2;
    s12.addText(s.num, { x, y: 4.5, w: 1.8, h: 0.5, fontSize: 28, fontFace: "Consolas", bold: true, color: RED, align: "center", margin: 0 });
    s12.addText(s.label, { x, y: 4.95, w: 1.8, h: 0.3, fontSize: 11, fontFace: "Microsoft JhengHei", color: GRAY, align: "center", margin: 0 });
  });

  // Footer
  s12.addShape(pres.shapes.RECTANGLE, { x: 0, y: 5.2, w: 10, h: 0.425, fill: { color: BG_CARD } });
  s12.addText("Kevin Power  |  github.com/Kevin-Power/limit-up-radar  |  2026", { x: 0.5, y: 5.2, w: 9, h: 0.425, fontSize: 10, fontFace: "Consolas", color: GRAY, align: "center", valign: "middle", margin: 0 });

  // Write
  await pres.writeFile({ fileName: "C:/Users/pc/漲停族群分類/漲停雷達-Pitch-Deck.pptx" });
  console.log("Done! Created 漲停雷達-Pitch-Deck.pptx");
}

createDeck().catch(console.error);
