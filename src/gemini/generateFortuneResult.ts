import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getRandomItems } from "./util.js";

export async function generateFortuneResult(userinfo: UserInfoGemini): Promise<string> {
  const place_language = userinfo.langStr === "日本語" ? "日本" : "世界";
  const part_language = `${userinfo.langStr}で回答は生成してください。`;
  const part_prompt_main = [
    "* テーマは日常生活です。生活をより楽しく、充実させるアドバイスをしてください。",
    "* テーマは冒険です。いつもとは違う視点で、心がワクワクする場所や新しい体験につながるアドバイスをしてください。",
    "* テーマはリラックスです。心身を癒すアドバイスをしてください。",
    "* テーマは自己成長です。新しいスキルや知識を得るきっかけを与えてください",
    "* テーマは絆です。友人や家族との絆を深めるためのアドバイスをしてください。",
    "* テーマは笑いです。思いっきり笑えるためのアドバイスをしてください。",
    "* テーマはチャレンジです。挑戦心をかきたててください。",
    "* テーマは創造性です。インスピレーションを得られるアドバイスをしてください。",
    "* テーマは感謝です。大切な人への感謝を伝えるきっかけを与えてください。"
  ];
  const category_spot = ["観光地", "公共施設", "商業施設", "自然", "歴史的建造物", "テーマパーク", "文化施設", "アウトドアスポット", "イベント会場", "温泉地", "グルメスポット", "スポーツ施設", "特殊施設"];
  const category_food = ["和食", "洋食", "中華料理", "エスニック料理", "カレー", "焼肉", "鍋", "ラーメン", "スイーツ"];
  const category_game = ["アクション", "アドベンチャー", "RPG", "シミュレーション", "ストラテジー", "パズル", "FPS", "ホラー", "シューティング", "レース"];
  const category_anime = ["バトル", "恋愛", "ファンタジー", "日常系", "スポーツ", "SF", "ホラー", "コメディ", "ロボット", "歴史"];
  const category_movie = ["アクション", "コメディ", "ドラマ", "ファンタジー", "ホラー", "ミュージカル", "サスペンス", "アニメ", "ドキュメンタリー", "恋愛"];
  const category_music = ["ポップ", "ロック", "ジャズ", "クラシック", "EDM", "ヒップホップ", "R&B", "レゲエ", "カントリー", "インストゥルメンタル"];
  const part_prompt_luckys = [
    `* ラッキースポットは、${place_language}にある、${getRandomItems(category_spot, 1)}かつ${getRandomItems(category_spot, 1)}の中で、具体的な名称をランダムに選ぶこと。`,
    `* ラッキーフードは、${getRandomItems(category_food, 1)}かつ${getRandomItems(category_food, 1)}をあわせもつ料理の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーゲームは、${getRandomItems(category_game, 1)}と${getRandomItems(category_game, 1)}をあわせもつ${place_language}のゲームの具体的な名称をランダムに選ぶこと。`,
    `* ラッキーアニメは、${getRandomItems(category_anime, 1)}と${getRandomItems(category_anime, 1)}の要素をあわせもつアニメの具体的な名称をランダムに選ぶこと。`,
    `* ラッキームービーは、${getRandomItems(category_movie, 1)}と${getRandomItems(category_movie, 1)}の要素をあわせもつ映画の具体的な名称をランダムに選ぶこと。`,
    `* ラッキーミュージックは、${getRandomItems(category_music, 1)}と${getRandomItems(category_music, 1)}の要素をあわせもつ${place_language}の楽曲の具体的な名称をランダムに選ぶこと。`,
  ];

  const prompt =
`占いをしてください。
${part_language}
出力は200文字までとし、占いは男女関係なく楽しめるようにしてください。
占い結果を以下の条件に基づいて生成してください。
${getRandomItems(part_prompt_main, 1)}
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
