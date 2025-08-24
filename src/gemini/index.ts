import { GoogleGenAI } from "@google/genai";

// Geminiのインスタンスを作成
export const gemini = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
