import Parser from 'rss-parser';

const parser = new Parser();

export async function fetchJapaneseNews() {
  const feed = await parser.parseURL(
    'https://news.google.com/rss?hl=ja&gl=JP&ceid=JP:ja'
  );

  // for (const item of feed.items) {
  //   console.log('📰', item.title);
  // }

  return feed.items;
}

// fetchJapaneseNews().catch(console.error);
