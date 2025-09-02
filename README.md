# LINE Food Bot

拍照記錄飲食並計算卡路里的 LINE Bot

## 🚀 部署到 Vercel

### 方法 1：直接上傳（推薦）
1. 到 [Vercel](https://vercel.com) 登入
2. 點 "New Project"
3. 選擇 "Upload" 上傳整個專案資料夾
4. 專案名稱：`foodline-bot`（或自訂）
5. 點 "Deploy"

### 方法 2：Git 部署
1. 把專案推送到 GitHub
2. 在 Vercel 選擇 GitHub repo
3. 點 "Deploy"

## ⚙️ 環境變數設定
Vercel 會自動從 `vercel.json` 讀取環境變數，包含：
- `LINE_CHANNEL_ACCESS_TOKEN`
- `LINE_CHANNEL_SECRET`

## 🔗 設定 LINE Webhook
部署完成後：
1. 複製 Vercel 給你的網址（例如：`https://foodline-bot.vercel.app`）
2. 到 [LINE Developers Console](https://developers.line.biz/)
3. 選擇你的 Bot → Messaging API
4. Webhook URL 填入：`https://你的網址/api/webhook`
5. 點 "Verify" 測試
6. 開啟 "Use webhook"

## 📱 測試 Bot
1. 在 LINE 中搜尋你的官方帳號
2. 傳送文字訊息：會收到回覆
3. 傳送圖片：會收到「正在分析食物內容」的回覆

## 🔧 本地開發
```bash
npm install
npm run dev
```

## 📝 下一步
- [ ] 加入圖片下載功能
- [ ] 串接食物辨識 API
- [ ] 加入卡路里計算
- [ ] 建立資料庫儲存記錄

