const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * NagiクライアントからAppViewへのブラウザアクセスを許可するorigin一覧を読む。
 * 本番とVercel Previewを併用できるようカンマ区切りを受け付けるが、パス、認証情報、
 * query/hashを含むURLはoriginではないため起動時に拒否する。
 */
export const parseClientOrigins = (value: string, name = "NAGI_CLIENT_ORIGIN") => {
  const origins = new Set<string>();

  for (const raw of value.split(",")) {
    const candidate = raw.trim();
    if (!candidate) continue;

    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      throw new Error(`${name} contains an invalid origin: ${candidate}`);
    }

    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.origin !== candidate ||
      parsed.username ||
      parsed.password
    ) {
      throw new Error(`${name} contains an invalid origin: ${candidate}`);
    }

    origins.add(parsed.origin);

    // ローカル開発ではブラウザをlocalhost/IPv4/IPv6のどれで開いても同じ設定で許可する。
    if (LOOPBACK_HOSTNAMES.has(parsed.hostname)) {
      const port = parsed.port ? `:${parsed.port}` : "";
      origins.add(`${parsed.protocol}//localhost${port}`);
      origins.add(`${parsed.protocol}//127.0.0.1${port}`);
      origins.add(`${parsed.protocol}//[::1]${port}`);
    }
  }

  if (origins.size === 0) {
    throw new Error(`${name} must contain at least one origin`);
  }

  return [...origins];
};
