export interface CalorieEstimation {
  foodName: string;
  estimatedCalories: number;
  unit: string;
}

// 極簡對照表，可後續擴充或改為資料庫/外部 API
const FOOD_CALORIE_TABLE: Record<string, number> = {
  'apple': 95,
  'banana': 105,
  'rice': 200, // 一碗約 150~200 kcal
  'bread': 80, // 一片吐司
  'fried chicken': 320, // 一塊
  'hamburger': 500,
  'pizza': 285, // 一片
  'salad': 150,
  'noodles': 250,
  'sushi': 50 // 一貫
};

export function estimateCalories(foodLabelRaw: string): CalorieEstimation {
  const normalized = foodLabelRaw.toLowerCase().trim();

  // 直接比對
  if (FOOD_CALORIE_TABLE[normalized] != null) {
    return {
      foodName: normalized,
      estimatedCalories: FOOD_CALORIE_TABLE[normalized],
      unit: 'kcal'
    };
  }

  // 簡單關鍵字對應
  const keywordToFood: Array<{ keywords: string[]; food: string }> = [
    { keywords: ['rice', 'risotto'], food: 'rice' },
    { keywords: ['bread', 'toast', 'bun'], food: 'bread' },
    { keywords: ['noodle', 'spaghetti', 'ramen', 'udon'], food: 'noodles' },
    { keywords: ['burger'], food: 'hamburger' },
    { keywords: ['pizza'], food: 'pizza' },
    { keywords: ['sushi'], food: 'sushi' },
    { keywords: ['salad'], food: 'salad' },
    { keywords: ['chicken'], food: 'fried chicken' },
    { keywords: ['apple'], food: 'apple' },
    { keywords: ['banana'], food: 'banana' }
  ];

  for (const pair of keywordToFood) {
    if (pair.keywords.some(k => normalized.includes(k))) {
      const food = pair.food;
      return {
        foodName: food,
        estimatedCalories: FOOD_CALORIE_TABLE[food] ?? 200,
        unit: 'kcal'
      };
    }
  }

  // 無法對應時回傳保守預設值
  return {
    foodName: normalized || 'food',
    estimatedCalories: 200,
    unit: 'kcal'
  };
}


