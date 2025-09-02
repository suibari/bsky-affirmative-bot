import { Modality, PartListUnion } from "@google/genai";
import { gemini } from ".";
import * as fs from "node:fs";
import { MODEL_GEMINI_IMAGE, SYSTEM_INSTRUCTION } from "../config";

export async function generateImage(mood: string) {
  const prompt = 
  `Please create your illustration using the attached character design as a reference.
  The character's name is "Fully-Affirmative Bot-tan."
  Please faithfully maintain the following characteristics. You may change the outfit to suit the scene.
  * Fully-Affirmative Bot-tan
    - Light blue hair, long hair, ahoge
    - Thick eyebrows, squinting eyes
  * Morpho
    - a Samoyed dog
  * Latte-chan
    - pink hair, long princess hair
    - green eyes
    - maid clothes
  Rules: **Be careful not to lose balance between the body and face.**
  Scene: ${mood}`;

  const imagePath = "./img/bot-tan-concept.png";
  const imageData = fs.readFileSync(imagePath);
  const base64Image = imageData.toString("base64");
  const contents: PartListUnion = [
    { text: prompt },
    {
      inlineData: {
        mimeType: "image/png",
        data: base64Image,
      }
    }
  ];

  const response = await gemini.models.generateContent({
    model: MODEL_GEMINI_IMAGE,
    contents,
    // config: {
    //   // systemInstruction: SYSTEM_INSTRUCTION,
    //   responseModalities: [Modality.IMAGE],
    // }
  });

  for (const part of response.candidates?.[0].content?.parts || []) {
    if (part.text) {
      console.log("[INFO] Generated image prompt:", part.text);
    } else if (part.inlineData) {
      console.log("[INFO] Generated image received.");
      const imageData = part.inlineData.data;
      if (imageData) {
        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync("./img/output.png", buffer);
        console.log("[INFO] Image saved to ./img/output.png");
      }
    }
  }
}
