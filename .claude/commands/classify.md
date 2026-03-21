---
description: 更新今日漲停股族群分類
---

# 每日漲停股族群分類

請執行以下步驟來更新今日的漲停股分類：

## 步驟 1：抓取今日資料

執行爬蟲抓取 TWSE 今日收盤資料：
```bash
cd "$PROJECT_DIR"
python -m scraper.main
```

如果今天不是交易日或尚未收盤，爬蟲會提示錯誤。可以指定日期：
```bash
python -m scraper.main 2026-03-20
```

## 步驟 2：讀取漲停股清單

從 SQLite 資料庫讀取今日漲停股：
```bash
cd "$PROJECT_DIR"
python -c "
from scraper.db import get_connection
from datetime import date
import sys

target = sys.argv[1] if len(sys.argv) > 1 else date.today().isoformat()
conn = get_connection()
rows = conn.execute(
    'SELECT stock_code, stock_name, close, change_pct, volume FROM daily_quotes WHERE date=? AND is_limit_up=1 ORDER BY volume DESC',
    (target,)
).fetchall()
conn.close()

if not rows:
    print(f'日期 {target} 無漲停股資料')
else:
    print(f'日期 {target} 共 {len(rows)} 檔漲停：')
    for r in rows:
        print(f'  {r[\"stock_code\"]} {r[\"stock_name\"]}  收盤:{r[\"close\"]}  漲幅:{r[\"change_pct\"]}%  量:{r[\"volume\"]}')
"
```

## 步驟 3：AI 族群分類

根據漲停股清單，依照以下規則進行族群分類：

1. **依產業關聯分組** — 同產業鏈的股票歸為同一族群
2. **命名規則** — 使用「主題 / 子題」格式，如「AI 伺服器 / 散熱」
3. **漲停原因** — 每個族群寫一句話說明漲停原因（30-50字）
4. **標籤** — 適當加上 HOT（最多股票）、FOCUS、NEW（新出現）、連N日
5. **配色** — 每個族群分配一個顏色：
   - 紅 #ef4444 — 最熱族群
   - 綠 #22c55e — 半導體相關
   - 琥珀 #f59e0b — 原物料/傳產
   - 粉紅 #ec4899 — 光電/通訊
   - 紫 #8b5cf6 — 軟體/IC設計
   - 藍 #3b82f6 — 金融/營建
   - 青 #06b6d4 — 生技/綠能
6. **無法歸類的股票** — 放入「個股亮點」群組

## 步驟 4：產生 JSON 檔

將分類結果寫入 `data/daily/{YYYY-MM-DD}.json`，格式如下：

```json
{
  "date": "YYYY-MM-DD",
  "market_summary": {
    "taiex_close": 數字,
    "taiex_change_pct": 數字,
    "total_volume": 數字,
    "limit_up_count": 漲停家數,
    "limit_down_count": 跌停家數,
    "advance": 上漲家數,
    "decline": 下跌家數,
    "unchanged": 持平家數,
    "foreign_net": 外資買賣超(元),
    "trust_net": 投信買賣超(元),
    "dealer_net": 自營商買賣超(元)
  },
  "groups": [
    {
      "name": "族群名稱",
      "color": "#hex顏色",
      "badges": ["HOT"],
      "reason": "漲停原因說明",
      "stocks": [
        {
          "code": "代號",
          "name": "名稱",
          "industry": "產業",
          "close": 收盤價,
          "change_pct": 漲幅百分比,
          "volume": 成交量(張),
          "major_net": 主力買賣超(張),
          "streak": 連板天數
        }
      ]
    }
  ]
}
```

## 步驟 5：驗證

確認 JSON 格式正確且網站可正常載入：
```bash
cd "$PROJECT_DIR"
# 驗證 JSON
python -c "import json; json.load(open('data/daily/$(date +%Y-%m-%d).json')); print('JSON 格式正確')"
```

然後在瀏覽器重新整理 http://localhost:3000 確認資料顯示正常。
