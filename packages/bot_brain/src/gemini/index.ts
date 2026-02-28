import { GoogleGenAI } from "@google/genai";

// Geminiのインスタンスを作成
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

export * from './conversation.js';
export * from './embeddingTexts.js';
export * from './generateAffirmativeWord.js';
export * from './generateAnalyzeResult.js';
export * from './generateAnniversary.js';
export * from './generateCheerResult.js';
export * from './generateDiary.js';
export * from './generateFortuneResult.js';
export * from './generateGoodNight.js';
export * from './generateImage.js';
export * from './generateMyMoodSong.js';
export * from './generateOmikuji.js';
export * from './generateQuestion.js';
export * from './generateQuestionsAnswer.js';
export * from './generateRecapResult.js';
export * from './generateRecommendedSong.js';
export * from './generateWhimsicalPost.js';
export * from './generateWhimsicalReply.js';
export * from './judgeCheerSubject.js';
export * from './judgeReplySubject.js';
export * from './util.js';
