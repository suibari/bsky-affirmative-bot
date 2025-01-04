require('dotenv').config();
const readline = require('readline');
const { conversation } = require('../src/gemini');

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
      const text_bot = await conversation(input);
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