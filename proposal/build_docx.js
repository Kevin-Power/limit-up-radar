const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, VerticalAlign, PageNumber,
  PageBreak, ExternalHyperlink, TabStopType, TabStopPosition,
} = require("docx");

// ============================================================
// Style helpers
// ============================================================
const FONT_HEAD = "Microsoft JhengHei";
const FONT_BODY = "Microsoft JhengHei";

const C = {
  red:    "B91C1C",
  redBg:  "FEF2F2",
  amber:  "B45309",
  green:  "047857",
  text:   "0F172A",
  muted:  "475569",
  dim:    "94A3B8",
  border: "CBD5E1",
  bgGray: "F1F5F9",
  bgDark: "1E293B",
  white:  "FFFFFF",
};

// Border helpers
const tBorder = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const cellBorders = { top: tBorder, bottom: tBorder, left: tBorder, right: tBorder };
const cellMargins = { top: 100, bottom: 100, left: 140, right: 140 };

// Page width: US Letter 12240 - 2880 (1" margins) = 9360 DXA
const CONTENT_W = 9360;

// ============================================================
// Reusable builders
// ============================================================
function P(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 100, line: opts.line ?? 320 },
    indent: opts.indent,
    children: [
      new TextRun({
        text,
        font: opts.font ?? FONT_BODY,
        size: opts.size ?? 22, // 11pt
        bold: opts.bold,
        italic: opts.italic,
        color: opts.color ?? C.text,
      }),
    ],
  });
}

function Bullet(text) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { after: 80, line: 320 },
    children: [new TextRun({ text, font: FONT_BODY, size: 22, color: C.text })],
  });
}

function H1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT_HEAD, size: 36, bold: true, color: C.text })],
  });
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 140 },
    children: [new TextRun({ text, font: FONT_HEAD, size: 28, bold: true, color: C.red })],
  });
}

function HR() {
  return new Paragraph({
    spacing: { before: 60, after: 120 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.border, space: 1 } },
    children: [new TextRun({ text: "" })],
  });
}

function PageBreakP() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Spacing-only paragraph (vertical gap between blocks)
function Gap(after = 120) {
  return new Paragraph({ spacing: { after }, children: [new TextRun({ text: "" })] });
}

// Stat callout box (one big number + label) — implemented as 1-row table cell
function StatBox(value, label, color = C.red) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [CONTENT_W],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_W, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: C.bgGray, type: ShadingType.CLEAR },
            margins: { top: 240, bottom: 240, left: 240, right: 240 },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 100 },
                children: [new TextRun({ text: value, font: FONT_HEAD, size: 96, bold: true, color })],
              }),
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: label, font: FONT_BODY, size: 22, color: C.muted })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// 3-column stat row
function StatRow(items, color = C.red) {
  const colW = Math.floor(CONTENT_W / items.length);
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: items.map(() => colW),
    rows: [
      new TableRow({
        children: items.map((it) => new TableCell({
          width: { size: colW, type: WidthType.DXA },
          borders: cellBorders,
          shading: { fill: C.bgGray, type: ShadingType.CLEAR },
          margins: { top: 200, bottom: 200, left: 160, right: 160 },
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { after: 80 },
              children: [new TextRun({ text: it.value, font: FONT_HEAD, size: 48, bold: true, color: it.color || color })],
            }),
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: it.label, font: FONT_BODY, size: 18, color: C.muted })],
            }),
          ],
        })),
      }),
    ],
  });
}

// Table builder
function Tbl(headers, rows, colWeights) {
  const totalWeight = colWeights.reduce((a, b) => a + b, 0);
  const colWidths = colWeights.map((w) => Math.floor((w / totalWeight) * CONTENT_W));
  // Adjust last to make sum exact
  colWidths[colWidths.length - 1] = CONTENT_W - colWidths.slice(0, -1).reduce((a, b) => a + b, 0);

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      // Header
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          width: { size: colWidths[i], type: WidthType.DXA },
          borders: cellBorders,
          shading: { fill: C.bgDark, type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: h, font: FONT_HEAD, size: 20, bold: true, color: C.white })],
          })],
        })),
      }),
      // Body
      ...rows.map((r, ri) => new TableRow({
        children: r.map((cell, ci) => new TableCell({
          width: { size: colWidths[ci], type: WidthType.DXA },
          borders: cellBorders,
          shading: { fill: ri % 2 === 0 ? C.white : C.bgGray, type: ShadingType.CLEAR },
          margins: cellMargins,
          children: [new Paragraph({
            alignment: typeof cell === "object" && cell.align ? cell.align : (ci === 0 ? AlignmentType.LEFT : AlignmentType.CENTER),
            children: [new TextRun({
              text: typeof cell === "object" ? cell.text : cell,
              font: FONT_BODY,
              size: typeof cell === "object" && cell.size ? cell.size : 20,
              bold: typeof cell === "object" && cell.bold,
              color: typeof cell === "object" && cell.color ? cell.color : C.text,
            })],
          })],
        })),
      })),
    ],
  });
}

// Highlight callout box (left red bar + white bg + text)
function Callout(title, body, color = C.red) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [60, CONTENT_W - 60],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 60, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: color, type: ShadingType.CLEAR },
            children: [new Paragraph({ children: [new TextRun({ text: "" })] })],
          }),
          new TableCell({
            width: { size: CONTENT_W - 60, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: C.redBg, type: ShadingType.CLEAR },
            margins: { top: 160, bottom: 160, left: 200, right: 200 },
            children: [
              new Paragraph({
                spacing: { after: 80 },
                children: [new TextRun({ text: title, font: FONT_HEAD, size: 22, bold: true, color: C.text })],
              }),
              new Paragraph({
                children: [new TextRun({ text: body, font: FONT_BODY, size: 20, color: C.muted })],
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

// ============================================================
// Build document
// ============================================================
const children = [];

// === COVER ===
children.push(
  new Paragraph({ spacing: { before: 1800 }, children: [new TextRun({ text: "" })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 400 },
    children: [new TextRun({ text: "// 股文觀指 大師專區", font: FONT_HEAD, size: 28, bold: true, color: C.red })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "台股漲停族群操作平台", font: FONT_HEAD, size: 56, bold: true, color: C.text })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: "商業提案書", font: FONT_HEAD, size: 32, color: C.muted })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "資料驅動 · 真實回測 · 公開透明", font: FONT_BODY, size: 24, italic: true, color: C.muted })],
  }),
  new Paragraph({ spacing: { before: 1200 }, children: [new TextRun({ text: "" })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 100 },
    children: [new TextRun({ text: "limit-up-radar.vercel.app", font: FONT_HEAD, size: 22, bold: true, color: C.red })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({ text: "2026 年 5 月", font: FONT_BODY, size: 20, color: C.muted })],
  }),
  PageBreakP(),
);

// === 1. 執行摘要 ===
children.push(
  H1("1. 執行摘要"),
  P("「股文觀指 大師專區」（limit-up-radar.vercel.app）是一個聚焦台股漲停股的資訊平台。每日 17:00 由 GitHub Actions 自動抓取 TWSE 與 TPEx 公開資料，經過三層健全性驗證後才上線，目前涵蓋 16 個功能頁面、33 個交易日的歷史資料、1,934 檔上市櫃公司月營收。"),
  P("平台最重要的差異化在於提供「可驗證的回測結果」：以 TWSE 真實隔日 OHLC 計算，10 天 99 樣本（樣本加權，非日均）的隔日開盤勝率達 79%（78/99），平均開盤報酬 +3.25%。所有計算方法、原始資料與程式碼皆公開透明。"),
  P("商業模式採三階段設計：免費平台獲客 → LINE 群月費（NT$ 299-599）→ 教學課程（NT$ 3,000-5,000）。目前營運成本為 NT$ 0（Vercel 免費方案 + GitHub Actions + 公開 API）。"),
  Gap(120),
  Callout(
    "核心回測結果（TWSE 真實 OHLC，無估計值）",
    "10 天 99 樣本回測：隔日開盤勝率 79%（78/99），平均開盤報酬 +3.25%。"
  ),
  PageBreakP(),
);

// === 2. 痛點分析 ===
children.push(
  H1("2. 散戶在漲停股操作的痛點"),
  H2("2.1 資訊分散在多個來源"),
  P("漲停股相關資訊散佈在交易所網站、券商 App、財經新聞網與社群討論中。散戶要自己手動把當日漲停股、所屬族群、連板天數、成交量、三大法人買賣超與月營收成長拼湊起來，再做交叉判斷。這個整理工作每天約需 30-60 分鐘，且容易遺漏。"),
  H2("2.2 隔日表現缺乏可驗證資料"),
  P("市面工具多半告訴你「今天誰漲停」，但散戶真正困難的是「要不要追？追完隔天會怎樣？」。沒有平台系統性地把每檔漲停股的隔日真實開盤、收盤表現整理出來，導致操作判斷只能依賴模糊印象與群眾意見。"),
  H2("2.3 操作判斷仰賴片段經驗"),
  P("缺乏可量化的勝率與平均開盤報酬，買賣決策容易受情緒、社群氛圍與單次經驗主導。沒有可驗證的歷史數據，就難以建立穩定的進出場紀律。"),
  PageBreakP(),
);

// === 3. 解決方案 ===
children.push(
  H1("3. 解決方案"),
  P("股文觀指將漲停股資訊集中在一個平台，從原始資料抓取到使用者介面，整條資料管線都自動化，並在三層健全性驗證通過後才公開展示。"),
  H2("3.1 自動化資料管線"),
  Bullet("資料來源：TWSE 公開 API、TPEx 公開 API、永豐金 Sinopac 月營收"),
  Bullet("更新頻率：每日 17:00 由 GitHub Actions 自動執行"),
  Bullet("三層驗證：TAIEX 區間檢查、漲跌幅合理性、樣本數驗證，未通過則拒絕部署"),
  Bullet("部署：通過驗證後自動推送至 Vercel，使用者即時看到最新資料"),
  H2("3.2 設計原則"),
  Bullet("公開透明：所有計算方法、原始資料來源、程式碼皆可驗證"),
  Bullet("誠實揭露：明確說明樣本大小、回測區間、計算方式（樣本加權）"),
  Bullet("不做明牌：提供整理工具與評分系統，最終決策權仍在使用者"),
  PageBreakP(),
);

// === 4. 產品功能總覽 ===
children.push(
  H1("4. 核心功能總覽"),
  P("平台共 16 個功能頁面，以下為對使用者價值最高的 5 個核心功能。"),
  Gap(80),
  Tbl(
    ["#", "功能名稱", "用途", "資料來源"],
    [
      ["01", { text: "明日焦點", bold: true, color: C.red }, "AI 篩選次日值得追蹤標的，附進出場參考區間", "綜合 5 種訊號"],
      ["02", { text: "隔日表現", bold: true, color: C.red }, "個股漲停後實際隔日表現追蹤", "TWSE/TPEx OHLC"],
      ["03", { text: "營收速報", bold: true, color: C.red }, "1,934 檔月營收與 YoY 成長率", "Sinopac 永豐金"],
      ["04", { text: "處置預測", bold: true, color: C.red }, "預測高波動處置風險", "交易所規則"],
      ["05", { text: "交易教室", bold: true, color: C.red }, "6 堂結構化教學課程", "平台原創"],
    ],
    [1, 3, 7, 4]
  ),
  Gap(160),
  H2("評分演算法（最高 100+ 分）"),
  P("明日焦點的綜合評分結合 6 項訊號："),
  Bullet("趨勢族群（連續 2-3 天出現）：+30 分"),
  Bullet("營收 YoY > 20%：+25 分（YoY > 50% 再加 +10 分）"),
  Bullet("法人買超（三大法人合計買超）：+20 分"),
  Bullet("連板（連續漲停 ≥ 2 天）：+15 分"),
  Bullet("族群龍頭（族群中成交量最大）：+10 分"),
  Bullet("大量（成交量 > 5,000 張）：+5 分"),
  PageBreakP(),
);

// === 5. 回測結果 ===
children.push(
  H1("5. 回測結果"),
  P("以下數據基於 10 個交易日、99 個實際樣本，由腳本「scripts/run_backtest.py」執行：對每個歷史「明日焦點」標的，向 TWSE/TPEx 抓取真實隔日 OHLC，計算「（隔日開盤 − 漲停日收盤）÷ 漲停日收盤」與「（隔日收盤 − 漲停日收盤）÷ 漲停日收盤」。所有數字為樣本加權平均，不含任何估算值。"),
  Gap(160),
  StatBox("79%", "隔日開盤勝率（78 / 99）"),
  Gap(200),
  StatRow([
    { value: "+3.25%", label: "平均開盤報酬", color: C.red },
    { value: "65%", label: "隔日收盤勝率", color: C.amber },
    { value: "+3.27%", label: "平均收盤報酬", color: C.green },
  ]),
  Gap(240),
  H2("5.1 完整 10 天回測明細"),
  Tbl(
    ["選股日", "驗證日", "樣本", "開盤勝率", "開盤報酬", "收盤勝率", "收盤報酬"],
    [
      ["2026-04-23", "2026-04-24", "7", "86%", "+3.88%", "71%", "+5.44%"],
      ["2026-04-24", "2026-04-27", "13", "92%", "+4.68%", "38%", "+0.12%"],
      ["2026-04-27", "2026-04-28", "10", "70%", "+2.76%", "80%", "+5.11%"],
      ["2026-04-28", "2026-04-29", "11", "55%", "+0.62%", "64%", "+1.87%"],
      ["2026-04-29", "2026-04-30", "9", "67%", "+2.54%", "78%", "+5.02%"],
      ["2026-04-30", "2026-05-04", "12", "100%", "+5.39%", "75%", "+5.36%"],
      ["2026-05-04", "2026-05-05", "10", "80%", "+2.52%", "90%", "+6.56%"],
      ["2026-05-05", "2026-05-06", "7", "86%", "+5.17%", "43%", "+0.50%"],
      ["2026-05-06", "2026-05-07", "11", "91%", "+3.89%", "64%", "+3.32%"],
      ["2026-05-07", "2026-05-08", "9", "56%", "+0.86%", "44%", "−0.27%"],
    ],
    [3, 3, 2, 3, 3, 3, 3]
  ),
  Gap(160),
  Callout(
    "誠實揭露",
    "99 樣本 / 10 天屬於小樣本，未涵蓋多空頭循環。在不同市場狀況（如連跌段、低成交量段）下，績效會有顯著差異。過去績效不代表未來。",
    C.amber
  ),
  PageBreakP(),
);

// === 6. 競爭分析 ===
children.push(
  H1("6. 競爭分析"),
  P("台股相關工具的市場已有大型玩家，本節誠實列出競品強項與本平台的差異化定位。"),
  Gap(120),
  Tbl(
    ["項目", "CMoney", "Goodinfo", "券商 App", "股文觀指"],
    [
      ["品牌與流量", "強", "強", "強", { text: "弱（早期）", color: C.muted }],
      ["漲停股清單", "✓", "✓", "✓", { text: "✓", color: C.red, bold: true }],
      ["族群自動分類", "部分", "△", "✗", { text: "✓ AI", color: C.red, bold: true }],
      ["隔日真實 OHLC 回測", "✗", "✗", "✗", { text: "✓ 99 樣本", color: C.red, bold: true }],
      ["月營收交叉分析", "△", "✓", "△", { text: "✓ 1,934 檔", color: C.red, bold: true }],
      ["進出場參考區間", "部分", "✗", "部分", { text: "✓", color: C.red, bold: true }],
      ["公開計算方法", "✗", "✗", "✗", { text: "✓ GitHub", color: C.red, bold: true }],
    ],
    [3, 2, 2, 2, 3]
  ),
  Gap(160),
  H2("6.1 差異化定位"),
  P("本平台不嘗試取代大型平台的全方位資訊服務，而是在「漲停股隔日追蹤」這個明確場景中做最深、最透明。具體差異："),
  Bullet("主打公開揭露樣本加權回測結果（79% / 99 樣本）"),
  Bullet("將「明日焦點精選 + 進出場參考區間 + 隔日真實 OHLC」串成完整工作流程"),
  Bullet("公開計算方法、評分權重與所有原始資料來源（GitHub 開源）"),
  PageBreakP(),
);

// === 7. 商業模式 ===
children.push(
  H1("7. 商業模式"),
  P("採三階段漸進式設計，從免費平台逐步建立信任，再導入付費服務。"),
  Gap(120),
  Tbl(
    ["階段", "時間", "形式", "定價", "目標"],
    [
      [{ text: "Stage 1", bold: true, color: C.red }, "M1-M3", "免費平台", "NT$ 0", "獲客、SEO、口碑"],
      [{ text: "Stage 2", bold: true, color: C.amber }, "M3-M6", "LINE 群月費", "NT$ 299-599 / 月", "建立穩定收入"],
      [{ text: "Stage 3", bold: true, color: C.green }, "M6+", "教學課程", "NT$ 3,000-5,000 / 期", "深化用戶價值"],
    ],
    [2, 2, 3, 3, 3]
  ),
  Gap(160),
  H2("7.1 LINE 群月費內容"),
  Bullet("每日 18:00 推送精選追蹤標的（與平台同步）"),
  Bullet("觀察名單客製化提醒（個股突破、處置警示）"),
  Bullet("操作紀律提醒（停損、停利、不追高）"),
  Bullet("會員問答互動"),
  H2("7.2 教學課程內容"),
  P("以平台 6 堂免費課程為基礎，擴展為更完整的方法論教學，包含實戰演練、案例討論、操作日誌建立。承接已熟悉平台、需要深度方法的進階使用者。"),
  PageBreakP(),
);

// === 8. 財務預測 ===
children.push(
  H1("8. 財務預測"),
  P("以下為保守情境推估，僅以「月費 × 付費人數」計算，不假設課程加購、不假設轉換率提升、不含廣告與其他收入。"),
  Gap(160),
  Tbl(
    ["情境", "付費用戶", "月費 NT$ 299", "月費 NT$ 599", "年度收入區間"],
    [
      [{ text: "保守", bold: true }, "100 人", "NT$ 29,900", "NT$ 59,900", "NT$ 358K - 718K"],
      [{ text: "穩健", bold: true, color: C.amber }, "500 人", "NT$ 149,500", "NT$ 299,500", "NT$ 1.79M - 3.59M"],
      [{ text: "成熟", bold: true, color: C.red }, "2,000 人", "NT$ 598,000", "NT$ 1,198,000", "NT$ 7.18M - 14.38M"],
    ],
    [2, 2, 3, 3, 4]
  ),
  Gap(160),
  H2("8.1 成本結構"),
  Tbl(
    ["項目", "目前成本", "擴張後成本（500 人）"],
    [
      ["Vercel 部署", "NT$ 0（免費方案）", "NT$ 0-600 / 月（Pro 方案視流量）"],
      ["GitHub Actions", "NT$ 0", "NT$ 0"],
      ["TWSE / TPEx API", "NT$ 0", "NT$ 0"],
      ["LINE 官方帳號", "NT$ 0", "NT$ 1,000-2,000 / 月（依推播量）"],
      ["合計", { text: "NT$ 0", bold: true, color: C.green }, { text: "NT$ 1,000-2,600 / 月", bold: true, color: C.muted }],
    ],
    [4, 3, 4]
  ),
  Gap(160),
  H2("8.2 毛利率預估"),
  P("由於營運成本極低，500 人付費規模下毛利率預期可達 95% 以上。主要瓶頸不在成本，而在獲客效率與留存率。"),
  PageBreakP(),
);

// === 9. 行銷策略 ===
children.push(
  H1("9. 行銷策略"),
  P("初期不依賴廣告投放，採「內容 → 信任 → 轉換」三層漏斗，以時間累積建立有機流量與口碑。"),
  H2("9.1 上層：SEO 內容"),
  Bullet("經營「漲停股 隔日表現」「台股 月營收 YoY」「處置預測」等長尾關鍵字"),
  Bullet("每日自動更新的資料頁面，本身就是 SEO 內容"),
  Bullet("整理 6 堂教學課程作為內容核心，建立權威性"),
  H2("9.2 中層：真實數據揭露"),
  Bullet("公開 79% 勝率、99 樣本回測，建立可驗證的差異化"),
  Bullet("開源評分演算法與計算方法，建立技術專業形象"),
  Bullet("每月發布回測月報，記錄實際操作績效"),
  H2("9.3 下層：LINE 群轉換"),
  Bullet("免費 LINE 群作為高互動社群，每日推送平台精選"),
  Bullet("使用者實際看到價值後，自然轉成月費會員"),
  Bullet("月費會員到一定程度後再導購進階課程"),
  PageBreakP(),
);

// === 10. 6 個月路線圖 ===
children.push(
  H1("10. 6 個月路線圖"),
  Gap(120),
  Tbl(
    ["月份", "階段", "重點工作", "可量測指標"],
    [
      [{ text: "M1-M2", bold: true, color: C.red }, "穩定基礎", "資料更新穩定度提升、回測樣本擴充至 200+、強化健全性驗證", "驗證通過率目標 99% / 樣本 200+"],
      [{ text: "M3-M4", bold: true, color: C.amber }, "付費測試", "LINE 群開放招募、首批 50 人付費內測、收集用戶實際操作回饋", "付費用戶 50 / 月留存 70%+"],
      [{ text: "M5-M6", bold: true, color: C.green }, "課程上架", "6 堂課程內容定稿、上架 Hahow 或 Teachable、建立會員留存機制", "課程銷售 30+ 期 / 月收入 NT$ 100K+"],
    ],
    [1, 2, 6, 3]
  ),
  PageBreakP(),
);

// === 11. 風險聲明 ===
children.push(
  H1("11. 風險聲明"),
  P("本平台相信「信任建立在不掩蓋限制之上」，以下風險公開揭露："),
  Gap(120),
  Tbl(
    ["風險類別", "說明"],
    [
      [{ text: "樣本短", bold: true, color: C.amber }, "目前回測僅 99 筆 / 10 天，未涵蓋多空頭循環。績效在不同市況下會有顯著差異。"],
      [{ text: "個人開發", bold: true, color: C.amber }, "尚無團隊、客服、客戶服務窗口。系統故障時的恢復時間取決於開發者個人時間。"],
      [{ text: "無金融牌照", bold: true, color: C.amber }, "本平台不是金融顧問業者。所有內容僅供參考，不構成任何投資建議或保證。"],
      [{ text: "資料延遲", bold: true, color: C.amber }, "每日資料於收盤後約 2.5 小時更新。盤中即時資訊請以券商即時報價為準。"],
      [{ text: "市場風險", bold: true, color: C.red }, "投資有風險。漲停股操作為高波動策略，可能造成本金虧損。請在自身可承受範圍內操作。"],
    ],
    [2, 8]
  ),
  Gap(200),
  Callout(
    "投資警語",
    "本平台所有資訊僅供參考，不構成投資建議、招攬或要約。投資人應自行評估投資風險，自行承擔投資損益。過去績效不代表未來表現。",
    C.amber
  ),
  PageBreakP(),
);

// === 12. 行動呼籲 ===
children.push(
  H1("12. 行動呼籲"),
  P("此份提案的目的是邀請以下三類對象參與："),
  H2("12.1 早期付費使用者"),
  P("正在尋找台股操作工具的散戶或半專業投資人。可立即至 limit-up-radar.vercel.app 體驗完整平台，並加入早期付費 LINE 群（首批 50 名）。"),
  H2("12.2 投資人 / 合作夥伴"),
  P("適合做小規模商業化驗證的天使投資人或內容夥伴。本專案資料管線已完整、產品已成型、初步真實績效已驗證，需要的是擴大用戶基數與行銷資源的合作。"),
  H2("12.3 內容合作"),
  P("財經 KOL、教學講師、券商通路。可洽談平台資料引用、聯合課程、會員導購等合作方式。"),
  Gap(240),
  Callout(
    "聯絡方式",
    "平台網址：limit-up-radar.vercel.app　　　專案 GitHub：github.com/Kevin-Power/limit-up-radar",
    C.red
  ),
);

// ============================================================
// Build & Save
// ============================================================
const doc = new Document({
  creator: "股文觀指 大師專區",
  title: "股文觀指 商業提案書",
  styles: {
    default: {
      document: { run: { font: FONT_BODY, size: 22 } },
    },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: FONT_HEAD, color: C.text },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: FONT_HEAD, color: C.red },
        paragraph: { spacing: { before: 280, after: 140 }, outlineLevel: 1 },
      },
    ],
  },
  numbering: {
    config: [{
      reference: "bullets",
      levels: [{
        level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720, hanging: 360 } } },
      }],
    }],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 }, // US Letter
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1"
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "股文觀指 大師專區 · 商業提案書",
            font: FONT_BODY, size: 16, color: C.dim,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "limit-up-radar.vercel.app　·　第 ", font: FONT_BODY, size: 16, color: C.dim }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT_BODY, size: 16, color: C.dim }),
            new TextRun({ text: " 頁", font: FONT_BODY, size: 16, color: C.dim }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("股文觀指_商業提案書.docx", buf);
  console.log("Saved: 股文觀指_商業提案書.docx (" + buf.length + " bytes)");
}).catch((e) => { console.error(e); process.exit(1); });
