import axios from "axios";

export interface PublishNagiNewsRequest {
  articleId: string;
  url: string;
  titleJa: string;
  sourceName?: string;
  sourceUrl?: string;
  publishedAt?: string;
  createdAt: string;
}

export interface PublishNagiNewsResult { uri: string; cid: string }

export class NagiNewsService {
  static async publish(request: PublishNagiNewsRequest): Promise<PublishNagiNewsResult> {
    const baseUrl = process.env.NAGI_BOT_SERVER_URL || "http://localhost:3003";
    const response = await axios.post<PublishNagiNewsResult>(`${baseUrl}/news`, request);
    return response.data;
  }
}
