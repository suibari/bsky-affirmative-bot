import 'dotenv/config';
import readline from 'readline';
import { conversation } from '../gemini/conversation';
import { Content } from '@google/genai';

let history: Content[];

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '[INFO] user>>> ',
  });

  console.log("[INFO] Starting bot...");
  rl.prompt();

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (input.toLowerCase() === "exit") {
      console.log("[INFO] Exiting...");
      rl.close();
      return;
    }

    try {
      const { new_history, text_bot } = await conversation({
        follower: {
          did: "did:plc:sample",
          handle: "suibari.com",
          displayName: "すいばり"
        },
        posts: [input],
        langStr: "日本語",
        history,
      });

      history = new_history;

      console.log("[INFO] bot>>> " + text_bot);
    } catch (err) {
      console.error("[ERROR] An error occurred: ", err);
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log("[INFO] Goodbye!");
    process.exit(0);
  });
})();
