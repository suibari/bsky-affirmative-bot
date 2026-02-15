import axios from 'axios';

// Ensure BSKY_BOT_SERVER_URL is in .env
const BSKY_BOT_SERVER_URL = process.env.BSKY_BOT_SERVER_URL || 'http://localhost:3001';

export class BskyService {
  static async post(text: string) {
    // await axios.post(`${BSKY_BOT_SERVER_URL}/post`, { text });
    console.log("Mock posting to Bsky:", text);
  }

  static async postGoodNight(mood: string) {
    try {
      await axios.post(`${BSKY_BOT_SERVER_URL}/features/good-night`, { mood });
    } catch (e) {
      console.error("Failed to post GoodNight:", e);
    }
  }

  static async postWhimsical(mood: string) {
    try {
      await axios.post(`${BSKY_BOT_SERVER_URL}/features/whimsical`, { mood });
    } catch (e) {
      console.error("Failed to post Whimsical:", e);
    }
  }

  static async postQuestion() {
    try {
      await axios.post(`${BSKY_BOT_SERVER_URL}/features/question`);
    } catch (e) {
      console.error("Failed to post Question:", e);
    }
  }
}
