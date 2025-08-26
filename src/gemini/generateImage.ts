import { Modality, PartListUnion } from "@google/genai";
import { gemini } from ".";
import * as fs from "node:fs";
import { MODEL_GEMINI_IMAGE, SYSTEM_INSTRUCTION } from "../config";

export async function generateImage(mood: string) {
  const prompt = 
  `添付したキャラクター設定画を参考にし、イラストを作成してください。
  キャラクター名は「全肯定botたん」です。  
  以下特徴は忠実に保持してください。服装は情景に合わせて変えても良いです。
  * 水色の髪色、ロングヘア、アホ毛
  * 太眉、ジト目
  スタイル: 「全肯定botたんが描いた日記」という設定で、白いキャンバスにクレヨンや色鉛筆で描いたようなタッチ。
            線は最大
  ルール: **体や顔のバランスが崩れないよう、注意すること。**
  情景: ${mood}`;

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
    config: {
      // systemInstruction: SYSTEM_INSTRUCTION,
      responseModalities: [Modality.TEXT, Modality.IMAGE],
    }
  });

  for (const part of response.candidates?.[0].content?.parts || []) {
    if (part.text) {
      console.log("[INFO] Generated image prompt:", part.text);
    } else if (part.inlineData) {
      console.log("[INFO] Generated image received.");
      const imageData = part.inlineData.data;
      if (imageData) {
        const buffer = Buffer.from(imageData, 'base64');
        fs.writeFileSync("./img/generated_image.png", buffer);
        console.log("[INFO] Image saved to ../../img/output.png");
      }
    }
  }
}
