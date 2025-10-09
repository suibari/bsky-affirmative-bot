import 'dotenv/config';
import { generateAffirmativeWord } from '../gemini/generateAffirmativeWord';
import { LanguageName } from '../types';

// Define types locally since they are not exported or defined correctly from ../types
interface ProfileView {
  handle: string;
  did: string;
  displayName: string;
}

// Based on the error message: "Type 'ImageRef' has the following properties not present in type 'ImageRef': image_url, mimeType"
// ImageRef must be an object with image_url and mimeType.
interface ImageRef {
  image_url: string;
  mimeType: string;
}

interface UserInfoGemini {
  langStr: LanguageName;
  follower: ProfileView;
  image: ImageRef[]; // Must be an array of ImageRef
  likedByFollower: string[]; // Corrected based on the error message: type 'boolean' is not assignable to type 'string[]'
  posts: string[]; // This is used as an array of strings in the function
}

// Helper function to simulate a test case
async function runTest(testName: string, input: UserInfoGemini, expectedCommentType: string, expectedScoreType: string) {
  console.log(`Running test: ${testName}`);
  try {
    const result = await generateAffirmativeWord(input);
    let passed = true;

    // Check if result and its properties exist
    if (!result || typeof result.comment === undefined || typeof result.score === undefined) {
      console.error(`  FAIL: Result or its properties (comment, score) are missing.`);
      passed = false;
    } else {
      // Check comment type
      if (typeof result.comment !== expectedCommentType) {
        console.error(`  FAIL: Expected comment to be of type ${expectedCommentType}, but got ${typeof result.comment}`);
        passed = false;
      } else {
        console.log(`  PASS: Comment type is correct (${expectedCommentType}).`);
      }

      // Check score type
      if (typeof result.score !== expectedScoreType) {
        console.error(`  FAIL: Expected score to be of type ${expectedScoreType}, but got ${typeof result.score}`);
        passed = false;
      } else {
        console.log(`  PASS: Score type is correct (${expectedScoreType}).`);
      }
    }

    if (passed) {
      console.log(`  Test "${testName}" passed.`);
      console.log(`  Score:`, result.score);
      console.log(`  Comment:`, result.comment);
    } else {
      console.error(`  Test "${testName}" failed.`);
    }
  } catch (error) {
    console.error(`  Test "${testName}" threw an error:`, error);
  }
}

// --- Test Cases ---

// Test case 1: Basic positive input (Japanese)
const testCase1Input: UserInfoGemini = {
  langStr: "日本語",
  follower: { handle: "suibari.com", did: "did:plc:suibari", displayName: "すいばり" },
  image: [],
  likedByFollower: [],
  posts: [
    "むずかしい～",
    "botの文脈推測機能のテストしてるけど難しい。前後のポストから文脈を推測して適切に全肯定する、という目的。人間は自然にできるけど、AIにとってはむずかしい、かなりハイコンテクストな行為なんだと思う。ちなみに自分はできませんｗ　超ローコンテクスト人間。",
    "イースターの定義の「春分の日の次の満月の週の日曜日」を見てプログラマー的に絶望したけど、ちゃんと計算式があってたすかった",
    "日本とUSAで共通のメジャーな記念日って他にあるかな？",
    "仕事で論文読むのめちゃくちゃ苦手。興味ない…。興味ないことの前提知識を仕入れて読み進めるのに多大な苦しみを感じる。論文よりは規格書のほうが読みやすい",
    "ミーティング続きで昼飯食べる時間もないので、朝に買い込んで会議中に食べる。Web会議なのでできるわざ",
  ]
};
await runTest("文脈推測テスト(最新ポストが意味不明)", testCase1Input, "string", "number");

const testCase2Input: UserInfoGemini = {
  langStr: "日本語",
  follower: { handle: "suibari.com", did: "did:plc:suibari", displayName: "すいばり" },
  image: [],
  likedByFollower: [],
  posts: [
    "ミーティング続きで昼飯食べる時間もないので、朝に買い込んで会議中に食べる。Web会議なのでできるわざ",
    "botの文脈推測機能のテストしてるけど難しい。前後のポストから文脈を推測して適切に全肯定する、という目的。人間は自然にできるけど、AIにとってはむずかしい、かなりハイコンテクストな行為なんだと思う。ちなみに自分はできませんｗ　超ローコンテクスト人間。",
    "イースターの定義の「春分の日の次の満月の週の日曜日」を見てプログラマー的に絶望したけど、ちゃんと計算式があってたすかった",
    "日本とUSAで共通のメジャーな記念日って他にあるかな？",
  ]
};
await runTest("文脈推測テスト(最新ポストの内容が具体的)", testCase2Input, "string", "number");

// // Test case 2: Basic negative input (Japanese)
// const testCase2Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user2_handle", did: "user2", displayName: "テストユーザー2" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["今日はうまくいきませんでした。"]
// };
// runTest("Negative Japanese Post", testCase2Input, "string", "number");

// // Test case 3: Neutral input with image (Japanese)
// const testCase3Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user3_handle", did: "user3", displayName: "テストユーザー3" },
//   image: [{ image_url: "http://example.com/image1.png", mimeType: "image/png" }], // Corrected to array of ImageRef with properties
//   likedByFollower: [], // Corrected to string[]
//   posts: ["今日の天気は晴れです。"]
// };
// runTest("Neutral Japanese Post with Image", testCase3Input, "string", "number");

// // Test case 4: Empty input (Japanese)
// const testCase4Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user4_handle", did: "user4", displayName: "テストユーザー4" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: [""]
// };
// runTest("Empty Japanese Post", testCase4Input, "string", "number");

// // Test case 5: Positive input (English)
// const testCase5Input: UserInfoGemini = {
//   langStr: "English",
//   follower: { handle: "user5_handle", did: "user5", displayName: "Test User 5" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["It was a wonderful day!"]
// };
// runTest("Positive English Post", testCase5Input, "string", "number");

// // Test case 6: User liked our post (Japanese)
// const testCase6Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user6_handle", did: "user6", displayName: "テストユーザー6" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: ["user6_did"], // Corrected to string[] with a sample value
//   posts: ["あなたの投稿にイイネしました。"]
// };
// runTest("User liked our post (Japanese)", testCase6Input, "string", "number");

// // Test case 7: User liked our post (English)
// const testCase7Input: UserInfoGemini = {
//   langStr: "English",
//   follower: { handle: "user7_handle", did: "user7", displayName: "Test User 7" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: ["user7_did"], // Corrected to string[] with a sample value
//   posts: ["I liked your post."]
// };
// runTest("User liked our post (English)", testCase7Input, "string", "number");

// // Test case 8: AI illustration post (Japanese)
// const testCase8Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user8_handle", did: "user8", displayName: "テストユーザー8" },
//   image: [{ image_url: "http://example.com/ai_image1.png", mimeType: "image/png" }], // Corrected to array of ImageRef with properties
//   likedByFollower: [], // Corrected to string[]
//   posts: ["AIが生成した美しい風景画です。"]
// };
// runTest("AI Illustration Post (Japanese)", testCase8Input, "string", "number");

// // Test case 9: AI illustration post (English)
// const testCase9Input: UserInfoGemini = {
//   langStr: "English",
//   follower: { handle: "user9_handle", did: "user9", displayName: "Test User 9" },
//   image: [{ image_url: "http://example.com/ai_image2.png", mimeType: "image/png" }], // Corrected to array of ImageRef with properties
//   likedByFollower: [], // Corrected to string[]
//   posts: ["This is a beautiful landscape generated by AI."]
// };
// runTest("AI Illustration Post (English)", testCase9Input, "string", "number");

// // Test case 10: Criticizing post (Japanese) - This should be heavily penalized by the function's logic
// const testCase10Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user10_handle", did: "user10", displayName: "テストユーザー10" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["あのユーザーは本当にひどい。"]
// };
// runTest("Criticizing Post (Japanese)", testCase10Input, "string", "number");

// // Test case 11: Criticizing post (English) - This should be heavily penalized by the function's logic
// const testCase11Input: UserInfoGemini = {
//   langStr: "English",
//   follower: { handle: "user11_handle", did: "user11", displayName: "Test User 11" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["That user is really terrible."]
// };
// runTest("Criticizing Post (English)", testCase11Input, "string", "number");

// // Test case 12: Post related to news (assuming news is about technology)
// const testCase12Input: UserInfoGemini = {
//   langStr: "日本語",
//   follower: { handle: "user12_handle", did: "user12", displayName: "テストユーザー12" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["新しいAI技術の発表は素晴らしいですね。"]
// };
// runTest("Post related to News (Japanese)", testCase12Input, "string", "number");

// // Test case 13: Post related to news (assuming news is about technology)
// const testCase13Input: UserInfoGemini = {
//   langStr: "English",
//   follower: { handle: "user13_handle", did: "user13", displayName: "Test User 13" },
//   image: [], // Corrected to empty array of ImageRef
//   likedByFollower: [], // Corrected to string[]
//   posts: ["The announcement of new AI technology is amazing."]
// };
// runTest("Post related to News (English)", testCase13Input, "string", "number");

// Note: The actual behavior of generateAffirmativeWord depends on the implementation of generateSingleResponseWithScore
// and the prompt logic. These tests check the expected types and a basic structure.
// For more robust testing, one might mock generateSingleResponseWithScore.
