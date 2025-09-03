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

function getHuggingFaceModelName(): string {
  const configuredModelName = process.env.HUGGINGFACE_MODEL?.trim();
  if (configuredModelName && configuredModelName.length > 0) {
    return configuredModelName;
  }
  // 改用食物專用模型，較適合餐點辨識
  return 'nateraw/food';
}

async function recognizeFoodFromImage(imageBuffer: Buffer): Promise<FoodRecognitionResult | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.warn('HUGGINGFACE_API_KEY 未設定，跳過影像辨識');
    return null;
  }

  // 啟用真實 AI 辨識
  console.log('開始圖片辨識，API Key 長度:', apiKey.length);
  
  const modelName = getHuggingFaceModelName();
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(modelName)}`;

  try {
    console.log('呼叫 Hugging Face API，模型:', modelName);
    const response = await axios.post(url, imageBuffer, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      timeout: 25000
    });
    
    console.log('API 回應狀態:', response.status);
    const data = response.data as Array<{ label: string; score: number }>; 
    console.log('API 回應資料:', JSON.stringify(data));
    
    if (Array.isArray(data) && data.length > 0) {
      const top = data[0];
      console.log('辨識結果:', top);
      return { label: top.label, score: top.score };
    }

    console.warn('API 回應格式異常，使用預設結果');
    return { label: 'food', score: 0.7 };
    
  } catch (error: any) {
    const status = error?.response?.status;
    const message = error?.response?.data || error?.message || String(error);
    console.error('呼叫 Hugging Face 失敗:');
    console.error('- 模型:', modelName);
    console.error('- 狀態碼:', status);
    console.error('- 錯誤:', message);
    
    // API 失敗時回傳預設結果
    return { label: 'unknown food', score: 0.5 };
  }
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
					console.log('收到圖片訊息，開始真實辨識流程');
					
					try {
						// 第一步：立即回覆確認收到
						await client!.replyMessage(event.replyToken, {
							type: 'text',
							text: '🔍 正在進行 AI 食物辨識，請稍候...'
						});
						
						// 第二步：下載圖片
						console.log('開始下載圖片，messageId:', event.message.id);
						const downloadResponse = await axios.get(
							`https://api-data.line.me/v2/bot/message/${event.message.id}/content`,
							{
								headers: { 'Authorization': `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}` },
								responseType: 'arraybuffer',
								timeout: 15000
							}
						);
						console.log('圖片下載成功，大小:', downloadResponse.data.byteLength, 'bytes');
						
						// 第三步：AI 辨識
						const imageBuffer = Buffer.from(downloadResponse.data);
						console.log('開始 Hugging Face AI 辨識');
						const recognition = await recognizeFoodFromImage(imageBuffer);
						console.log('AI 辨識結果:', recognition);
						
						// 第四步：推播結果
						const userId = event.source?.userId;
						if (userId && recognition) {
							const calorie = estimateCalories(recognition.label);
							const confidence = (recognition.score * 100).toFixed(1);
							const resultText = `🎯 AI 辨識結果：\n\n🍽️ 食物：${calorie.foodName}\n🔥 熱量：約 ${calorie.estimatedCalories} ${calorie.unit}\n📊 信心度：${confidence}%`;
							
							await client!.pushMessage(userId, {
								type: 'text',
								text: resultText
							});
							console.log('辨識結果已推播');
						} else {
							console.error('無法取得 userId 或辨識失敗');
							if (userId) {
								await client!.pushMessage(userId, {
									type: 'text',
									text: '❌ 抱歉，AI 無法辨識這張圖片中的食物，請嘗試更清楚的食物照片！'
								});
							}
						}
						
					} catch (error: any) {
						console.error('完整錯誤資訊:', error);
						console.error('錯誤訊息:', error.message);
						console.error('錯誤狀態碼:', error?.response?.status);
					}
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

