import { numberToEnglishWord, sanitizeDidToLexiconValue } from './util/badgeUtil.js';

// ── コミュニティバッジ（ATProtoに登録する静的な完全定義） ──────────────
// 新しいコミュニティバッジを追加する場合はここだけ変更する。
const COMMUNITY_BADGE_DEFS = [
  {
    identifier: 'team-affirmation',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    locales: [
      { lang: 'ja', name: 'チーム全肯定', description: 'botたんのDiscordコミュニティメンバーの証' },
      { lang: 'en', name: 'Team Affirmation', description: "Proof of bot-tan's Discord community membership." },
    ],
  },
  {
    identifier: 'bot-tan-sub',
    severity: 'inform',
    blurs: 'none',
    defaultSetting: 'warn',
    locales: [
      { lang: 'ja', name: 'サブスクライバー', description: 'botたんのサブスクライバーの証' },
      { lang: 'en', name: 'Subscribers', description: "Proof of bot-tan's subscribers." },
    ],
  },
] as const;

// publish-labels.ts が putRecord にそのまま渡せるオブジェクト
export const labelerServiceRecord = {
  policies: {
    labelValues: COMMUNITY_BADGE_DEFS.map(d => d.identifier),
    labelValueDefinitions: COMMUNITY_BADGE_DEFS,
  },
};

// コミュニティバッジIDの配列（ラベルシンク等で使用）
export const COMMUNITY_LABEL_IDS = COMMUNITY_BADGE_DEFS.map(d => d.identifier);

// ── 全バッジのID＋ロケール定義を返す関数群 ────────────────────────────
// 新しいバッジ種別を追加する場合はここに関数を追加する。
export const BADGE_DEF = {
  // --- コミュニティバッジ（IDのみ参照用） ---
  teamAffirmation: 'team-affirmation' as const,
  botTanSub: 'bot-tan-sub' as const,

  // --- レベルバッジ（全ユーザー共通・レベルごとに1つ） ---
  regularLv: (level: number, levelLabel: string) => ({
    id: `regular-lv-${numberToEnglishWord(level)}`,
    locales: [
      { lang: 'ja', name: `常連さん ${levelLabel}`, description: `botたんからのお誘いに${level}回連続で応えた証！` },
      { lang: 'en', name: `Regular Visitor ${levelLabel}`, description: `Proof of accepting bot-tan's invitation ${level} time(s) in a row!` },
    ],
  }),

  superPositiveLv: (level: number, levelLabel: string) => ({
    id: `super-positive-lv-${numberToEnglishWord(level)}`,
    locales: [
      { lang: 'ja', name: `超ポジティブ ${levelLabel}`, description: `全肯定あふれるポストを${level}回達成した証！` },
      { lang: 'en', name: `Super-Positive ${levelLabel}`, description: `Proof of posting super affirmative posts ${level} time(s)!` },
    ],
  }),

  // --- ユーザー個別バッジ（ユーザーごとに固有のID） ---
  title: (did: string, titleJa: string, titleEn: string) => ({
    id: `title-${sanitizeDidToLexiconValue(did)}`,
    locales: [
      { lang: 'ja', name: `称号: ${titleJa}`, description: `前日の日記の総括：${titleJa}` },
      { lang: 'en', name: `Title: ${titleEn}`, description: `Daily Summary: ${titleEn}` },
    ],
  }),

  analyzeTitle: (did: string, titleJa: string, titleEn: string) => ({
    id: `title-${sanitizeDidToLexiconValue(did)}`,
    locales: [
      { lang: 'ja', name: `称号: ${titleJa}`, description: `性格分析で獲得した称号：${titleJa}` },
      { lang: 'en', name: `Title: ${titleEn}`, description: `Personality Analysis Summary: ${titleEn}` },
    ],
  }),

  anniversary: (did: string, nameJa: string, nameEn: string) => ({
    id: `anniversary-${sanitizeDidToLexiconValue(did)}`,
    locales: [
      { lang: 'ja', name: `記念日: ${nameJa}`, description: `本日の特別な記念日：${nameJa}` },
      { lang: 'en', name: `Anniversary: ${nameEn}`, description: `Today's special anniversary: ${nameEn}` },
    ],
  }),

  morningTalk: (did: string, sumJa: string, sumEn: string) => ({
    id: `morning-talk-${sanitizeDidToLexiconValue(did)}`,
    locales: [
      { lang: 'ja', name: `朝トーク: ${sumJa}`, description: `朝の質問への回答要約バッジ：${sumJa}` },
      { lang: 'en', name: `Morning Talk: ${sumEn}`, description: `Morning question answer summary badge: ${sumEn}` },
    ],
  }),

  todayLucky: (did: string, emojis: string) => ({
    id: `today-lucky-${sanitizeDidToLexiconValue(did)}`,
    locales: [
      { lang: 'ja', name: `今日のラッキー: ${emojis}`, description: `今日の占いラッキーバッジ：${emojis}` },
      { lang: 'en', name: `Today's Lucky: ${emojis}`, description: `Today's fortune lucky badge: ${emojis}` },
    ],
  }),
};
