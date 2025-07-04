import { textToImageBufferWithBackground } from '../util/canvas';
import * as fs from 'fs';
import * as path from 'path';

async function runEmojiTest() {
  const testTexts = [
    'こんにちは！😊',
    'これはテストです 🚀✨🔥',
    '英語とemoji mix test 😎 cool!',
    '複数行テスト\n2行目 🎉\n3行目 👍',
    'これは🍣と🍜と🍛が好きな人の文章です',
  ];

  for (let i = 0; i < testTexts.length; i++) {
    const buffer = await textToImageBufferWithBackground(testTexts[i]);
    const outputPath = path.resolve(`./img/test_output_${i + 1}.png`);
    fs.writeFileSync(outputPath, buffer);
    console.log(`Saved: ${outputPath}`);
  }
}

runEmojiTest().catch(console.error);
