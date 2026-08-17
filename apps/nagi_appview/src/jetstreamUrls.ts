/**
 * Jetstream の接続先候補を読む。
 *
 * 上流が1本しかないと、そのインスタンスが不調なだけで取り込みが止まる。公式 Jetstream は
 * 複数インスタンスがあり、カーソルが unix マイクロ秒の時刻ベースで共通なので、同じカーソルの
 * まま別インスタンスへ乗り換えても取りこぼさない。よってカンマ区切りの候補リストを許す。
 *
 * config.ts の url() は http/https 限定なので流用できない（Jetstream は ws/wss）。
 */
export const parseJetstreamUrls = (value: string, name = "URL_JETSTREAM") => {
  const urls: string[] = [];

  for (const raw of value.split(",")) {
    const candidate = raw.trim();
    if (!candidate) continue;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(`${name} contains an invalid URL: ${candidate}`);
    }

    // http/https での指定も受ける。ws ライブラリはどちらでも繋ぐし、ローカルの
    // 中継を http:// で書いている設定が既にある。ここで ws/wss に寄せておく。
    if (parsed.protocol === "http:") parsed.protocol = "ws:";
    else if (parsed.protocol === "https:") parsed.protocol = "wss:";
    if (parsed.protocol !== "ws:" && parsed.protocol !== "wss:") {
      throw new Error(`${name} must use ws, wss, http or https: ${candidate}`);
    }

    // 同じ先を二度並べても再接続の役に立たないので畳む。
    const normalized = parsed.toString();
    if (!urls.includes(normalized)) urls.push(normalized);
  }

  if (urls.length === 0) {
    throw new Error(`${name} must contain at least one URL`);
  }

  return urls;
};
