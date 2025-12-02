import Parser from 'rss-parser';

const parser = new Parser();

/**
 * ニュースフェッチ
 * @param locale "ja"で日本、"en"でUSA
 * @returns 
 */
export async function fetchNews(locale: string) {
  const feed = await parser.parseURL(
    `https://news.google.com/rss?hl=${locale}`
  );

  // for (const item of feed.items) {
  //   console.log('📰', item.title);
  // }

  return feed.items;
}

// fetchJapaneseNews().catch(console.error);
