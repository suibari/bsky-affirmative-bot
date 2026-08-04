/**
 * did → 表示名の解決。
 *
 * おやすみポストのプレゼント紹介と、お部屋のできごとをbiorhythmのプロンプトに載せるときの
 * 両方から呼ばれる。後者は step() ごと（開発時は5分おき）に走り、常連の did を何度も引くため
 * 短期キャッシュを噛ませる。解決できなくても処理は続けたいので、失敗時は did をそのまま返す。
 */

const TTL_MS = 60 * 60 * 1000;

const cache = new Map<string, { at: number; name: string }>();

export async function fetchDisplayName(did: string): Promise<string> {
  const hit = cache.get(did);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.name;

  try {
    const response = await fetch(
      `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(did)}`,
    );
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const profile = (await response.json()) as { displayName?: string; handle?: string };
    const name = profile.displayName || profile.handle || did;
    cache.set(did, { at: Date.now(), name });
    return name;
  } catch (error) {
    console.warn(`[WARN] Failed to fetch display name for ${did}:`, error);
    // 失敗はキャッシュしない。一時的な障害で1時間 did 表示のままになるのを避ける。
    return did;
  }
}
