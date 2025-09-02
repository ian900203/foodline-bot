import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Client, middleware } from '@line/bot-sdk';
import axios from 'axios';

// 影像辨識與卡路里估算功能（內嵌到 serverless function）
interface FoodRecognitionResult {
  label: string;
  score: number;
}

interface CalorieEstimation {
  foodName: string;
  estimatedCalories: number;
  unit: string;
}

const FOOD_CALORIE_TABLE: Record<string, number> = {
  'apple': 95, 'banana': 105, 'rice': 200, 'bread': 80, 'fried chicken': 320,
  'hamburger': 500, 'pizza': 285, 'salad': 150, 'noodles': 250, 'sushi': 50
};

async function recognizeFoodFromImage(imageBuffer: Buffer): Promise<FoodRecognitionResult | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.warn('HUGGINGFACE_API_KEY 未設定，跳過影像辨識');
    return null;
  }

  // 測試模式
  console.log('開始圖片辨識，API Key 長度:', apiKey.length);
  if (process.env.VISION_TEST_MODE === 'true') {
    console.log('測試模式：模擬辨識結果');
    return { label: 'ramen noodles', score: 0.85 };
  }

  return null; // 暫時返回 null，實際 API 稍後修正
}

function estimateCalories(foodLabelRaw: string): CalorieEstimation {
  const normalized = foodLabelRaw.toLowerCase().trim();
  
  if (FOOD_CALORIE_TABLE[normalized] != null) {
    return { foodName: normalized, estimatedCalories: FOOD_CALORIE_TABLE[normalized], unit: 'kcal' };
  }

  const keywordToFood: Array<{ keywords: string[]; food: string }> = [
    { keywords: ['rice', 'risotto'], food: 'rice' },
    { keywords: ['noodle', 'spaghetti', 'ramen', 'udon'], food: 'noodles' },
    { keywords: ['burger'], food: 'hamburger' },
    { keywords: ['pizza'], food: 'pizza' },
    { keywords: ['chicken'], food: 'fried chicken' },
    { keywords: ['apple'], food: 'apple' },
    { keywords: ['banana'], food: 'banana' }
  ];

  for (const pair of keywordToFood) {
    if (pair.keywords.some(k => normalized.includes(k))) {
      const food = pair.food;
      return { foodName: food, estimatedCalories: FOOD_CALORIE_TABLE[food] ?? 200, unit: 'kcal' };
    }
  }

  return { foodName: normalized || 'food', estimatedCalories: 200, unit: 'kcal' };
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    console.log('streamToBuffer: 開始處理 stream');
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      console.log('streamToBuffer: 收到 chunk，大小:', chunk.length);
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => {
      console.log('streamToBuffer: stream 結束，總 chunks:', chunks.length);
      resolve(Buffer.concat(chunks));
    });
    stream.on('error', (err) => {
      console.error('streamToBuffer: stream 錯誤:', err);
      reject(err);
    });
  });
}

// 直接使用環境變數（在 Vercel 專案設定中配置）
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const channelSecret = process.env.LINE_CHANNEL_SECRET || '';

const config = {
	channelAccessToken,
	channelSecret
};

const client = (channelAccessToken && channelSecret) ? new Client(config) : null;

// 建立一個可重用的 middleware 處理器（僅在設定齊全時）
const lineMiddleware = (req: VercelRequest, res: VercelResponse, next: () => void) => {
	if (!client) {
		res.status(500).json({ error: 'LINE Bot 未設定' });
		return;
	}
	return (middleware(config) as any)(req, res, next);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method === 'GET') {
		return res.status(200).json({
			status: 'ok',
			message: 'LINE Food Bot on Vercel',
			lineBotConfigured: !!client,
		});
	}

	if (req.method !== 'POST') {
		return res.status(405).json({ error: 'Method Not Allowed' });
	}

	// 驗證簽章並處理事件
	return lineMiddleware(req, res, async () => {
		try {
			const events: any[] = (req as any).body?.events || [];
			for (const event of events) {
				if (event.type === 'message') {
					if (event.message.type === 'text') {
						await client!.replyMessage(event.replyToken, {
							type: 'text',
							text: `收到你的訊息：${event.message.text}`
						});
									} else if (event.message.type === 'image') {
					await client!.replyMessage(event.replyToken, {
						type: 'text',
						text: '收到你的圖片！我正在分析食物內容...'
					});

					// 背景處理：下載圖片 → 辨識 → 估算 → 推播結果
					console.log('開始背景處理圖片');
					(async () => {
						try {
							console.log('進入背景處理 async 函數');
							const userId: string | undefined = event.source?.userId;
							console.log('取得 userId:', userId);
							if (!userId) {
								console.warn('無 userId，無法推播辨識結果');
								return;
							}

							console.log('開始下載圖片內容，messageId:', event.message.id);
							let imageBuffer: Buffer;
							try {
								// 改用直接 HTTP API 調用下載圖片
								const response = await axios.get(`https://api-data.line.me/v2/bot/message/${event.message.id}/content`, {
									headers: {
										'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
									},
									responseType: 'arraybuffer'
								});
								console.log('HTTP API 下載成功，狀態碼:', response.status);
								imageBuffer = Buffer.from(response.data);
								console.log('圖片 Buffer 完成，大小:', imageBuffer.length, 'bytes');
							} catch (downloadError) {
								console.error('下載圖片內容失敗:', downloadError);
								await client!.pushMessage(userId, {
									type: 'text',
									text: '抱歉，無法下載圖片內容，請稍後再試！'
								});
								return;
							}

							console.log('開始進行食物辨識');
							const recognition = await recognizeFoodFromImage(imageBuffer);
							console.log('食物辨識完成:', recognition);
							if (!recognition) {
								await client!.pushMessage(userId, {
									type: 'text',
									text: '抱歉，我暫時無法從圖片辨識食物內容，請換張清晰的餐點照再試一次喔！'
								});
								return;
							}

							const calorie = estimateCalories(recognition.label);
							console.log('卡路里估算完成:', calorie);
							const confidence = (recognition.score * 100).toFixed(1);
							const resultText = `我辨識到：${calorie.foodName}（信心 ${confidence}%）\n估計熱量：約 ${calorie.estimatedCalories} ${calorie.unit}`;

							console.log('準備推播結果訊息給 userId:', userId);
							await client!.pushMessage(userId, {
								type: 'text',
								text: resultText
							});
							console.log('推播訊息成功！');
						} catch (err) {
							console.error('圖片處理流程失敗：', err);
							console.error('錯誤詳細:', JSON.stringify(err, null, 2));
						}
					})();
				}
				}
			}
			return res.status(200).end();
		} catch (err) {
			console.error('Webhook 處理錯誤:', err);
			return res.status(500).end();
		}
	});
}

