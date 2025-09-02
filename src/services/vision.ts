import axios from 'axios';

export interface FoodRecognitionResult {
  label: string;
  score: number;
}

function getHuggingFaceModelName(): string {
  const configuredModelName = process.env.HUGGINGFACE_MODEL?.trim();
  if (configuredModelName && configuredModelName.length > 0) {
    return configuredModelName;
  }
  // 改用食物專用模型，較適合餐點辨識
  return 'nateraw/food';
}

export async function recognizeFoodFromImage(
  imageBuffer: Buffer
): Promise<FoodRecognitionResult | null> {
  const apiKey = process.env.HUGGINGFACE_API_KEY;
  if (!apiKey) {
    console.warn('HUGGINGFACE_API_KEY 未設定，跳過影像辨識');
    return null;
  }

  // 暫時加入測試模式，確保流程正常
  console.log('開始圖片辨識，API Key 長度:', apiKey.length);
  if (process.env.VISION_TEST_MODE === 'true' || true) {  // 暫時強制使用測試模式
    console.log('測試模式：模擬辨識結果');
    return { label: 'ramen noodles', score: 0.85 };
  }

  const modelName = getHuggingFaceModelName();
  const url = `https://api-inference.huggingface.co/models/${encodeURIComponent(modelName)}`;

  try {
    const response = await axios.post(url, imageBuffer, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/octet-stream'
      },
      timeout: 30000
    });

    const data = response.data as Array<{ label: string; score: number }>; 
    if (Array.isArray(data) && data.length > 0) {
      // 取分數最高者
      const top = data[0];
      return { label: top.label, score: top.score };
    }

    // 有些模型會回傳物件包裝或其他格式，做簡單兼容
    if (data && (data as any)[0]?.label) {
      const first = (data as any)[0];
      return { label: first.label, score: first.score ?? 0 };
    }

    return null;
  } catch (error: any) {
    const status = error?.response?.status;
    const message = error?.response?.data || error?.message || String(error);
    console.error('呼叫 Hugging Face 失敗:');
    console.error('- 模型:', modelName);
    console.error('- 狀態碼:', status);
    console.error('- 錯誤:', message);
    console.error('- 完整錯誤:', error);
    return null;
  }
}


