import { PartListUnion, Type } from '@google/genai';
import { gemini } from './index.js';
import { SYSTEM_INSTRUCTION, POST_TEXT_LIMIT, safeFetch, resolveAiRoute } from '@bsky-affirmative-bot/shared-configs';
import type { AiFeatureKey } from '@bsky-affirmative-bot/shared-configs';
import { UserInfoGemini, GeminiScore, BotContext, LanguageName } from '@bsky-affirmative-bot/shared-configs';
import { MemoryService, reportHealthFailure, reportHeartbeat } from '@bsky-affirmative-bot/database';
import { buildAffirmativeImageParts } from './affirmativeImages.js';
import { toServiceTier } from './aiRoute.js';

export type GeminiRequestOptions = {
  /** 実際の Gemini HTTP リクエストを送る直前に呼ぶ。 */
  beforeRequest?: () => Promise<void>;
  /** 呼び出し元が明示した場合だけ既定モデルを上書きする。 */
  model?: string;
  /** Nagi の耐障害フォールバック用。未指定時は従来の購読状態に従う。 */
  serviceTier?: 'flex' | 'standard';
  /** Gemini 3.x の thinking level。未指定ならモデル既定値を使う。 */
  thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high';
  /** 本文を含めず usage とレイテンシだけを観測する。 */
  onUsage?: (usage: GeminiUsage) => void;
};

export type GeminiUsage = {
  model: string;
  serviceTier?: 'flex' | 'standard';
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  latencyMs: number;
};

function energyLabel(energy: number, ja: boolean): string {
  if (energy >= 80) return ja ? 'めちゃくちゃ元気！' : 'Super energetic!';
  if (energy >= 60) return ja ? '元気' : 'Energetic';
  if (energy >= 40) return ja ? 'まあまあ' : 'So-so';
  if (energy >= 20) return ja ? 'ちょっとお疲れ気味…' : 'A bit tired...';
  return ja ? 'ぐったり…' : 'Exhausted...';
}

function recentActivityLines(botContext: BotContext, ja: boolean): string {
  const compact = (botContext.recentActivities ?? [])
    .filter((item, index, items) => {
      if (index === 0) return true;
      const previous = items[index - 1];
      return (
        previous.activity !== item.activity ||
        previous.activityEn !== item.activityEn
      );
    })
    .slice(-12);
  if (compact.length === 0) return '';
  const lines = compact.map((item) =>
    `- ${item.at}: ${ja ? item.activity : item.activityEn}`,
  );
  return ja
    ? `\n### 直近24時間の行動履歴（記録された事実・古い順）\n${lines.join('\n')}\n`
    : `\n### Activity history from the last 24 hours (recorded facts; oldest first)\n${lines.join('\n')}\n`;
}

export function formatBotContext(
  botContext?: BotContext,
  langStr?: LanguageName,
  options: { conversationHistoryAware?: boolean } = {},
): string {
  if (!botContext) return '';
  if (!options.conversationHistoryAware) {
    if (langStr === '日本語') {
      return `\n---\n## botたんの状況（参考にして返答をパーソナライズしてください）\n過去に触れる場合は行動履歴を事実として使い、記録外の出来事を足したり現在の状況で上書きしたりしないでください。\n- 日時：${botContext.datetime}\n- 天気：${botContext.weather}\n- いまやってること：${botContext.botActivity}\n- 元気度：${energyLabel(botContext.botEnergy, true)}\n${recentActivityLines(botContext, true)}`;
    }
    return `\n---\n## Bot's situation (use this to personalize your response)\nWhen mentioning the past, treat the activity history as fact. Do not add unrecorded events or overwrite past facts with the current snapshot.\n- Date/Time: ${botContext.datetime}\n- Weather: ${botContext.weather}\n- Currently: ${botContext.botActivityEn}\n- Energy: ${energyLabel(botContext.botEnergy, false)}\n${recentActivityLines(botContext, false)}`;
  }
  if (langStr === '日本語') {
    return `\n---\n## botたんの現在状況（必要な場合だけ参照する背景情報）\nこの情報を返答へ必ず盛り込む必要はありません。最新のユーザメッセージと会話の流れを優先してください。\n直近の会話ですでに触れた状況は繰り返さず、過去について話す場合は行動履歴と会話履歴を照合してください。記録にない出来事を作らず、時系列を推測で進めないでください。現在の状況で過去の事実を上書きしてはいけません。\n- 日時：${botContext.datetime}\n- 天気：${botContext.weather}\n- いまやってること：${botContext.botActivity}\n- 元気度：${energyLabel(botContext.botEnergy, true)}\n${recentActivityLines(botContext, true)}`;
  }
  return `\n---\n## Bot's current situation (background; use only when needed)\nYou do not need to mention this information in every response. Prioritize the user's latest message and the conversation flow.\nDo not repeat a situation already mentioned recently. When discussing the past, cross-check the activity history and conversation history. Do not invent how this snapshot progressed over time, add unrecorded events, or overwrite past facts with the current snapshot.\n- Date/Time: ${botContext.datetime}\n- Weather: ${botContext.weather}\n- Currently: ${botContext.botActivityEn}\n- Energy: ${energyLabel(botContext.botEnergy, false)}\n${recentActivityLines(botContext, false)}`;
}

/**
 * POST_TEXT_LIMITを超える場合はリトライするgenerateContentのラッパー
 * userinfo が渡された場合、プロンプトの末尾に共通コンテキスト（日時・天気・bot状態）を自動付与する
 */
export async function generateContentWithRetry(
  params: any & { feature?: AiFeatureKey },
  retryCount = 3,
  userinfo?: UserInfoGemini,
  requestOptions: GeminiRequestOptions = {},
): Promise<any> {
  // 呼び出し側は model ではなく feature（機能キー）を名乗る。実モデルと serviceTier は
  // レジストリが決める。feature は Gemini API のペイロードに混ぜてはいけないので必ず剥がす。
  const { feature, ...rest } = params;
  const routed = feature ? resolveAiRoute(feature) : undefined;
  // 優先順位: 明示 requestOptions（Nagi の再試行ラダー） > feature のルート > params の生 model
  const serviceTier = toServiceTier(requestOptions.serviceTier ?? routed?.serviceTier);
  params = {
    ...rest,
    model: requestOptions.model ?? routed?.model ?? rest.model,
    config: {
      ...rest.config,
      // ルートが "auto" のときは serviceTier を積まない（現状の未設定挙動を維持）
      ...(serviceTier ? { serviceTier } : {}),
      ...(requestOptions.thinkingLevel
        ? { thinkingConfig: { thinkingLevel: requestOptions.thinkingLevel } }
        : {}),
    },
  };

  if (userinfo?.botContext) {
    const botCtx = formatBotContext(userinfo.botContext, userinfo.langStr);
    if (Array.isArray(params.contents) && typeof params.contents[0] === 'string') {
      params = {
        ...params,
        contents: [params.contents[0] + botCtx, ...params.contents.slice(1)],
      };
    } else if (typeof params.contents === 'string') {
      params = { ...params, contents: params.contents + botCtx };
    }
  }

  let response;
  for (let i = 0; i <= retryCount; i++) {
    // APIの接続や高負荷エラー（503等）は内部リトライせず、上位関数（callbacks.ts）の一元リトライに即座に委ねる
    try {
      await requestOptions.beforeRequest?.();
      const startedAt = Date.now();
      response = await gemini.models.generateContent(params);
      const usage = response.usageMetadata ?? {};
      requestOptions.onUsage?.({
        model: params.model,
        ...(requestOptions.serviceTier
          ? { serviceTier: requestOptions.serviceTier }
          : routed?.serviceTier === 'flex' || routed?.serviceTier === 'standard'
            ? { serviceTier: routed.serviceTier }
            : {}),
        promptTokens: usage.promptTokenCount ?? 0,
        outputTokens: usage.candidatesTokenCount ?? 0,
        thinkingTokens: usage.thoughtsTokenCount ?? 0,
        totalTokens: usage.totalTokenCount ?? 0,
        latencyMs: Date.now() - startedAt,
      });
    } catch (e) {
      MemoryService.incrementStats('rpdError', 1).catch((err: any) =>
        console.error('Failed to increment rpdError:', err),
      );
      // 死活監視は「最後に成功したのはいつか」だけでは足りない。エラーを返し続けて
      // いる状態を検知するため、失敗そのものを記録する。追加の API 呼び出しは
      // しない（プローブで RPD を消費したくない）。
      reportHealthFailure('gemini', e).catch(() => {});
      throw e;
    }
    const text = response.text || '';

    // Increment RPD on success
    MemoryService.incrementStats('rpd', 1).catch((e: any) => console.error('Failed to increment RPD:', e));
    reportHeartbeat('gemini').catch(() => {});

    // 文字数制限チェック（文字数超過時のみ、モデル生成のやり直しとして内部リトライを許容）
    if (text.length <= POST_TEXT_LIMIT) {
      return response;
    }
    console.warn(
      `[WARN] Generated content exceeded ${POST_TEXT_LIMIT} characters (${text.length}). Retrying... (${i + 1}/${retryCount})`,
    );
  }
  console.warn(
    `[WARN] Failed to generate content under 2000 characters after ${retryCount} retries. Returning last response.`,
  );
  return response;
}

/**
 * 必要に応じて画像を付与してシングルレスポンスを得る
 *
 * この関数は多くの機能から共有されるため、モデル/tier は呼び出し側が名乗る feature キーで決まる。
 * feature に既定値を持たせないのは、新しい呼び出しがどれかの機能キーに必ず紐づくよう
 * コンパイラに強制させるため。
 */
export async function generateSingleResponse(
  prompt: string,
  userinfo: UserInfoGemini | undefined,
  feature: AiFeatureKey,
): Promise<string> {
  const contents: PartListUnion = [prompt];

  if (userinfo?.image) {
    for (const img of userinfo.image) {
      try {
        const response = await safeFetch(img.image_url);
        if (!response.ok) {
          console.warn(`[WARN] Failed to fetch image: ${img.image_url} (Status: ${response.status})`);
          continue;
        }
        const imageArrayBuffer = await response.arrayBuffer();
        const base64ImageData = Buffer.from(imageArrayBuffer).toString('base64');
        contents.push({
          inlineData: {
            mimeType: img.mimeType,
            data: base64ImageData,
          },
        });
      } catch (e) {
        console.warn(`[WARN] Error fetching image: ${img.image_url}`, e);
        continue;
      }
    }
  }

  const response = await generateContentWithRetry(
    {
      feature,
      contents,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [
          {
            googleSearch: {},
          },
        ],
      },
    },
    3,
    userinfo,
  );

  // Gemini出力の"["から"]"まで囲われたすべての部分を除去
  const responseText = response.text || '';
  const cleanedText = responseText.replace(/\[.*?\]/gs, '');

  return cleanedText;
}

/**
 * 必要に応じて画像を付与して、botたんスコア付きのシングルレスポンスを得る
 */
export function extractJSON(text: string): any {
  try {
    // 1. Markdownのコードブロックを抽出
    const match = text.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      return JSON.parse(match[1]);
    }

    // 2. コードブロックがない場合、最初と最後の括弧を探して抽出
    const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // 3. そのままパースを試みる
    return JSON.parse(text);
  } catch (e) {
    console.warn('JSON parse failed:', text);
    throw new Error('Failed to extract JSON from response');
  }
}

/**
 * 必要に応じて画像を付与して、botたんスコア付きのシングルレスポンスを得る
 */
export async function generateSingleResponseWithScore(
  prompt: string,
  userinfo?: UserInfoGemini,
  requestOptions: GeminiRequestOptions = {},
) {
  const contents: PartListUnion = [prompt];
  // const responseSchema = { ... } // Removed due to conflict with Google Search

  if (userinfo?.image?.length) {
    const { parts, stats } = await buildAffirmativeImageParts(userinfo.image, userinfo.langStr);
    contents.push(...parts);
    console.log('[INFO][GEMINI] Affirmative image input:', stats);
    if (!parts.length) {
      console.warn('[WARN][GEMINI] No auxiliary images could be loaded');
    }
  }

  const tools: any[] = [
    {
      googleSearch: {},
    },
  ];

  const links = userinfo?.embed?.links_embed?.map((link) => link.uri) ?? [];
  if (userinfo?.embed?.uri_embed && !links.includes(userinfo.embed.uri_embed)) {
    links.push(userinfo.embed.uri_embed);
  }
  const useUrlContext = Boolean(
    links.length && (userinfo?.urlContextEnabled ?? Boolean(userinfo?.embed?.uri_embed && userinfo?.isSubscriber)),
  );
  if (useUrlContext) {
    tools.push({
      urlContext: {},
    });
    console.log(`[INFO][GEMINI] URL Context tool enabled for ${links.length} URL(s): ${links.join(', ')}`);
  }

  const request = (requestTools: any[]) =>
    generateContentWithRetry(
      {
        // model / serviceTier は generateContentWithRetry がレジストリと requestOptions から決める
        feature: 'BSKY_AFFIRMATIVE_REPLY' satisfies AiFeatureKey,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          // responseMimeType: "application/json", // Removed
          // responseSchema, // Removed
          tools: requestTools,
        },
      },
      3,
      userinfo,
      requestOptions,
    );
  let response;
  try {
    response = await request(tools);
  } catch (error) {
    if (!useUrlContext) throw error;
    console.warn('[WARN][GEMINI] URL Context request failed; retrying with card metadata only', error);
    response = await request([{ googleSearch: {} }]);
  }

  const result = extractJSON(response.text || '') as GeminiScore[];

  // Gemini出力の"["から"]"まで囲われたすべての部分を除去
  // (検索引用などが残っていた場合のクリーニング)
  if (Array.isArray(result)) {
    result.forEach((item) => {
      if (item.comment) {
        item.comment = item.comment.replace(/\[.*?\]/gs, '');
      }
    });
    return result[0];
  } else {
    // 配列でない場合（単一オブジェクトで返ってきた場合など）のフォールバック
    const singleResult = result as unknown as GeminiScore;
    if (singleResult.comment) {
      singleResult.comment = singleResult.comment.replace(/\[.*?\]/gs, '');
    }
    return singleResult;
  }
}

// Extracted to shared-configs

/**
 * テキスト内のURLの前後に半角スペースを保証する（Bluesky誤パース防止）
 * URLの末尾に混入した句読点・括弧類も除去する
 */
export const normalizeUrlSpacing = (text: string): string =>
  text
    .replace(/https?:\/\/[^\s]+/g, (url) => url.replace(/[.。、，,！？!?「」『』【】（）\[\]{}]+$/, ''))
    .replace(/([^\s])(https?:\/\/)/g, '$1 $2')
    .replace(/(https?:\/\/[\x21-\x7E]+)([^\s\x00-\x7F])/g, '$1 $2');

/**
 * JSONレスポンスの生成とパースを行う共通ヘルパー
 * パースに失敗した場合は例外を投げ、callbacks.tsの共通リトライ機構に処理を委ねます。
 */
export async function generateSingleResponseJSON<T>(
  prompt: string,
  userinfo: UserInfoGemini | undefined,
  parser: (text: string) => T,
  feature: AiFeatureKey,
): Promise<T> {
  const responseText = await generateSingleResponse(prompt, userinfo, feature);
  return parser(responseText);
}
