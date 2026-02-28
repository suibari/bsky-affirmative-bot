// youtube.ts
import axios from 'axios';

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const YOUTUBE_SEARCH_URL = 'https://www.googleapis.com/youtube/v3/search';

export async function searchYoutubeLink(query: string): Promise<string | null> {
  console.log(query)
  const res = await axios.get(YOUTUBE_SEARCH_URL, {
    params: {
      key: YOUTUBE_API_KEY,
      part: 'snippet',
      q: query,
      maxResults: 1,
      type: 'video'
    }
  });

  const videoId = res.data.items?.[0]?.id?.videoId;
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null;
}
