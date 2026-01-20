import { PartListUnion, Type } from "@google/genai";
import { MODEL_GEMINI, SYSTEM_INSTRUCTION } from "../config/index.js";
import { gemini } from "./index.js";
import { logger } from "../index.js";
import { getFullDateAndTimeString, extractJSON } from "./util.js";
import { LanguageName } from "../types.js";
import { SpotifyTrack } from "../api/spotify/index.js";

type GeminiRecommendation = [
  {
    title: string;
    artist: string;
    comment: string;
  }
]

export class MyMoodSongGenerator {
  private historyMap: Record<string, { title: string; artist: string }[]> = {};

  constructor(private maxHistory = 3) { }

  async generate(currentMood: string, langStr: LanguageName, spotifyPlaylist: SpotifyTrack[]) {
    // const history = this.historyMap[langStr] ?? [];
    // responseSchema removed

    const history = spotifyPlaylist.map((track) => {
      return {
        title: track.track.name,
        artist: track.track.artists.map((artist: { name: string }) => artist.name).join(", "),
      }
    });
    const prompt = this.PROMPT_DJ(currentMood, langStr, history);
    const contents: PartListUnion = [prompt];
    const response = await gemini.models.generateContent({
      model: MODEL_GEMINI,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        // responseMimeType: "application/json", // Removed
        // responseSchema: SCHEMA_DJBOT, // Removed
        tools: [
          {
            googleSearch: {},
          }
        ]
      }
    });

    const result = extractJSON(response.text || "") as GeminiRecommendation;

    const song = result[0];
    this.saveHistory(langStr, { title: song.title, artist: song.artist });

    // Geminiリクエスト数加算
    logger.addRPD();

    return song;
  }

  private saveHistory(lang: string, song: { title: string; artist: string }) {
    if (!this.historyMap[lang]) this.historyMap[lang] = [];
    this.historyMap[lang].unshift(song);
    if (this.historyMap[lang].length > this.maxHistory) {
      this.historyMap[lang].pop();
    }
  }

  private PROMPT_DJ(currentMood: string, langStr: LanguageName, history: { title: string; artist: string }[]) {
    return `あなたの今の気分と現在の時間にあった曲を選曲してください。
以下のJSON形式で出力してください。
\`\`\`json
[
  {
    "title": "曲名",
    "artist": "アーティスト名",
    "comment": "コメント"
  }
]
\`\`\`
# ルール
* 実在しない曲は挙げてはいけません。
* ${langStr}の曲を挙げてください。
* titleに曲名、artistにアーティスト名を、正確に出力してください
* commentには選曲に関するあなたのコメントを出力してください
* 過去に選曲した曲は選んではいけません
-----
現在の時間: ${getFullDateAndTimeString()}
今の気分: ${currentMood}
過去に選曲した曲: ${JSON.stringify(history)}
`
  };
}
