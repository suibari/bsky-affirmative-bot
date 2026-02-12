import { MemoryService } from "@bsky-affirmative-bot/clients";

export const logger = {
  setWhimsicalPostRoot: async (uri: string) => {
    await MemoryService.setWhimsicalPostRoot(uri);
  },
  setQuestionState: async (uri: string, theme: string) => {
    await MemoryService.setQuestionState(uri, theme);
  },
  // This might need to stay sync if used in places that don't support async,
  // but it's better to be async in a monorepo.
  getDailyStats: async () => {
    return await MemoryService.getDailyStats();
  },
  checkRPD: async () => {
    return await MemoryService.checkRPD();
  },
  addAffirmation: async (did: string) => {
    // This should probably call MemoryService to record affirmation in DB
  },
  addLang: async (lang: string) => { },
  addCheer: async () => { },
  addReply: async () => { },
  addAnswer: async () => { },
  addConversation: async () => { },
  addAnalysis: async () => { },
  addAnniversary: async () => { },
  addRecap: async () => { },
  addBskyRate: async () => { },
  addDJ: async () => { },
  addFortune: async () => { },

  getQuestionState: async () => {
    const uriQuestionRoot = await MemoryService.getBotState("question_post_uri");
    const themeQuestion = await MemoryService.getBotState("question_theme");
    return { uriQuestionRoot, themeQuestion };
  },
  getWhimsicalPostRoot: async () => {
    return await MemoryService.getBotState("whimsical_post_root");
  }
};
