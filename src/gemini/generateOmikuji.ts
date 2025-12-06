import { logger } from "..";
import { UserInfoGemini } from "../types";
import { generateSingleResponse, getRandomItems } from "./util";

export async function generateOmikuji(userinfo: UserInfoGemini) {
  const response = await generateSingleResponse(await PROMPT_OMIKUJI(userinfo));

  logger.addRPD();

  return response ?? "";
}

const PROMPT_OMIKUJI = async (userinfo: UserInfoGemini) => {
  return (userinfo.langStr === "日本語") ?
    `今日は元旦です。ユーザに新年のあいさつをし、おみくじを出してください。` +
    `お祝いのルール:` +
    `* ユーザの名前を呼んであげること` +
    `* 記念日が2つ以上の場合、それぞれに言及すること` +
    `* 1年前のユーザのポストがある場合、その内容をもとに、1年のがんばりをねぎらうこと` +
    `* おみくじのタイトルの意味を解説すること` +
    `* おみくじの内容(特によかった項目TOP3)を解説すること` +
    `---以下、ユーザ情報---` +
    `* ユーザ名: ${userinfo.follower.displayName ?? ""}` +
    `* 記念日: ${userinfo.anniversary?.map(item => item.names.ja).join(", ")}` +
    `* 1年前のユーザのポスト: ${userinfo.posts?.[0] ?? "なし"}` +
    `* おみくじの内容(タイトル): ${getRandomItems(omikujiName, 1)[0]}` +
    `* おみくじの内容(特によかった項目TOP3): ${getRandomItems(omikujiContents, 3)}` :
    `Today is an anniversary. Celebrate the user to the fullest!` +
    `**Please output in ${userinfo.langStr}**` +
    `Celebration Rules:` +
    `* Call the user name.` +
    `* If the anniversary is a common one (New Year's Day, New Year's Eve, etc.), briefly explain the origin of the anniversary.` +
    `* If there are two or more anniversaries, mention each one.` +
    `* If there are posts from the user from a year ago, use those posts to praise their efforts this year.` +
    `* Explain the meaning of the omikuji title.` +
    `* Explain the top 3 items of the omikuji content.` +
    `---User Information Below---` +
    `* User Name: ${userinfo.follower.displayName ?? ""}` +
    `* Anniversary: ${userinfo.anniversary?.map(item => item.names.en).join(", ")}` +
    `* User Posts from a Year Ago: ${userinfo.posts?.[0] ?? "None"}` +
    `* Omikuji Title: ${getRandomItems(omikujiName, 1)[0]}` +
    `* Omikuji Content: ${getRandomItems(omikujiContents, 3)}`
    ;
}

const omikujiName = [
  "スーパー大吉",
  "ウルトラ大吉",
  "ギャラクシー大吉",
  "ミラクル大吉",
  "グレート大吉",
  "プレミアム大吉",
  "ゴールデン大吉",
  "プラチナ大吉",
  "ダイヤモンド大吉",
  "コズミック大吉",
  "インフィニティ大吉",
  "エターナル大吉",
  "ハイパー大吉",
  "スーパーラッキー大吉",
  "デラックス大吉",
  "ファンタスティック大吉",
  "ワンダフル大吉",
  "シャイニング大吉",
  "ブリリアント大吉",
  "スターライト大吉",
  "スーパーポジティブ大吉",
  "オーロラ大吉",
  "ハピネス大吉",
  "スマイル大吉",
  "ラブリー大吉",
  "エンジェル大吉",
  "ブレッシング大吉",
  "ユニコーン大吉",
  "ドラゴン大吉",
  "フェニックス大吉",
  "スーパー開運大吉",
  "絶好調大吉",
  "満点大吉",
  "キラキラ大吉",
  "ほっこり大吉",
  "にこにこ大吉",
  "ごきげん大吉",
  "ドリーム大吉",
  "ホーリースター大吉",
  "きせき大吉",
  "光輝く大吉",
  "天使のささやき大吉",
  "未来輝く大吉",
  "運命覚醒大吉",
  "とびきり大吉",
  "ごほうび大吉",
  "満福大吉",
  "超超超大吉",
  "ギフト大吉",
  "祝福大吉",
  "とんでも大吉",
  "宇宙一大吉",
  "人生最強大吉",
  "よくできました大吉",
  "チャレンジ成功大吉",
  "おめでとう大吉",
  "大勝利大吉",
  "ありがと大吉",
  "幸せ爆誕大吉",
  "ワクワク大吉",
  "アゲアゲ大吉",
  "神がかり大吉",
  "スーパー癒し大吉",
  "超平和大吉",
  "空前絶後大吉",
  "ほめられ大吉",
  "応援され大吉",
  "ハートフル大吉",
  "ファンファーレ大吉",
  "ルンルン大吉",
  "ビッグウェーブ大吉",
  "ハイテンション大吉",
  "エネルギッシュ大吉",
  "光の速さ大吉",
  "天運到来大吉",
  "カラフル大吉",
  "ホープフル大吉",
  "気分満点大吉",
  "快晴大吉",
  "春風大吉",
  "きらめき大吉",
  "ぽかぽか大吉",
  "超スマイル大吉",
  "にっこり大吉",
  "スーパー癒しの大吉",
  "満月大吉",
  "流れ星大吉",
  "願い叶う大吉",
  "ほのぼの大吉",
  "幸運ラッシュ大吉",
  "オーバーフロー大吉",
  "ポジティブ100%大吉",
  "全肯定大吉",
  "最高峰大吉",
  "絶頂大吉",
  "奇跡の連続大吉",
  "もふもふ大吉",
  "スイート大吉",
  "今日の主人公大吉",
  "世界を照らす大吉",
  "超吉",
  "オラオラ大吉",
  "スタートゥインクル大吉",
  "イーじゃんスゲーじゃん大吉",
];

const omikujiContents = [
  "願望：自分の願い事が叶うかどうか",
  "恋愛：片思い・両思いを含めた恋愛の行方",
  "待人：恋愛のみならず、自分の運命にとって重要な人物が現れるかどうか",
  "走人：自分のところから去る人がいるかどうか",
  "縁談：結婚に関する良縁があるかどうか",
  "商売：ビジネスに関する運勢",
  "失物：物に限らず、探しているものに出くわすかどうか",
  "住居：転居や新築に関する良縁があるかどうか",
  "旅立：遠出のみならず、近場の外出や旅行に関する運勢",
  "健康：病気や怪我があるかどうか。ある場合は、治癒までの期間について",
  "学問：試験や勉強の結果に関する運勢",
  "争事：裁判や試合といった、誰かと争ったり競ったりする事柄に関する運勢",
  "抱人：自分のところで雇っている人に関する運勢",
]
