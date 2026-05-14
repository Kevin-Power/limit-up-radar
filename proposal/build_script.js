// 產出「股文觀指 商業簡報講稿」DOCX
// 對應 16 張投影片的逐張講稿，含時間提示、轉場句、強調語氣標記
const fs = require("fs");
const path = require("path");
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, LevelFormat, HeadingLevel,
  BorderStyle, WidthType, ShadingType, PageNumber, PageBreak,
} = require("docx");

// === Load latest backtest numbers ===
const BT = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "backtest.json"), "utf-8"));
const WIN = BT.avgOpenWinRate;
const HITS = BT.totalOpenWins;
const SAMPLES = BT.totalSamples;
const RETURN = BT.avgOpenReturn;
const DAYS = BT.totalDays;

const FONT = "Microsoft JhengHei";
const C = {
  red:    "B91C1C",
  redBg:  "FEF2F2",
  amber:  "B45309",
  amberBg:"FEF3C7",
  green:  "047857",
  text:   "0F172A",
  muted:  "475569",
  dim:    "94A3B8",
  border: "CBD5E1",
  bgGray: "F1F5F9",
  bgDark: "1E293B",
  white:  "FFFFFF",
};

const tBorder = { style: BorderStyle.SINGLE, size: 4, color: C.border };
const cellBorders = { top: tBorder, bottom: tBorder, left: tBorder, right: tBorder };
const CONTENT_W = 9360;

// ---------- helpers ----------
function P(text, opts = {}) {
  return new Paragraph({
    alignment: opts.align,
    spacing: { before: opts.before ?? 0, after: opts.after ?? 100, line: opts.line ?? 320 },
    children: [new TextRun({
      text, font: FONT,
      size: opts.size ?? 22, bold: opts.bold, italic: opts.italic,
      color: opts.color ?? C.text,
    })],
  });
}

function PBreak() {
  return new Paragraph({ children: [new PageBreak()] });
}

// Slide header card: number + title + estimated time
function SlideHeader(num, title, time) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [800, 6560, 2000],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 800, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: C.red, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: num, font: FONT, size: 28, bold: true, color: C.white })],
            })],
          }),
          new TableCell({
            width: { size: 6560, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: C.bgDark, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 200, right: 100 },
            children: [new Paragraph({
              children: [new TextRun({ text: title, font: FONT, size: 24, bold: true, color: C.white })],
            })],
          }),
          new TableCell({
            width: { size: 2000, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: C.amber, type: ShadingType.CLEAR },
            margins: { top: 120, bottom: 120, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: `⏱ ${time}`, font: FONT, size: 20, bold: true, color: C.white })],
            })],
          }),
        ],
      }),
    ],
  });
}

// Speaker callout: a labeled box (key point / pause / emphasis)
function Cue(label, text, color = C.amber) {
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: [1400, CONTENT_W - 1400],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 1400, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: color, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 100, right: 100 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: label, font: FONT, size: 18, bold: true, color: C.white })],
            })],
          }),
          new TableCell({
            width: { size: CONTENT_W - 1400, type: WidthType.DXA },
            borders: cellBorders,
            shading: { fill: color === C.red ? C.redBg : C.amberBg, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 160, right: 160 },
            children: [new Paragraph({
              children: [new TextRun({ text, font: FONT, size: 20, color: C.text })],
            })],
          }),
        ],
      }),
    ],
  });
}

// Visual cue label
function VisualNote(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [
      new TextRun({ text: "🎯 視覺提示｜", font: FONT, size: 18, bold: true, color: C.muted }),
      new TextRun({ text, font: FONT, size: 18, color: C.muted, italic: true }),
    ],
  });
}

// Body script
function Script(text) {
  return new Paragraph({
    spacing: { before: 100, after: 200, line: 380 },
    children: [new TextRun({ text, font: FONT, size: 24, color: C.text })],
  });
}

function H1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 360, after: 200 },
    children: [new TextRun({ text, font: FONT, size: 36, bold: true, color: C.text })],
  });
}

function H2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 140 },
    children: [new TextRun({ text, font: FONT, size: 26, bold: true, color: C.red })],
  });
}

// ============================================================
// Build content
// ============================================================
const children = [];

// === Cover ===
children.push(
  new Paragraph({ spacing: { before: 1800 }, children: [new TextRun({ text: "" })] }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 300 },
    children: [new TextRun({ text: "// 股文觀指 大師專區", font: FONT, size: 28, bold: true, color: C.red })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "商業簡報講稿", font: FONT, size: 56, bold: true, color: C.text })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 600 },
    children: [new TextRun({ text: "16 張投影片 · 約 12 分鐘", font: FONT, size: 24, color: C.muted })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { after: 200 },
    children: [new TextRun({ text: "搭配「股文觀指_商業簡報.pptx」使用", font: FONT, size: 22, italic: true, color: C.muted })],
  }),
  PBreak(),
);

// === 講前須知 ===
children.push(
  H1("講前須知"),
  H2("時間配比"),
  P(`總長約 12 分鐘。封面 30 秒、痛點與平台介紹 2 分鐘、5 大功能各 45 秒（共 4 分鐘）、${WIN}% 勝率 hero 1 分鐘、競爭定位 1 分鐘、商業模式與財務 1.5 分鐘、行銷與路線圖 1.5 分鐘、風險與 CTA 30 秒。`),
  H2("語氣原則"),
  P("1. 不講「保證」「一定」「絕對」。講「目前數據顯示」「在這 99 個樣本中」。"),
  P(`2. 數字要說全：不只說「${WIN}%」，要說「${DAYS} 天 ${SAMPLES} 個樣本」。`),
  P("3. 競品要尊重：不貶低 CMoney 或 Goodinfo，他們有他們的優勢，我們是聚焦不同場景。"),
  P("4. 風險要主動講：不要讓對方問你才提，自己先說反而建立信任。"),
  H2("應對問題的口袋句"),
  P(`Q「樣本太少？」→ 是的，目前只有 ${SAMPLES} 筆，這也是為什麼我們公開所有計算方法。樣本會持續累積，每天都在增加。`),
  P(`Q「市場跌的時候呢？」→ ${SAMPLES} 樣本裡涵蓋的是相對偏多頭的 ${DAYS} 天，這是限制。我們會在風險聲明裡明確揭露。`),
  P("Q「跟其他平台差在哪？」→ 我們不嘗試做大而全，只在「漲停股隔日追蹤」這個場景做最深，並且用真實 OHLC 公開回測。"),
  P("Q「這算投資建議嗎？」→ 不是。我們提供的是「資訊整理工具」與「歷史回測結果」，最終決策權在使用者。所有頁面都有不構成投資建議的聲明。"),
  PBreak(),
);

// ============================================================
// SLIDE-BY-SLIDE SCRIPT
// ============================================================
const slides = [
  {
    n: "01", title: `封面 · ${WIN}% 勝率 + URL`, time: "30 秒",
    visual: `PPT 顯示巨大的「股文觀指 大師專區」品牌名，下方 ${WIN}% 紅色大字。`,
    script: `大家好。今天要介紹的是「股文觀指 大師專區」——一個聚焦台股漲停股的資訊平台。在開始講細節之前，先看一個數字。我們用 TWSE 真實隔日 OHLC、${SAMPLES} 個樣本、${DAYS} 個交易日、樣本加權平均做出來的隔日開盤勝率是 ${WIN}%。這個數字後面我會仔細解釋是怎麼算出來的，現在請先記住這個 ${WIN}%。`,
    cue: { label: "停頓", text: `說完 ${WIN}% 後停 2 秒，讓對方記住數字再繼續。` },
    transition: "那為什麼我們會做這個平台？因為散戶在漲停股操作時，遇到三個一直無解的痛點。",
  },
  {
    n: "02", title: "散戶三大痛點", time: "45 秒",
    visual: "三張並排卡片，01 資訊分散、02 隔日表現難驗證、03 操作仰賴片段經驗。",
    script: "第一個痛點：資訊散在各處。漲停股清單在交易所、族群分類在財經網、籌碼在券商 App、營收在第四個地方——散戶要每天花 30-60 分鐘自己拼湊。第二個痛點：市場只討論「今天誰漲停」，但真正困難的是「明天會怎樣」，沒有平台系統性追蹤。第三個痛點：缺乏可量化的勝率與報酬，買賣判斷只能靠模糊印象。",
    cue: { label: "節奏", text: "三個痛點各約 12-15 秒，不要講太快，每點之間用「第二個痛點」「第三個痛點」清楚切開。" },
    transition: "我們做的事情，就是把這三個痛點解掉。",
  },
  {
    n: "03", title: "平台一覽 · 自動化資料管線", time: "45 秒",
    visual: "4 步驟流程圖：TWSE/TPEx → GitHub Actions → 三層驗證 → Vercel 部署。下方四個關鍵數字。",
    script: "整個平台的核心是這條自動化資料管線。每天 17:00，GitHub Actions 自動抓取 TWSE 與 TPEx 的公開資料，經過三層健全性驗證——驗證 TAIEX 數值合理、漲跌幅在範圍內、樣本數正常——通過之後才自動部署到 Vercel。重點是：如果驗證失敗，今天的資料不會上線，使用者不會看到錯的東西。目前累積了 33 個交易日資料、1934 檔月營收、16 個功能頁面，營運成本是零。",
    cue: { label: "強調", text: "「驗證失敗就不上線」這句要慢，這是專業工程師才會做的事，是我們和粗糙資訊網站的差別。" },
    transition: "接下來介紹平台最核心的 5 個功能。",
  },
  {
    n: "04", title: "功能 01 · 明日焦點", time: "40 秒",
    visual: "明日焦點頁面截圖，標籤顯示「今日精選 47 檔」。",
    script: "明日焦點，是平台最重要的功能。我們有一個綜合評分系統，最高 100 多分，結合六個訊號：趨勢族群、營收成長、法人買超、連板、龍頭、大量。每天收盤後自動跑這個演算法，篩出評分 60 分以上的標的，附上進場、停損、目標的參考區間。請注意：是參考區間，不是建議價位。最終決策還是在使用者。",
    cue: { label: "合規", text: "「不是建議價位」要清楚說。這句保護你也保護平台。" },
    transition: "選了標的之後，要怎麼知道準不準？看下一頁。",
  },
  {
    n: "05", title: "功能 02 · 隔日表現", time: "40 秒",
    visual: "隔日表現頁面，每檔股票顯示開盤漲跌、收盤漲跌。",
    script: "隔日表現是平台的差異化核心。我們對每一檔當日漲停的股票，去 TWSE 抓真實的隔日 OHLC，計算「隔日開盤相對漲停日收盤的漲跌幅」、「隔日收盤的漲跌幅」。最佳案例、最差案例、平均勝率全部攤開來看。重點是這些都是真實成交價，不是估算、不是模擬。",
    cue: { label: "對比", text: "可以順口提一句：別的平台只告訴你今天漲停，沒人告訴你昨天漲停的今天怎麼樣。" },
    transition: "技術面之外，我們也整合基本面。",
  },
  {
    n: "06", title: "功能 03 · 營收速報", time: "35 秒",
    visual: "營收速報頁面，顯示 1934 檔股票的 YoY 排序。",
    script: "營收資料來自永豐金 Sinopac，覆蓋 1,934 檔上市櫃公司。我們把月營收 YoY 成長率納入評分系統——YoY 超過 20% 加 25 分、超過 50% 再加 10 分。這讓我們不只看技術面的爆量，也能找到有基本面支撐的個股。技術面加基本面雙重驗證，比單純追技術面安全很多。",
    transition: "但漲停股有風險，特別是處置股的風險。",
  },
  {
    n: "07", title: "功能 04 · 處置預測", time: "30 秒",
    visual: "處置預測頁面，顯示風險警示。",
    script: "處置股是漲停股操作最大的隱形風險。一檔股票被處置後，預收款、限制交易，流動性會大幅下降。我們依交易所規則預測哪些強勢股下一步可能被處置。注意我們講的是「規則型風險」，不是黑天鵝，黑天鵝沒人能預測。",
    cue: { label: "誠實", text: "「不是黑天鵝」這句很重要。誇大「我們能避開所有風險」會讓專業人士覺得不可信。" },
    transition: "工具給了，但使用者還需要學會怎麼用。",
  },
  {
    n: "08", title: "功能 05 · 交易教室", time: "30 秒",
    visual: "交易教室頁面，6 堂課程列表。",
    script: "我們做了 6 堂結構化的免費教學課程，從「為什麼要關注漲停股」、「看懂族群分類」、「進場時機」、「隔日沖策略」、「風險控管」到「實戰工作流程 SOP」。這不只是寫好內容然後丟著——這是我們進階收費課程的引流入口。免費課程降低門檻，付費課程承接深度需求。",
    transition: `現在進入今天最重要的一張投影片：那個 ${WIN}% 是怎麼算出來的。`,
  },
  {
    n: "09", title: `★ ${WIN}% 勝率 HERO`, time: "70 秒",
    visual: `整張投影片只有一個巨大的「${WIN}%」紅色大字，下方三個小數字：${HITS}/${SAMPLES}、+${RETURN}%、${DAYS} 天。`,
    script: `這就是開頭講的 ${WIN}%。我說明清楚是怎麼算的：對過去 ${DAYS} 個交易日，每天平台「明日焦點」推薦的所有標的，我們去抓真實的隔日 TWSE OHLC，看開盤價是不是高於漲停日收盤——如果是，算一次「贏」。${DAYS} 天累積 ${SAMPLES} 個樣本，贏 ${HITS} 次，勝率 ${WIN}%。這是樣本加權平均，不是日均，所以一個 3 標的的日子和一個 30 標的的日子算法是公平的。平均開盤報酬是 +${RETURN}%。但我必須誠實說：${SAMPLES} 樣本是小樣本，${DAYS} 天沒涵蓋空頭循環，這是限制。過去績效不代表未來。`,
    cue: { label: "重點", text: "這張是 hero。語氣慢、清楚。「樣本加權平均不是日均」這個技術細節值得多說 5 秒，因為一般財經 KOL 都用日均，這是我們專業的差別。" },
    transition: "那這個平台和市面上的工具差在哪？",
  },
  {
    n: "10", title: "競爭定位", time: "60 秒",
    visual: "比較表：橫軸 CMoney、Goodinfo、券商 App、股文觀指；縱軸 7 個項目。",
    script: "市場上 CMoney、Goodinfo、券商 App 都做漲停追蹤，他們的品牌、流量、資料完整度都比我們強，這必須承認。但我們的差異化在三件事：第一，我們是唯一公開揭露樣本加權真實回測的——CMoney 和 Goodinfo 都沒有；第二，我們把「精選 + 進出場參考 + 隔日真實 OHLC」串成一個工作流程，使用者不用跨三個平台；第三，我們的演算法、評分權重、原始資料都在 GitHub 上開源。我們不是要取代他們，我們在「漲停股隔日追蹤」這個場景做最深。",
    cue: { label: "態度", text: "提到競品時要尊重，不要說「他們很爛」。專業人士會欣賞「我們聚焦不同場景」這種定位。" },
    transition: "接下來談商業模式。",
  },
  {
    n: "11", title: "商業模式 · 三階段", time: "50 秒",
    visual: "三個階梯式卡片：免費 → LINE 群月費 → 教學課程。",
    script: "我們不打算靠廣告，採三階段漸進式收費。第一階段，前三個月，免費平台獲客，建立 SEO 與口碑；第二階段，第三到第六個月，開放 LINE 群月費，299 到 599 元一個月，每天推送精選清單與操作提醒；第三階段，第六個月之後，上架完整教學課程，3000 到 5000 元一期，承接需要深度方法論的進階使用者。重點是每一階段都靠前一階段的信任累積，不需要花大錢買廣告。",
    transition: "用簡單的數字算給大家看可能的收入。",
  },
  {
    n: "12", title: "財務預測 · 保守情境", time: "40 秒",
    visual: "三個情境卡片：100 人、500 人、2000 人，配長條圖。",
    script: "保守情境，100 個付費用戶，月費抓 299 到 599，月收入是 3 萬到 6 萬；穩健情境，500 個用戶，月收入 15 萬到 30 萬；成熟情境，2000 個用戶，月收入 60 萬到 120 萬。這只算月費沒算課程加購。成本面，目前是零，500 人規模下大約一個月一兩千塊。換算下來毛利率會在 95% 以上。瓶頸不是成本，是獲客效率和留存率。",
    cue: { label: "停頓", text: "「毛利率 95% 以上」說完停一下，讓對方消化這個數字。" },
    transition: "獲客怎麼做？",
  },
  {
    n: "13", title: "行銷規劃 · 三層漏斗", time: "40 秒",
    visual: "倒三角漏斗：上層 SEO、中層真實數據、下層 LINE 群轉換。",
    script: `三層漏斗。最上層，SEO 經營「漲停股 隔日表現」「台股月營收 YoY」這類長尾關鍵字，每天自動更新的資料頁本身就是 SEO 內容，自然會被搜尋引擎收錄。中層，靠真實數據揭露建立信任——${WIN}% 勝率、${SAMPLES} 樣本、開源演算法，這是我們和「老師喊單」最大的區別。下層，免費 LINE 群作為高互動社群，使用者實際看到價值之後自然轉成月費會員。整條漏斗不用大量廣告投放，是時間累積換流量。`,
    transition: "時間軸具體看一下。",
  },
  {
    n: "14", title: "6 個月路線圖", time: "40 秒",
    visual: "三個里程碑時間軸：M1-M2、M3-M4、M5-M6。",
    script: "前兩個月先把基礎打穩，目標是資料每天無中斷更新、回測樣本擴充到 200 筆以上、強化驗證機制。第三到第四個月，開始 LINE 群付費內測，目標首批 50 人，月留存率 70% 以上。第五到第六個月，6 堂教學課程定稿、上架平台、建立會員機制，目標是有 30 期以上的銷售。每個階段都有可量測的指標，不是憑感覺。",
    transition: "在進入結尾之前，我必須誠實揭露所有風險。",
  },
  {
    n: "15", title: "風險聲明", time: "45 秒",
    visual: "5 個橫向卡片：樣本短、個人開發、無金融牌照、資料延遲、市場風險。",
    script: `風險我必須直接講清楚。第一，樣本只有 ${SAMPLES} 筆 ${DAYS} 天，沒有跨多空頭循環，未來市況差會有顯著差異。第二，這是個人開發專案，目前沒有團隊和客服窗口。第三，我們不是金融顧問業者，所有內容都僅供參考，不構成任何投資建議。第四，每日資料盤後 2.5 小時才更新，盤中即時請看券商。第五，漲停股操作是高波動策略，可能虧損，請在自己能承受的範圍操作。我把這些先講清楚，是因為信任建立在不掩蓋限制之上。`,
    cue: { label: "誠實", text: "這張不要快、不要含糊。專業投資人最討厭粉飾風險。把它念清楚反而是最好的銷售。" },
    transition: "最後，下一步可以怎麼開始。",
  },
  {
    n: "16", title: "CTA · 行動呼籲", time: "30 秒",
    visual: "三個 CTA 卡片 + 大字 URL。",
    script: "邀請三類人。第一，正在尋找台股工具的散戶，可以馬上去 limit-up-radar.vercel.app 體驗，並加入早期付費 LINE 群（首批 50 名）。第二，投資人和合作夥伴，這個專案資料管線完整、產品成型、初步真實績效已驗證，適合做小規模商業化。第三，內容夥伴——KOL、講師、券商通路——歡迎洽談聯合課程或會員導購。今天就到這裡，謝謝大家。",
    cue: { label: "結尾", text: "「謝謝大家」說完不要立刻問問題，等對方鼓掌或先有反應，再說「有任何問題歡迎提問」。" },
    transition: null,
  },
];

slides.forEach((s) => {
  children.push(
    SlideHeader(s.n, s.title, s.time),
    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: "" })] }),
    VisualNote(s.visual),
    Script(s.script),
  );
  if (s.cue) {
    children.push(Cue(s.cue.label, s.cue.text, s.cue.label === "合規" || s.cue.label === "重點" ? C.red : C.amber));
  }
  children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [new TextRun({ text: "" })] }));
  if (s.transition) {
    children.push(new Paragraph({
      spacing: { before: 100, after: 200 },
      border: { left: { style: BorderStyle.SINGLE, size: 12, color: C.green, space: 8 } },
      indent: { left: 200 },
      children: [
        new TextRun({ text: "→ 轉場：", font: FONT, size: 20, bold: true, color: C.green }),
        new TextRun({ text: s.transition, font: FONT, size: 22, italic: true, color: C.text }),
      ],
    }));
  }
  children.push(PBreak());
});

// === Closing notes ===
children.push(
  H1("結尾備忘"),
  H2("整場節奏總結"),
  P("封面 + 痛點 ＝ 1.5 分鐘抓注意力。"),
  P("功能 5 張 ＝ 3 分鐘建立產品價值。"),
  P(`${WIN}% Hero ＝ 1 分鐘給專業背書。`),
  P("商業 + 財務 + 行銷 + 路線圖 ＝ 3 分鐘給投資邏輯。"),
  P("風險 + CTA ＝ 1 分鐘建立信任、給行動。"),
  P("總計約 12 分鐘，留 3-5 分鐘 Q&A。"),
  H2("延伸場景變奏版"),
  P(`【3 分鐘 elevator pitch 版】只用 Slide 1 + Slide 9 + Slide 11 + Slide 16。一張封面、一張 ${WIN}% 勝率、一張商業模式、一張 CTA。適合電梯、餐會、KOL 訪談開場。`),
  P("【面對面銷售版】把 Slide 11 商業模式講長一點到 2 分鐘，加入「您可以先免費體驗一週」的試用 hook。風險聲明保持完整。"),
  P("【法人 / 創投版】Slide 9 + Slide 12 + Slide 14 加長，財務預測加入「3 年後 5000 人會員 / 教學年收 200 萬」的長期視角。風險聲明同樣完整保留。"),
  H2("常見問答應對（補充）"),
  P("Q「為什麼是你做？有什麼資源？」"),
  P("→ 我是工程師背景，有時間每天確保資料更新。目前一個人，沒有融資壓力，先用最小成本驗證需求。如果驗證成功才談擴張團隊。"),
  P(""),
  P("Q「能不能客製股票池？」"),
  P("→ 目前不行。我們的篩選邏輯是固定的，這是優點不是缺點——所有用戶看到同一份標的，回測結果可重現。客製化會破壞這個透明度。未來可能在課程訂閱方案開放，但要看需求。"),
  P(""),
  P("Q「跟某某老師的群比？」"),
  P("→ 不評論其他老師。我們的差別是公開計算方法、公開回測數字、不喊單。這是不同的服務形式，使用者自己選擇。"),
);

// ============================================================
// Build doc
// ============================================================
const doc = new Document({
  creator: "股文觀指 大師專區",
  title: "股文觀指 商業簡報講稿",
  styles: {
    default: { document: { run: { font: FONT, size: 22 } } },
    paragraphStyles: [
      {
        id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: FONT, color: C.text },
        paragraph: { spacing: { before: 360, after: 200 }, outlineLevel: 0 },
      },
      {
        id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 26, bold: true, font: FONT, color: C.red },
        paragraph: { spacing: { before: 240, after: 140 }, outlineLevel: 1 },
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
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          alignment: AlignmentType.RIGHT,
          children: [new TextRun({
            text: "股文觀指 · 商業簡報講稿",
            font: FONT, size: 16, color: C.dim,
          })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: "limit-up-radar.vercel.app　·　第 ", font: FONT, size: 16, color: C.dim }),
            new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 16, color: C.dim }),
            new TextRun({ text: " 頁", font: FONT, size: 16, color: C.dim }),
          ],
        })],
      }),
    },
    children,
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("股文觀指_商業簡報講稿.docx", buf);
  console.log("Saved: 股文觀指_商業簡報講稿.docx (" + buf.length + " bytes)");
}).catch((e) => { console.error(e); process.exit(1); });
