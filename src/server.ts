import express from 'express';
import { Client, middleware } from '@line/bot-sdk';
import dotenv from 'dotenv';
import { recognizeFoodFromImage } from './services/vision';
import { estimateCalories } from './services/calorie';

// 載入環境變數
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// LINE Bot 設定
const config = {
	channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
	channelSecret: process.env.LINE_CHANNEL_SECRET || ''
};

// 只有在有 token 的情況下才建立 LINE client
let client: Client | null = null;
if (config.channelAccessToken && config.channelSecret) {
	client = new Client(config);
	console.log('✅ LINE Bot 設定完成');
} else {
	console.log('⚠️  警告：LINE Bot token 未設定，webhook 功能將無法使用');
	console.log('請在 .env 檔案中設定 LINE_CHANNEL_ACCESS_TOKEN 和 LINE_CHANNEL_SECRET');
}

// 注意：不要在 webhook 前使用 express.json()，避免破壞簽章驗證
// 只在其他一般路由使用 JSON 解析
app.use((req, res, next) => {
	if (req.path.startsWith('/webhook')) return next();
	return express.json()(req, res, next);
});

// LINE Webhook 驗證中間件（只有在有設定時才啟用）
if (client) {
	app.use('/webhook', middleware(config));
}

// LINE Webhook 端點
app.post('/webhook', async (req, res) => {
	if (!client) {
		return res.status(500).json({ error: 'LINE Bot 未設定' });
	}

	try {
		const events = (req as any).body.events;
		for (const event of events) {
			if (event.type === 'message') {
				if (event.message.type === 'text') {
					await client.replyMessage(event.replyToken, {
						type: 'text',
						text: `收到你的訊息：${event.message.text}`
					});
				} else if (event.message.type === 'image') {
					await client.replyMessage(event.replyToken, {
						type: 'text',
						text: '收到你的圖片！我正在分析食物內容...'
					});
					console.log('收到圖片訊息，ID:', event.message.id);

					// 背景處理：下載圖片 → 辨識 → 估算 → 推播結果
					(async () => {
						try {
							const userId: string | undefined = event.source?.userId;
							if (!userId) {
								console.warn('無 userId，無法推播辨識結果');
								return;
							}

							const contentStream: any = await client!.getMessageContent(event.message.id);
							const imageBuffer = await streamToBuffer(contentStream as NodeJS.ReadableStream);

							const recognition = await recognizeFoodFromImage(imageBuffer);
							if (!recognition) {
								await client!.pushMessage(userId, {
									type: 'text',
									text: '抱歉，我暫時無法從圖片辨識食物內容，請換張清晰的餐點照再試一次喔！'
								});
								return;
							}

							const calorie = estimateCalories(recognition.label);
							const confidence = (recognition.score * 100).toFixed(1);
							const resultText = `我辨識到：${calorie.foodName}（信心 ${confidence}%）\n估計熱量：約 ${calorie.estimatedCalories} ${calorie.unit}`;

							await client!.pushMessage(userId, {
								type: 'text',
								text: resultText
							});
						} catch (err) {
							console.error('圖片處理流程失敗：', err);
						}
					})();
				}
			}
		}
		return res.status(200).end();
	} catch (error) {
		console.error('Webhook 處理錯誤:', error);
		return res.status(500).end();
	}
});

// 健康檢查端點
app.get('/', (req, res) => {
	res.json({
		status: 'ok',
		message: 'LINE Food Bot 正在運行',
		timestamp: new Date().toISOString(),
		lineBotConfigured: !!client
	});
});

// 啟動伺服器
app.listen(port, () => {
	console.log(`🚀 伺服器已啟動在 http://localhost:${port}`);
	if (client) {
		console.log(`📱 LINE Webhook: http://localhost:${port}/webhook`);
		console.log('⏳ 等待 LINE 訊息...');
	} else {
		console.log('📝 請設定 LINE Bot token 後重新啟動伺服器');
	}
});

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
	return new Promise<Buffer>((resolve, reject) => {
		const chunks: Buffer[] = [];
		stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
		stream.on('end', () => resolve(Buffer.concat(chunks)));
		stream.on('error', (err) => reject(err));
	});
}
