import express from "express";
import { doGoodNightPost, doWhimsicalPost, doQuestionPost } from "./features/whimsical.js";

export const router: express.Router = express.Router();

router.post("/features/good-night", async (req, res) => {
  try {
    const { mood } = req.body;
    await doGoodNightPost(mood);
    res.status(200).json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/features/whimsical", async (req, res) => {
  try {
    const { mood } = req.body;
    await doWhimsicalPost(mood);
    res.status(200).json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/features/question", async (req, res) => {
  try {
    await doQuestionPost();
    res.status(200).json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});
