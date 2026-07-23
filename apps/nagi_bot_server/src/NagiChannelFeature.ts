import { NAGI } from "@bsky-affirmative-bot/nagi-lexicon";

/**
 * チャンネル作成イベントのハンドラ（Phase 1 では空スタブ）。
 *
 * Phase 2 でここに「創設時の盛り上げ初回投稿」を実装する:
 *   - evt から新チャンネルの strongRef（uri = at://<did>/<NAGI.channel>/<rkey>, cid）を作り、
 *     その channel を持つトップレベル nagi.post を botたんとして1回投稿する。
 *   - 挨拶文は record.name / record.description から Gemini でテーマ寄せ生成（bot_brain 経由）。
 *
 * 「過疎 CH への話題提供」は別途スケジューラで、queries/channels.ts の最新活動ロジックを使って
 * 投稿の途絶えた CH を抽出して投稿する（Phase 2）。
 */
export async function onNagiChannel(evt: any) {
  if (!evt.commit?.record) return;
  const record = evt.commit.record;
  if (record.$type !== NAGI.channel) return;
  // TODO(Phase 2): 盛り上げ初回投稿を実装する。
}
