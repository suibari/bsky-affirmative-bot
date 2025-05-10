import { createCanvas, loadImage, registerFont, CanvasRenderingContext2D } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

// フォント設定（必要に応じて変更）
registerFont('./fonts/JK-Maru-Gothic-M.otf', { family: 'JK-Maru-Gothic' });

/**
 * 日本語かどうかを判定するユーティリティ
 */
function isJapanese(text: string): boolean {
  return /[一-龯ぁ-んァ-ン]/.test(text);
}

/**
 * 折り返し処理：1行の最大幅に基づいて日本語・英語のテキストを適切に分割
 */
function wrapLinesWithNewlines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split('\n');

  paragraphs.forEach(paragraph => {
    let currentLine = paragraph[0] || '';

    if (isJapanese(paragraph)) {
      for (let i = 1; i < paragraph.length; i++) {
        const testLine = currentLine + paragraph[i];
        const { width } = ctx.measureText(testLine);
        if (width < maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = paragraph[i];
        }
      }
    } else {
      const words = paragraph.split(' ');
      currentLine = words[0] || '';
      for (let i = 1; i < words.length; i++) {
        const testLine = currentLine + ' ' + words[i];
        const { width } = ctx.measureText(testLine);
        if (width < maxWidth) {
          currentLine = testLine;
        } else {
          lines.push(currentLine);
          currentLine = words[i];
        }
      }
    }

    lines.push(currentLine);
  });

  return lines;
}

/**
 * テキストと背景画像を合成し、PNGバッファとして返す
 */
export async function textToImageBufferWithBackground(
  text: string,
  backgroundPath: string = './img/bot-tan.png'
): Promise<Buffer> {
  const bgImage = await loadImage(path.resolve(backgroundPath));
  const originalWidth = bgImage.width;
  const originalHeight = bgImage.height;

  const scaleFactor = 0.5;
  const width = Math.floor(originalWidth * scaleFactor);
  const height = Math.floor(originalHeight * scaleFactor);

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // 背景描画
  ctx.drawImage(bgImage, 0, 0, width, height);

  // テキスト描画設定
  const fontSize = 16;
  const margin = 40;
  const lineHeight = fontSize * 1.25;

  ctx.fillStyle = 'black';
  ctx.font = `${fontSize}px JK-Maru-Gothic`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const maxWidth = width - margin * 2;
  const lines = wrapLinesWithNewlines(ctx, text, maxWidth);

  let y = margin;
  for (const line of lines) {
    ctx.fillText(line.trim(), margin, y);
    y += lineHeight;
  }

  const buffer = canvas.toBuffer('image/png');

  if (process.env.NODE_ENV === 'development') {
    const outputPath = path.resolve('./img/output.png');
    fs.writeFileSync(outputPath, buffer);
    console.log(`Image saved for debugging: ${outputPath}`);
  }

  return buffer;
}
