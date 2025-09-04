import { Relationship } from '@atproto/api/dist/client/types/app/bsky/graph/defs';
import { agent } from './agent'; // Placeholder import

/**
 * actorに対するothersのフォロー、フォロワー関係を取得
 * @param actor フォローフォロワー関係を知りたいアカウントのDID
 * @param others actorに対するDID配列
 * @returns
 */
export async function getConcatRelationships(
  actor: string,
  others: string[]
): Promise<Relationship[]> {
  const relationships: Relationship[] = [];
  const chunkSize = 30;

  // Ensure the agent is authenticated if necessary.
  // This function assumes the agent is already authenticated or does not require authentication for this specific call.
  // If authentication is needed, it should be handled before calling this function or within a wrapper.

  for (let i = 0; i < others.length; i += chunkSize) {
    const chunk = others.slice(i, i + chunkSize);
    try {
      const response = await agent.app.bsky.graph.getRelationships({
        actor: actor,
        others: chunk,
      });

      if (response.success) {
        if (response.data.relationships) {
          // Merge relationships from the current chunk into the main relationships object
          Object.assign(relationships, response.data.relationships);
        }
      } else {
        console.error(`Error fetching relationships for chunk starting at index ${i}: ${response.headers}`);
        // Depending on requirements, we might want to throw an error or return partial results.
        // For now, we log the error and continue with other chunks.
      }
    } catch (error) {
      console.error(`Exception fetching relationships for chunk starting at index ${i}:`, error);
      // Handle exceptions
    }
  }

  return relationships;
}
