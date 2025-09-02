# 開發紀錄（2025-08-26）

## 今日目標
- 串接 LINE 官方帳號 Webhook，建立最小可跑的 Bot（Text/Image 回覆）。
- 建立本機開發環境、設定 `.env`、以 ngrok 對外測試。

## 已完成
- 初始化專案（TypeScript + Express + @line/bot-sdk）。
- 建立 `src/server.ts` 最小骨架：
  - 文字訊息：回覆「收到你的訊息：...」。
  - 圖片訊息：回覆「收到你的圖片！我正在分析食物內容...」。
- 修正中介層順序，避免 `express.json()` 破壞 LINE 簽章驗證（造成 500）。
- 設定 `.env` 並成功啟動伺服器：
  - `LINE_CHANNEL_ACCESS_TOKEN=...`
  - `LINE_CHANNEL_SECRET=...`
  - `PORT=3000`
- 以 ngrok 建立公開網址，成功於 LINE Developers 驗證 Webhook（200 OK）。
- 建立 Vercel 端點 `api/webhook.ts`（可日後直接部署）。

## 重要檔案
- `src/server.ts`：本機 Express + LINE Webhook 入口。
- `api/webhook.ts`：Vercel Serverless Function 版本的 Webhook。
- `package.json`、`tsconfig.json`、`.env`。

## 本機啟動與測試
1. 啟動伺服器（請在專案根目錄）
   ```bash
   cmd /c "npm run dev"
   ```
   看到「伺服器已啟動在 http://localhost:3000」代表成功。

2. 開啟 ngrok 隧道（另外一個視窗）
   ```bash
   ngrok http 3000
   ```
   複製 HTTPS Forwarding，例如：`https://xxxxx.ngrok-free.app`。

3. 設定 LINE Webhook URL
   - `https://xxxxx.ngrok-free.app/webhook`
   - 點「Verify」應顯示 200 OK。

4. 功能驗證
   - 傳文字訊息：Bot 會回覆「收到你的訊息：...」。
   - 傳圖片：Bot 會回覆「收到你的圖片！我正在分析食物內容...」。

## 問題與修正紀錄
- 500 錯誤：因在 `/webhook` 前套用 `express.json()` 破壞簽章，已改成只在非 `/webhook` 路由套用。
- 404 錯誤：LINE Webhook URL 未帶 `/webhook`，修正為 `.../webhook` 後通過 Verify。
- PowerShell 執行原則阻擋 npm/ngrok：改用 `cmd /c` 執行。

## 下一步（明日計畫）
- 新增服務：
  - `src/services/vision.ts`：呼叫 Hugging Face Inference API 進行食物辨識。
  - `src/services/calorie.ts`：依食物名稱估算卡路里（先用簡易對照表）。
- 在 `image` 訊息流程中：下載圖片 → 辨識 → 估算 → 回覆。
- 新增 SQLite 儲存：userId、food、calorie、timestamp，並提供查詢指令（今日/本週、重設、說明）。
- 補 `.env`：`HUGGINGFACE_API_KEY=...`。

---
如需我直接建立上述服務與串接流程，請提供 `HUGGINGFACE_API_KEY`，我會在 `src/services/*` 建檔並改造 `src/server.ts` 完成端到端回覆。
