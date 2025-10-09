import axios from 'axios';

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET!;
const REFRESH_TOKEN = process.env.SPOTIFY_REFRESH_TOKEN!;
const PLAYLIST_ID = process.env.SPOTIFY_PLAYLIST_ID!;

/**
 * ✅ アクセストークンを更新（自動）
 */
async function getAccessToken(): Promise<string> {
  const res = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: REFRESH_TOKEN,
    }),
    {
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    }
  );

  return res.data.access_token;
}

/**
 * 🎵 キーワードからSpotify楽曲を検索してURLを返す
 */
export async function searchSpotifyTrack(artist: string, track: string): Promise<{
  url: string;
  uri: string;
} | null> {
  const accessToken = await getAccessToken();

  const res = await axios.get('https://api.spotify.com/v1/search', {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: {
      q: `artist:${artist} track:${track}`,
      type: 'track',
      limit: 1,
    },
  });

  const result = res.data.tracks.items?.[0];
  if (!result) return null;

  return {
    url: result.external_urls.spotify, // Web用URL
    uri: result.uri, // プレイリスト追加に使うURI
  };
}

/**
 * 🧺 プレイリストに曲を追加
 */
export async function addTrackToPlaylist(trackUri: string): Promise<void> {
  const accessToken = await getAccessToken();

  await axios.post(
    `https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`,
    { uris: [trackUri] },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
  console.log(`[INFO][SPOTIFY] Added to playlist: ${trackUri}`);
}

/**
 * 🔍 プレイリストに曲が存在するかチェック
 * @param trackUri 
 * @returns 
 */
async function isTrackInPlaylist(trackUri: string): Promise<boolean> {
  const accessToken = await getAccessToken();

  const res = await axios.get(`https://api.spotify.com/v1/playlists/${PLAYLIST_ID}/tracks`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    params: { fields: "items(track(uri))", limit: 100 },
  });

  return res.data.items.some((item: any) => item.track.uri === trackUri);
}

/**
 * 🎯 Spotify検索 + プレイリスト追加（統合関数）
 * @param query 曲名・アーティストなど
 * @returns 追加した曲のSpotify URL or null
 */
export async function searchSpotifyUrlAndAddPlaylist(artist: string, track: string): Promise<string | null> {
  try {
    // 曲検索
    const result = await searchSpotifyTrack(artist, track);

    if (!result) {
      console.warn(`[WARN][SPOTIFY] No track found for query: artist:${artist} track:${track}`);
      return null;
    }

    // プレイリストに追加
    const exists = await isTrackInPlaylist(result.uri, );
    if (!exists) {
      await addTrackToPlaylist(result.uri);
      console.log(`[INFO][SPOTIFY] Added to playlist: ${result.url}`);
    } else {
      console.log(`[INFO][SPOTIFY] Track already in playlist: ${result.url}`);
    }

    return result.url;
  } catch (err) {
    console.error("[INFO][SPOTIFY] Spotify operation failed:", err);
    return null;
  }
}
