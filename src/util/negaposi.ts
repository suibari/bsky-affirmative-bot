import { NegaposiApiResponse } from "../types";

export async function fetchSentiment(texts: string[]): Promise<NegaposiApiResponse> {
  const response = await fetch(process.env.NEGAPOSI_URL!, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ texts })
  });

  if (!response.ok) {
    throw new Error('Failed to fetch sentiment from NEGPOSI_URL');
  }

  const result = await response.json();

  return result
}
