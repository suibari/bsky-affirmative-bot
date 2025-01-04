require('dotenv').config();
const { generateFreePrompt } = require('../src/gemini');

(async () => {
  const prompt = process.argv[2];

  const text_bot = await generateFreePrompt(prompt);

  console.log("[DEBUG] bot>>> " + text_bot);
})();