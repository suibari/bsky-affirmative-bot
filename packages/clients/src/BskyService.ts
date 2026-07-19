export class BskyService {
  static async post(text: string) {
    // await axios.post(`${BSKY_BOT_SERVER_URL}/post`, { text });
    console.log("Mock posting to Bsky:", text);
  }

}
