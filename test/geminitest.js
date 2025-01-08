require('dotenv').config();
const readline = require('readline');
const { conversation } = require('../src/gemini');
const { synthesizeAndPlay } = require('../src/voicevox');

let history;

(async () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '[INFO] user>>> ',
  });

  console.log("[INFO] Starting bot...");
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (input.toLowerCase() === "exit") {
      console.log("[INFO] Exiting...");
      rl.close();
      return;
    }

    // console.log("[INFO] user>>> " + input);
    try {
      const {new_history, text_bot} = await conversation("すいばり", input, undefined, history);
      history = new_history;

      // voicevox
      await synthesizeAndPlay(text_bot);
      
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