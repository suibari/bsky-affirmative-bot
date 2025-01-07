require('dotenv').config();
const axios = require('axios');
const { spawn } = require('child_process');
const { Readable } = require('stream');

// APIのエンドポイントと設定
const API_URL = process.env.NGROK_FOWARDING_URL;
const SPEAKER_ID = 8;

// 音声合成と再生を実行する関数
async function synthesizeAndPlay(inputText) {
  try {
    // console.log('Input text:', inputText);

    // クエリデータ生成
    console.log('Creating query...');
    const queryResponse = await axios.post(`${API_URL}/audio_query`, null, {
      params: { speaker: SPEAKER_ID, text: inputText },
    });
    const queryData = queryResponse.data;

    // 音声合成データ生成
    console.log('Synthesizing voice...');
    const synthesisResponse = await axios.post(`${API_URL}/synthesis`, queryData, {
      params: { speaker: SPEAKER_ID },
      responseType: 'arraybuffer', // バイナリデータで取得
    });

    const audioBuffer = Buffer.from(synthesisResponse.data);

    // PulseAudioで音声を再生
    console.log('Playing audio using PulseAudio...');
    playAudioUsingPulse(audioBuffer);

  } catch (error) {
    console.error('Error during synthesis and playback:', error.message);
  }
}

// PulseAudioで音声を再生する関数
function playAudioUsingPulse(audioBuffer) {
  const paplay = spawn('paplay', ['--raw', '--rate=24000', '--format=s16le', '--channels=1'], {
    stdio: ['pipe', 'inherit', 'inherit'],
  });

  // ストリーム経由で音声データを送る
  const audioStream = new Readable();
  audioStream.push(audioBuffer);
  audioStream.push(null); // 終端を明示
  audioStream.pipe(paplay.stdin);

  paplay.on('close', (code) => {
    if (code === 0) {
      console.log('Audio playback finished.');
    } else {
      console.error(`PulseAudio playback failed with code ${code}`);
    }
  });
}

module.exports = { synthesizeAndPlay };

// 実行例
// (async () => {
//   const text = 'こんにちは、これはテストです。';
//   await synthesizeAndPlay(text);
// })();
