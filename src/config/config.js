require('dotenv').config();

const NICKNAMES_BOT = [
  "全肯定botたん",
  "全肯定たん",
  "全肯定botたそ",
  "全肯定たそ",
  "Botたん",
  "botたん",
  "Suibari-Bot",
  "Suibari-bot",
  "Sui-Bot",
  "sui-bot",
];

const CONVMODE_TRIGGER = [
  "お喋り",
  "おしゃべり",
  "お話",
  "おはなし",
  "Conversation",
  "conversation",
  "Talk with me",
  "talk with me",
];

const PREDEFINEDMODE_TRIGGER = [
  "定型文モード",
  "Predefined Reply Mode",
];

const PREDEFINEDMODE_RELEASE_TRIGGER = [
  "定型文モード解除",
  "Disable Predefined Reply Mode",
];

const FORTUNE_TRIGGER = [
  "占い",
  "うらない",
  "占って",
  "うらなって",
  "Fortune",
  "fortune",
  "FORTUNE",
]

const ANALYZE_TRIGGER = [
  "分析して",
  "Analyze me",
  "analyze me",
  "ANALYZE ME",
]

const EXEC_PER_COUNTS = process.env.NODE_ENV === "development" ? 1 : 3; // 何回に1回AI応答するか

module.exports = {
  NICKNAMES_BOT,
  CONVMODE_TRIGGER,
  PREDEFINEDMODE_TRIGGER,
  PREDEFINEDMODE_RELEASE_TRIGGER,
  FORTUNE_TRIGGER,
  ANALYZE_TRIGGER,
  EXEC_PER_COUNTS,
};