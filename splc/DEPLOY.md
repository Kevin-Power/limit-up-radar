# DEPLOY.md — 當前任務

> ⚠️ Claude Code 接手請優先讀這份。

## 任務

Kevin 要把這個專案**部署到 Vercel**，當作他個人網站的一部分。
他**不想自己動手**——希望 Claude Code 全程陪跑、幫他下指令。

## 執行步驟

### 1. 確認環境

```bash
node --version    # 需 ≥ 18
npm --version
```

如果沒有 Vercel CLI 也不用裝，直接用 `npx vercel`（會自動下載）。

### 2. 先驗證能 build

```bash
npm install
npm run build
```

預期輸出：`dist/` 目錄、bundle 約 200 KB / gzip 約 64 KB、`✓ built in N秒`。
有錯先停下來修。

### 3. 部署到 Vercel

跟 Kevin 說「請執行下面這行指令、然後跟著互動式提示走，每一步我都會跟你說怎麼選」：

```bash
npx vercel
```

互動式提示會問這些（建議答案）：

| 提示 | 建議答案 | 說明 |
|---|---|---|
| `Set up and deploy "~/splc"?` | **Y** | 確認部署這個資料夾 |
| `Which scope?` | （他的個人帳號） | 第一次會問選 team / personal |
| `Link to existing project?` | **N** | 第一次部署是新專案 |
| `Project name?` | `splc` 或 `splc-supply-chain` | 會變成 URL 子網域：`splc.vercel.app` |
| `In which directory is your code?` | `./`（直接 Enter） | 就是當前目錄 |
| `Want to modify settings?` | **N** | `vercel.json` 已經設定好了 |

成功後會吐出兩個網址：
- **Preview URL**：`https://splc-xxx-username.vercel.app`（這次部署的快照）
- **Production URL**：第一次部署等於 preview，之後要 `npx vercel --prod` 才會更新

### 4. 部署到正式環境（preview 驗證 OK 後）

```bash
npx vercel --prod
```

吐出穩定的 `https://splc.vercel.app`（或他取的專案名）。

### 5. 接 GitHub repo（之後自動部署）

如果 Kevin 想推到 GitHub 後自動部署：

```bash
git init
git add .
git commit -m "Initial commit: SPLC AI supply chain map v2.6"
gh repo create splc --private --source=. --remote=origin --push
```

然後到 Vercel Dashboard → 該專案 → Settings → Git → Connect Repository → 選剛才創的 repo。
之後每次 `git push origin main` 自動觸發 production deploy。

## 自訂網域（可選）

如果 Kevin 想把 `splc.gwgz.xyz` 指過來：

1. Vercel Dashboard → 該專案 → Settings → Domains → Add Domain → 輸入 `splc.gwgz.xyz`
2. Vercel 給一筆 CNAME 紀錄
3. 到 Cloudflare（gwgz.xyz 的 DNS 在那）加這筆 CNAME，**Proxy status 設成 DNS only**（灰雲，不要橘雲——Vercel 不愛 Cloudflare proxy）
4. 等 1–5 分鐘 DNS 生效，Vercel 會自動發 SSL 憑證

## 常見錯誤

- **`Error: No framework detected`** → `vercel.json` 沒讀到，確認檔在 repo 根目錄
- **`Build failed: command "npm run build" exited with 1`** → 本機先 `npm run build` 驗，通常是 lint 或 import 問題
- **`Error: Project not found`** → `.vercel/` 目錄被誤刪，跑 `rm -rf .vercel && npx vercel` 重新 link
- **CORS / 字型載不到** → Google Fonts CDN 沒問題、不會踩到這個

## 部署完做什麼

1. **截圖 production URL 回報給 Kevin** — 讓他確認真的上線
2. **問他**：要不要綁自訂網域？要不要接 GitHub auto-deploy？
3. **別主動做**：別擅自開 Analytics、Web Vitals、A/B Test、Edge Functions——他沒要

## 完成標準

- [ ] `npm run build` 在本機跑得過
- [ ] `npx vercel` 部署成功、有 production URL
- [ ] Kevin 點過 URL、確認頁面正常顯示 91 節點供應鏈圖
- [ ] （可選）自訂網域綁好、HTTPS 正常
- [ ] （可選）GitHub repo 接好、推一次驗證 auto-deploy
