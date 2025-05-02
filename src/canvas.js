const { createCanvas, loadImage, registerFont } = require('canvas');
const fs = require('fs');
const path = require('path');

// フォント設定（必要に応じて変更）
registerFont('./fonts/JK-Maru-Gothic-M.otf', { family: 'JK-Maru-Gothic' });

// 折り返し処理（右端で折り返す）
function wrapLinesWithNewlines(ctx, text, maxWidth) {
  const lines = [];
  const paragraphs = text.split('\n');  // 改行で分割して段落ごとに処理

  paragraphs.forEach(paragraph => {
    let currentLine = paragraph[0] || '';  // 最初の文字を初期化

    // 日本語と英語で処理を分ける
    if (isJapanese(paragraph)) {
      // 日本語: 1文字ずつ処理
      for (let i = 1; i < paragraph.length; i++) {
        const testLine = currentLine + paragraph[i];
        const { width } = ctx.measureText(testLine);

        if (width < maxWidth) {
          currentLine = testLine;  // 現在の行に追加
        } else {
          lines.push(currentLine);  // 新しい行を追加
          currentLine = paragraph[i];  // 新しい行の最初の文字
        }
      }
    } else {
      // 英語: 単語単位で処理
      const words = paragraph.split(' ');
      currentLine = words[0];  // 最初の単語で初期化

      for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const { width } = ctx.measureText(testLine);

        if (width < maxWidth) {
          currentLine = testLine;  // 現在の行に追加
        } else {
          lines.push(currentLine);  // 新しい行を追加
          currentLine = words[i];  // 新しい行の最初の単語
        }
      }
    }

    lines.push(currentLine);  // 段落の最後の行を追加
  });

  return lines;
}


function isJapanese(text) {
  // 日本語の文字が含まれているかをチェック
  return /[一-龯ぁ-んァ-ン]/.test(text);
}

async function textToImageBufferWithBackground(text, backgroundPath = './img/bot-tan.png') {
  const bgImage = await loadImage(path.resolve(backgroundPath));
  const originalWidth = bgImage.width;
  const originalHeight = bgImage.height;

  // 画像サイズを縮小する
  const scaleFactor = 0.5;  // 50%に縮小
  const width = Math.floor(originalWidth * scaleFactor);
  const height = Math.floor(originalHeight * scaleFactor);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景描画
  ctx.drawImage(bgImage, 0, 0, width, height);

  // テキスト描画設定
  ctx.fillStyle = 'black';
  ctx.font = '16px JK-Maru-Gothic';  // フォントサイズ
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const margin = 40;
  const fontSize = 16;
  const lineHeight = fontSize * 1.25;  // 行間の設定

  const maxWidth = width - margin * 2;
  const lines = wrapLinesWithNewlines(ctx, text, maxWidth);  // 改行も考慮した折り返し

  // テキスト描画
  let y = margin;
  for (const line of lines) {
    ctx.fillText(line.trim(), margin, y);
    y += lineHeight;  // 各行のy座標をlineHeight分だけ更新
  }

  // PNGバッファ生成
  const buffer = canvas.toBuffer('image/png');

  // 開発環境でのみ保存
  if (process.env.NODE_ENV === 'development') {
    const outputPath = path.resolve('./img/output.png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Image saved for debugging: ${outputPath}`);
  }

  return buffer;
}

module.exports = { 
  textToImageBufferWithBackground,
};
