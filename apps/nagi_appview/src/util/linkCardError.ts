import { LinkMetadataError } from "@bsky-affirmative-bot/nagi-linkcard";
import { ApiError } from "../middleware/errors.js";

// 共有パッケージの LinkMetadataError を appview の ApiError へ変換する。
// errorHandler は ApiError のみステータス/コードを尊重するため、必ずここを通す。
export async function toApiError<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof LinkMetadataError)
      throw new ApiError(error.status, error.code, error.message);
    throw error;
  }
}
