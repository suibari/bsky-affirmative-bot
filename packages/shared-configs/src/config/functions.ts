import eventsMorningWorkday from "../json/event_evening_workday.json" with { type: "json" };
import eventsMorningDayoff from "../json/event_evening_dayoff.json" with { type: "json" };
import eventsNoonWorkday from "../json/event_noon_workday.json" with { type: "json" };
import eventsNoonDayoff from "../json/event_noon_dayoff.json" with { type: "json" };
import eventsEveningWorkday from "../json/event_evening_workday.json" with { type: "json" };
import eventsEveningDayoff from "../json/event_evening_dayoff.json" with { type: "json" };
import eventsNight from "../json/event_night.json" with { type: "json" };
import eventsMidnight from "../json/event_midnight.json" with { type: "json" };

export function getCurrentEventSet(): any[] {
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
