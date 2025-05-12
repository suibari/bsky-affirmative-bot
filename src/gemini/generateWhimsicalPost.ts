import { UserInfoGemini } from "../types.js";
import { generateSingleResponse, getFullDateAndTimeString, getRandomItems } from "./util.js";
import eventsMorningWorkday from "../json/event_evening_workday.json";
import eventsMorningDayoff from "../json/event_evening_dayoff.json";
import eventsNoonWorkday from "../json/event_noon_workday.json";
import eventsNoonDayoff from "../json/event_noon_dayoff.json";
import eventsEveningWorkday from "../json/event_evening_workday.json";
import eventsEveningDayoff from "../json/event_evening_dayoff.json";
import eventsNight from "../json/event_night.json";
import eventsMidnight from "../json/event_midnight.json";

export async function generateWhimsicalPost(userinfo: UserInfoGemini) {
  const part_language = `${userinfo.langStr === "日本語" ? "日本語" : "英語"}で生成してください。`;
  const prompt =
`現在、${getFullDateAndTimeString()}です。
あなたの気まぐれでSNSに投稿する文章をこれから生成します。
${part_language}
文章には以下を含めてください。
* フォロワーへの挨拶
* この時間に次の出来事があったこと。${getRandomItems(getCurrentEventSet(), 1)}
* これまで見ていたポストの中でも以下のユーザの投稿が特に面白かったこと。具体的に面白かったポイントを言ってください
以下がユーザ名およびポストです。
-----
ユーザ名: ${userinfo.follower.displayName}
ポスト内容: ${userinfo.posts || ""}
`;

  const response = await generateSingleResponse(prompt, userinfo);

  // AI出力のサニタイズ("-----"を含むときそれ以降の文字列を削除)
  const result = response.text?.split("-----")[0];
  
  const mention = "@" + userinfo.follower.handle;

  return (result + " " + mention) || "";
}

function getCurrentEventSet(): any[] {
  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay(); // 日曜:0, 月曜:1, ..., 土曜:6
  const isWeekend = day === 0 || day === 6;

  if (hour >= 5 && hour < 11) {
    // 朝：5〜10時
    return isWeekend ? eventsMorningDayoff : eventsMorningWorkday;
  } else if (hour >= 11 && hour < 15) {
    // 昼：11〜14時
    return isWeekend ? eventsNoonDayoff : eventsNoonWorkday;
  } else if (hour >= 15 && hour < 19) {
    // 夕方：15〜18時
    return isWeekend ? eventsEveningDayoff : eventsEveningWorkday;
  } else if (hour >= 19 && hour < 24) {
    // 夜：19〜24時
    return eventsNight;
  } else {
    // 深夜：0〜翌4時
    return eventsMidnight;
  }
}