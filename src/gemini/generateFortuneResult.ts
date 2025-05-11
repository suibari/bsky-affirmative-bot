import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getRandomItems } from "./util.js";

export async function generateFortuneResult(userinfo: UserInfoGemini): Promise<string> {
  const place_language = userinfo.langStr === "日本語" ? "日本" : "世界";
  const part_language = `${userinfo.langStr}で回答は生成してください。`;
  const category_main = ["日常", "冒険", "リラックス", "自己成長", "絆", "笑い", "チャレンジ", "創造性", "感謝"];
  const category_spot = ["観光地", "公共施設", "商業施設", "自然", "歴史的建造物", "テーマパーク", "文化施設", "アウトドアスポット", "イベント会場", "温泉地", "グルメスポット", "スポーツ施設", "特殊施設"];
  const category_food = ["和食", "洋食", "中華料理", "エスニック料理", "カレー", "焼肉", "鍋", "ラーメン", "スイーツ"];
  const category_game = ["アクション", "アドベンチャー", "RPG", "シミュレーション", "ストラテジー", "パズル", "FPS", "ホラー", "シューティング", "レース"];
  const category_anime = ["バトル", "恋愛", "ファンタジー", "日常系", "スポーツ", "SF", "ホラー", "コメディ", "ロボット", "歴史"];
  const category_movie = ["アクション", "コメディ", "ドラマ", "ファンタジー", "ホラー", "ミュージカル", "サスペンス", "アニメ", "ドキュメンタリー", "恋愛"];
  const category_music = ["ポップ", "ロック", "ジャズ", "クラシック", "EDM", "ヒップホップ", "R&B", "レゲエ", "カントリー", "インストゥルメンタル"];
  const part_prompt_luckys = [
    `* ラッキースポットは、${place_language}にある、${getRandomItems(category_spot, 2)}の中で、具体的な名称をランダムに選ぶこと。`,
    `* ラッキーフードは、${getRandomItems(category_food, 2)}をあわせもつ料理の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーゲームは、${getRandomItems(category_game, 2)}をあわせもつ${place_language}のゲームの具体的な名称をランダムに選ぶこと。`,
    `* ラッキーアニメは、${getRandomItems(category_anime, 2)}の要素をあわせもつアニメの具体的な名称をランダムに選ぶこと。`,
    `* ラッキームービーは、${getRandomItems(category_movie, 2)}の要素をあわせもつ映画の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーミュージックは、${getRandomItems(category_music, 2)}の要素をあわせもつ${place_language}の楽曲の具体的な名称をランダムに選ぶこと。`,
  ];

  const prompt =
`占いをしてください。
${part_language}
出力は200~300文字とし、占いは男女関係なく楽しめるようにしてください。
占い結果を以下の条件に基づいて生成してください。
* 占いテーマは${getRandomItems(category_main, 2)}です。2つのテーマを合わせたアドバイスをしてください。
* 占い結果は、「最高」などの最上級表現を使わないこと。
${getRandomItems(part_prompt_luckys, 2)}
悪い内容が一切含まれないようにしてください。
以下がユーザ名です。
-----
ユーザ名: ${userinfo.follower.displayName}`;

  const response = await generateSingleResponse(prompt, userinfo);
  
  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];

  return result ?? "";
}
