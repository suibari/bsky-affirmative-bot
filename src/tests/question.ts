import 'dotenv/config';
import { generateQuestion } from '../gemini/generateQuestion';
import { generateQuestionsAnswer } from '../gemini/generateQuestionsAnswer';
import { UserInfoGemini } from '../types';
import * as readline from 'readline'; // Import readline

async function main() {
  const question = await generateQuestion();
  console.log('Generated Question:', question);

  if (question) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const userInput = await new Promise<string>((resolve) => {
      rl.question('Your answer: ', (answer) => {
        rl.close();
        resolve(answer);
      });
    });

    // Assuming UserInfoGemini has a 'posts' property that is an array of strings
    // and the user's input is the answer to be stored.
    const questionWithFollower: UserInfoGemini = {
      ...question,
      follower: { did: 'did:plc:placeholder', handle: 'placeholder.bsky.social', displayName: 'すいばり' },
      posts: [userInput], // Set user's input to posts[]
      langStr: '日本語',
    };

    // The second argument to generateQuestionsAnswer should be the question string itself, not the whole object.
    const answer = await generateQuestionsAnswer(questionWithFollower, question.text);
    console.log('Generated Answer:', answer);
  }
}

main();
