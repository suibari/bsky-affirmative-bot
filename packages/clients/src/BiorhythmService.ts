import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

// Ensure BIORHYTHM_SERVER_URL is available. 
// In a shared package, we depend on the consumer to have the env var set, or we can set a default.
const getBiorhythmServerUrl = () => process.env.BIORHYTHM_SERVER_URL || "http://localhost:3002";

export const botBiothythmManager = {
  getMood: async () => {
    try {
      const res = await axios.get(`${getBiorhythmServerUrl()}/status`);
      return res.data.mood || "Normal";
    } catch (e) {
      return "Normal";
    }
  },
  addAffirmation: async (did: string) => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 10, type: "affirmation", did });
  },
  addDJ: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 20, type: "dj" });
  },
  addFortune: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 15, type: "fortune" });
  },
  addCheer: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 25, type: "cheer" });
  },
  addAnswer: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 15, type: "answer" });
  },
  addConversation: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 10, type: "conversation" });
  },
  addAnalysis: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 50, type: "analysis" });
  },
  addAnniversary: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 100, type: "anniversary" });
  },
  addLike: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 5, type: "like" });
  },
  addFollower: async () => {
    await axios.post(`${getBiorhythmServerUrl()}/energy`, { amount: 50, type: "follow" });
  }
};
