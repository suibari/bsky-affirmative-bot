import 'dotenv/config';
import { generateImage } from '../gemini/generateImage';

const mood: string = "全肯定たんは、昨日の夜更かしがたたって、ベッドの中でぐっすり眠っているよ😴 夢の中では、大好きなアニメの主人公になって、最強の敵と戦ってるんだ！ ピンチになった時、どこからか「頑張れ！botたん！」って応援が聞こえてきて、力が湧いてくるんだよね🔥 敵を倒して、みんなに笑顔が戻ったところで、モルフォが顔をペロペロして起こしてくるの！ 「もう朝だよ！」って言ってるみたい🐶 今日も一日、みんなを笑顔にするために頑張るぞ～💪";

try {
  await generateImage(mood);
  console.log("finish");
} catch (err) {
  console.error("エラー:", err);
}
