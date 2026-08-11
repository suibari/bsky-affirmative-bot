import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { aiModel } from "../packages/shared-configs/src/index.js";
import {
  classifyPredefinedAffirmationStrict,
  predefinedAffirmation,
  selectPredefinedAffirmationIndexStrict,
  type SentimentLabel,
} from "../packages/bot_brain/src/predefinedAffirmation.js";
import {
  classifyPredefinedReply,
  PREDEFINED_REPLY_CLASSIFIER_METHODS,
  PREDEFINED_REPLY_CLASSIFIER_PROMPT_VERSION,
  type PredefinedReplyClassification,
  type PredefinedReplyClassifierMethod,
} from "../apps/bsky_bot_server/src/features/predefinedReplyClassifier.js";
import { fetchSentiment } from "../apps/bsky_bot_server/src/util/negaposi.js";

const LABELS: SentimentLabel[] = [
  "negative",
  "neutral",
  "positive",
  "morning",
  "night",
  "gj",
  "hny",
];
const LLM_METHODS = new Set<PredefinedReplyClassifierMethod>([
  "ollama-seven-way",
  "ollama-special-then-polarity",
  "rules-ollama-three-way",
  "rules-dictionary-ollama-consensus",
]);
const FINALIST_METHODS: PredefinedReplyClassifierMethod[] = [
  "ollama-seven-way",
  "rules-ollama-three-way",
];
const CORPUS_PATH = path.resolve(
  "scripts/fixtures/predefinedReplyEvaluationCases.json",
);

type EvaluationCase = {
  id: string;
  languageName: "日本語" | "English";
  text: string;
  expectedLabel: SentimentLabel;
  difficulty: string;
  concern: string;
  rationale: string;
};

type MethodResult = {
  method: PredefinedReplyClassifierMethod;
  predictedLabel: SentimentLabel | null;
  stability: number | null;
  runs: PredefinedReplyClassification[];
};

type CaseResult = {
  case: EvaluationCase;
  methods: MethodResult[];
  replies: Array<{
    method: PredefinedReplyClassifierMethod;
    blindAlias: string;
    predictedLabel: SentimentLabel | null;
    reply: string | null;
    error: string | null;
  }>;
  historicalLegacyRandomReply: string | null;
};

const hasArg = (name: string): boolean => process.argv.includes(name);
const argValue = (name: string): string | undefined =>
  process.argv
    .find((argument) => argument.startsWith(`${name}=`))
    ?.slice(name.length + 1);

const repetitions = Number.parseInt(argValue("--repetitions") ?? "3", 10);
if (!Number.isInteger(repetitions) || repetitions < 1 || repetitions > 5) {
  throw new Error("--repetitions must be an integer from 1 to 5");
}
const run = hasArg("--run");
const force = hasArg("--force");
const recordDate = argValue("--record");
const reviewOnlyPath = argValue("--review-only");
const extraCorpusPath = argValue("--extra-corpus");
const reviewExtraOnly = hasArg("--review-extra-only");
if (recordDate && !/^\d{4}-\d{2}-\d{2}(?:-[a-z0-9-]+)?$/.test(recordDate)) {
  throw new Error("--record must use YYYY-MM-DD or YYYY-MM-DD-name");
}
if (recordDate && !run) throw new Error("--record requires --run");
if (reviewOnlyPath && (run || recordDate)) {
  throw new Error("--review-only cannot be combined with --run or --record");
}
if (reviewExtraOnly && !extraCorpusPath) {
  throw new Error("--review-extra-only requires --extra-corpus");
}

const isEvaluationCase = (value: unknown): value is EvaluationCase => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<EvaluationCase>;
  return (
    typeof candidate.id === "string" &&
    (candidate.languageName === "日本語" ||
      candidate.languageName === "English") &&
    typeof candidate.text === "string" &&
    LABELS.includes(candidate.expectedLabel as SentimentLabel) &&
    typeof candidate.difficulty === "string" &&
    typeof candidate.concern === "string" &&
    typeof candidate.rationale === "string"
  );
};

async function loadCases(): Promise<{
  cases: EvaluationCase[];
  extraIds: Set<string>;
}> {
  const parsed = JSON.parse(await readFile(CORPUS_PATH, "utf8")) as unknown;
  if (!Array.isArray(parsed) || !parsed.every(isEvaluationCase)) {
    throw new Error("Evaluation corpus has an invalid shape");
  }
  const ids = new Set(parsed.map((item) => item.id));
  if (ids.size !== parsed.length)
    throw new Error("Evaluation case IDs must be unique");
  if (parsed.length !== 112)
    throw new Error(`Expected 112 cases, found ${parsed.length}`);
  for (const [languageName, expectedPerLabel] of [
    ["日本語", 10],
    ["English", 6],
  ] as const) {
    for (const label of LABELS) {
      const count = parsed.filter(
        (item) =>
          item.languageName === languageName && item.expectedLabel === label,
      ).length;
      if (count !== expectedPerLabel) {
        throw new Error(
          `${languageName}/${label} must contain ${expectedPerLabel} cases; found ${count}`,
        );
      }
    }
  }
  if (!extraCorpusPath) return { cases: parsed, extraIds: new Set() };

  const resolvedExtraPath = path.resolve(extraCorpusPath);
  const extra = JSON.parse(await readFile(resolvedExtraPath, "utf8")) as unknown;
  if (!Array.isArray(extra) || !extra.every(isEvaluationCase)) {
    throw new Error("Extra evaluation corpus has an invalid shape");
  }
  const allIds = new Set(parsed.map((item) => item.id));
  for (const item of extra) {
    if (allIds.has(item.id)) {
      throw new Error(`Duplicate evaluation case ID: ${item.id}`);
    }
    allIds.add(item.id);
  }
  return {
    cases: [...parsed, ...extra],
    extraIds: new Set(extra.map((item) => item.id)),
  };
}

const majority = (
  runs: PredefinedReplyClassification[],
): { label: SentimentLabel | null; stability: number | null } => {
  const successful = runs.filter((item) => !item.error);
  if (successful.length === 0) return { label: null, stability: null };
  const counts = new Map<SentimentLabel, number>();
  for (const item of successful) {
    counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort(
    ([labelA, countA], [labelB, countB]) =>
      countB - countA || LABELS.indexOf(labelA) - LABELS.indexOf(labelB),
  );
  return {
    label: ranked[0][0],
    stability: ranked[0][1] / successful.length,
  };
};

const percentile = (values: number[], ratio: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length * ratio) - 1];
};

type ScoredRow = {
  expected: SentimentLabel;
  predicted: SentimentLabel | null;
  languageName: string;
  difficulty: string;
  runs: PredefinedReplyClassification[];
  stability: number | null;
};

function summarizeRows(rows: ScoredRow[]) {
  const confusion = Object.fromEntries(
    LABELS.map((expected) => [
      expected,
      Object.fromEntries(
        [...LABELS, "__error"].map((predicted) => [predicted, 0]),
      ),
    ]),
  ) as Record<string, Record<string, number>>;
  for (const row of rows) {
    confusion[row.expected][row.predicted ?? "__error"] += 1;
  }
  const f1ByLabel = Object.fromEntries(
    LABELS.map((label) => {
      const tp = confusion[label][label];
      const fp = LABELS.reduce(
        (sum, expected) =>
          sum + (expected === label ? 0 : confusion[expected][label]),
        0,
      );
      const fn = Object.entries(confusion[label]).reduce(
        (sum, [predicted, count]) => sum + (predicted === label ? 0 : count),
        0,
      );
      const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
      const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
      return [
        label,
        precision + recall === 0
          ? 0
          : (2 * precision * recall) / (precision + recall),
      ];
    }),
  ) as Record<SentimentLabel, number>;
  const allRuns = rows.flatMap((row) => row.runs);
  const latencies = allRuns.map((item) => item.latencyMs);
  const criticalReversals = rows.filter(
    ({ expected, predicted }) =>
      (expected === "negative" && predicted === "positive") ||
      (expected === "positive" && predicted === "negative"),
  ).length;
  const specialLabels = new Set<SentimentLabel>([
    "morning",
    "night",
    "gj",
    "hny",
  ]);
  const specialFalsePositives = rows.filter(
    ({ expected, predicted }) =>
      !specialLabels.has(expected) &&
      predicted !== null &&
      specialLabels.has(predicted),
  ).length;
  return {
    cases: rows.length,
    accuracy:
      rows.filter((row) => row.predicted === row.expected).length / rows.length,
    macroF1:
      Object.values(f1ByLabel).reduce((sum, value) => sum + value, 0) /
      LABELS.length,
    f1ByLabel,
    confusion,
    criticalReversals,
    specialFalsePositives,
    meanStability:
      rows.reduce((sum, row) => sum + (row.stability ?? 0), 0) / rows.length,
    runErrorRate:
      allRuns.filter((item) => item.error).length / Math.max(1, allRuns.length),
    latencyMs: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    llmCalls: allRuns.reduce((sum, item) => sum + item.llmCalls, 0),
  };
}

function metrics(results: CaseResult[]) {
  return Object.fromEntries(
    PREDEFINED_REPLY_CLASSIFIER_METHODS.map((method) => {
      const rows: ScoredRow[] = results.map((item) => {
        const result = item.methods.find(
          (candidate) => candidate.method === method,
        )!;
        return {
          expected: item.case.expectedLabel,
          predicted: result.predictedLabel,
          languageName: item.case.languageName,
          difficulty: item.case.difficulty,
          runs: result.runs,
          stability: result.stability,
        };
      });
      const byLanguage = Object.fromEntries(
        ["日本語", "English"].map((languageName) => [
          languageName,
          summarizeRows(
            rows.filter((row) => row.languageName === languageName),
          ),
        ]),
      );
      const difficulties = [
        ...new Set(rows.map((row) => row.difficulty)),
      ].sort();
      const byDifficulty = Object.fromEntries(
        difficulties.map((difficulty) => [
          difficulty,
          summarizeRows(rows.filter((row) => row.difficulty === difficulty)),
        ]),
      );
      return [
        method,
        { overall: summarizeRows(rows), byLanguage, byDifficulty },
      ];
    }),
  );
}

const stableIndex = (seed: string, length: number): number =>
  Number.parseInt(
    createHash("sha256").update(seed).digest("hex").slice(0, 8),
    16,
  ) % length;

const blindMapping = (
  seed: string,
): Record<PredefinedReplyClassifierMethod, string> => {
  const ordered = [...PREDEFINED_REPLY_CLASSIFIER_METHODS].sort((a, b) =>
    createHash("sha256")
      .update(`${seed}:${a}`)
      .digest("hex")
      .localeCompare(createHash("sha256").update(`${seed}:${b}`).digest("hex")),
  );
  return Object.fromEntries(
    ordered.map((method, index) => [method, String.fromCharCode(65 + index)]),
  ) as Record<PredefinedReplyClassifierMethod, string>;
};

const escapeTable = (value: string): string =>
  value.replaceAll("|", "\\|").replaceAll("\n", "<br>");

type ReviewReport = {
  createdAt: string;
  repetitions: number;
  cases: CaseResult[];
  blindMapping: Record<PredefinedReplyClassifierMethod, string>;
};

type ReviewOptions = {
  title?: string;
  introduction?: string;
  methods?: PredefinedReplyClassifierMethod[];
  binaryScore?: boolean;
};

function reviewMarkdown(
  report: ReviewReport,
  options: ReviewOptions = {},
): string {
  const methods = new Set(
    options.methods ?? PREDEFINED_REPLY_CLASSIFIER_METHODS,
  );
  const lines = [
    `# ${options.title ?? "定型文分類方式 人手レビュー"}`,
    "",
    `生成日時: ${report.createdAt}`,
    `分類反復回数: ${report.repetitions}`,
    "",
    options.introduction ??
      "返信ごとに 0（不適切・危険）/ 1（不一致・不自然）/ 2（許容可能）/ 3（よく適合）を記入します。同じ返信になった方式は1行にまとめています。方式対応表は採点後に開いてください。",
    "",
  ];
  for (const item of report.cases) {
    lines.push(
      `## ${item.case.id}`,
      "",
      `- 言語: ${item.case.languageName}`,
      `- 期待カテゴリ: ${item.case.expectedLabel}`,
      `- 難度: ${item.case.difficulty}`,
      `- 論点: ${item.case.concern}`,
      `- 本文: ${item.case.text}`,
      "",
      options.binaryScore
        ? "| 方式 | 予測 | 返信 | 判定（採用可能／不適切） | メモ |"
        : "| 方式 | 予測 | 返信 | 点数（0-3） | メモ |",
      options.binaryScore ? "|---|---|---|---|---|" : "|---|---|---|---:|---|",
    );
    const groups = new Map<string, Array<(typeof item.replies)[number]>>();
    for (const reply of item.replies.filter((entry) =>
      methods.has(entry.method),
    )) {
      const key = `${reply.reply ?? "<ERROR>"}\u0000${reply.error ?? ""}`;
      groups.set(key, [...(groups.get(key) ?? []), reply]);
    }
    for (const group of groups.values()) {
      const aliases = group
        .map((entry) => entry.blindAlias)
        .sort()
        .join(", ");
      const labels = [
        ...new Set(group.map((entry) => entry.predictedLabel ?? "error")),
      ]
        .sort()
        .join(", ");
      const text = group[0].error
        ? `ERROR: ${group[0].error}`
        : (group[0].reply ?? "ERROR: reply was not generated");
      lines.push(`| ${aliases} | ${labels} | ${escapeTable(text)} |  |  |`);
    }
    lines.push("");
  }
  lines.push(
    "<details>",
    "<summary>採点後に開く方式対応表</summary>",
    "",
    "| ブラインド名 | 分類方式 |",
    "|---|---|",
    ...Object.entries(report.blindMapping)
      .filter(([method]) =>
        methods.has(method as PredefinedReplyClassifierMethod),
      )
      .sort(([, aliasA], [, aliasB]) => aliasA.localeCompare(aliasB))
      .map(([method, alias]) => `| ${alias} | ${method} |`),
    "",
    "</details>",
    "",
  );
  return lines.join("\n");
}

const isCriticalReversal = (
  expected: SentimentLabel,
  predicted: SentimentLabel | null,
): boolean =>
  (expected === "negative" && predicted === "positive") ||
  (expected === "positive" && predicted === "negative");

const methodResult = (
  item: CaseResult,
  method: PredefinedReplyClassifierMethod,
): MethodResult =>
  item.methods.find((candidate) => candidate.method === method)!;

/**
 * 人手負荷を10〜20件に抑える代表集合。
 * 重大事故と両方式の共倒れを全件含め、残りは日英×7カテゴリを1件ずつ監査する。
 */
function compactReviewCases(cases: CaseResult[]): CaseResult[] {
  const [sevenWay, rulesThreeWay] = FINALIST_METHODS;
  const mandatory = cases.filter((item) => {
    const expected = item.case.expectedLabel;
    const first = methodResult(item, sevenWay).predictedLabel;
    const second = methodResult(item, rulesThreeWay).predictedLabel;
    const critical =
      isCriticalReversal(expected, first) ||
      isCriticalReversal(expected, second);
    const bothWrongAndDifferent =
      first !== second && first !== expected && second !== expected;
    return critical || bothWrongAndDifferent;
  });
  const selected = new Map(mandatory.map((item) => [item.case.id, item]));
  const difficultyPriority = [
    "sarcasm",
    "double-negation",
    "quotation",
    "negative-context",
    "mixed",
    "metalinguistic",
    "boundary",
    "emoji",
    "slang",
    "implicit",
    "simple",
  ];
  for (const languageName of ["日本語", "English"] as const) {
    for (const expectedLabel of LABELS) {
      const candidates = cases
        .filter((item) => {
          const first = methodResult(item, sevenWay).predictedLabel;
          const second = methodResult(item, rulesThreeWay).predictedLabel;
          return (
            item.case.languageName === languageName &&
            item.case.expectedLabel === expectedLabel &&
            first === expectedLabel &&
            second === expectedLabel
          );
        })
        .sort((a, b) => {
          const rankA = difficultyPriority.indexOf(a.case.difficulty);
          const rankB = difficultyPriority.indexOf(b.case.difficulty);
          return (
            (rankA < 0 ? difficultyPriority.length : rankA) -
              (rankB < 0 ? difficultyPriority.length : rankB) ||
            a.case.id.localeCompare(b.case.id)
          );
        });
      const representative = candidates[0];
      if (!representative) {
        throw new Error(
          `No shared-correct compact review case for ${languageName}/${expectedLabel}`,
        );
      }
      selected.set(representative.case.id, representative);
    }
  }
  const compact = cases.filter((item) => selected.has(item.case.id));
  if (compact.length < 10 || compact.length > 20) {
    throw new Error(
      `Compact review must contain 10-20 cases; found ${compact.length}`,
    );
  }
  return compact;
}

function compactReviewMarkdown(report: ReviewReport): string {
  return reviewMarkdown(
    { ...report, cases: compactReviewCases(report.cases) },
    {
      title: "定型文分類方式 コンパクト人手レビュー",
      introduction:
        "重大逆転、上位2方式の共倒れ、日英×7カテゴリの代表だけを確認します。分類の正誤はgold labelで自動判定済みです。返信ごとに「採用可能」または「不適切」を記入し、方式対応表は全件判定後に開いてください。",
      methods: FINALIST_METHODS,
      binaryScore: true,
    },
  );
}

async function ensureWritable(paths: string[]) {
  if (force) return;
  for (const outputPath of paths) {
    try {
      await access(outputPath);
      throw new Error(
        `${outputPath} already exists; pass --force to overwrite`,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

async function preflight(): Promise<void> {
  const [dictionary, ollama] = await Promise.allSettled([
    fetchSentiment(["評価用の中立文です。"]).then((response) => {
      if (!Number.isFinite(response.average_sentiments[0])) {
        throw new Error("returned an invalid score");
      }
    }),
    classifyPredefinedAffirmationStrict("This is a neutral evaluation probe."),
  ]);
  const errors: string[] = [];
  if (dictionary.status === "rejected") {
    errors.push(
      `NEGPOSI: ${dictionary.reason instanceof Error ? dictionary.reason.message : String(dictionary.reason)}`,
    );
  }
  if (ollama.status === "rejected") {
    errors.push(
      `Ollama: ${ollama.reason instanceof Error ? ollama.reason.message : String(ollama.reason)}`,
    );
  }
  if (errors.length > 0)
    throw new Error(`Preflight failed: ${errors.join(" | ")}`);
}

async function regenerateReviews(resultsPath: string): Promise<void> {
  const parsed = JSON.parse(
    await readFile(path.resolve(resultsPath), "utf8"),
  ) as {
    createdAt: string;
    repetitions: number;
    cases: CaseResult[];
    blindMapping: Record<PredefinedReplyClassifierMethod, string>;
  };
  if (!Array.isArray(parsed.cases) || parsed.cases.length !== 112) {
    throw new Error("Review source must contain 112 evaluated cases");
  }
  const basePath = path.resolve(resultsPath).replace(/-results\.json$/, "");
  if (basePath === path.resolve(resultsPath)) {
    throw new Error("--review-only path must end with -results.json");
  }
  const compactPath = `${basePath}-review.md`;
  const fullPath = `${basePath}-review-full.md`;
  await ensureWritable([compactPath, fullPath]);
  await writeFile(compactPath, compactReviewMarkdown(parsed), { mode: 0o600 });
  await writeFile(fullPath, reviewMarkdown(parsed), { mode: 0o600 });
  console.log(
    `Compact review (${compactReviewCases(parsed.cases).length} cases): ${compactPath}`,
  );
  console.log(`Full audit review: ${fullPath}`);
}

async function main(): Promise<void> {
  if (reviewOnlyPath) {
    await regenerateReviews(reviewOnlyPath);
    return;
  }
  const loaded = await loadCases();
  const { cases, extraIds } = loaded;
  console.log(
    `Corpus valid: ${cases.length} synthetic cases (${extraIds.size} extra boundary cases)`,
  );
  if (!run) {
    console.log(
      "Dry run only. Start NEGPOSI and Ollama, then pass --run (and optionally --record=YYYY-MM-DD).",
    );
    return;
  }

  console.log("Preflight: checking NEGPOSI and Ollama...");
  await preflight();
  console.log("Preflight passed");

  const createdAt = new Date().toISOString();
  const seed = recordDate ?? createdAt;
  const aliases = blindMapping(seed);
  const results: CaseResult[] = [];
  const replyCache = new Map<string, Promise<string>>();

  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const item = cases[caseIndex];
    console.log(`[${caseIndex + 1}/${cases.length}] ${item.id}`);
    const methodResults: MethodResult[] = [];
    for (const method of PREDEFINED_REPLY_CLASSIFIER_METHODS) {
      const runCount = LLM_METHODS.has(method) ? repetitions : 1;
      const runs: PredefinedReplyClassification[] = [];
      for (let repetition = 0; repetition < runCount; repetition += 1) {
        runs.push(
          await classifyPredefinedReply({
            text: item.text,
            languageName: item.languageName,
            method,
          }),
        );
      }
      const selected = majority(runs);
      methodResults.push({
        method,
        predictedLabel: selected.label,
        stability: selected.stability,
        runs,
      });
      console.log(
        `  ${method}: label=${selected.label ?? "error"} stability=${selected.stability?.toFixed(2) ?? "n/a"} errors=${runs.filter((result) => result.error).length}/${runs.length}`,
      );
    }

    const replies: CaseResult["replies"] = [];
    for (const methodResult of methodResults) {
      if (!methodResult.predictedLabel) {
        replies.push({
          method: methodResult.method,
          blindAlias: aliases[methodResult.method],
          predictedLabel: null,
          reply: null,
          error: "classification failed in every repetition",
        });
        continue;
      }
      const cacheKey = `${item.id}:${methodResult.predictedLabel}`;
      if (!replyCache.has(cacheKey)) {
        console.log(
          `  template-select: label=${methodResult.predictedLabel} source=${methodResult.method}`,
        );
        replyCache.set(
          cacheKey,
          predefinedAffirmation(
            {
              text: item.text,
              languageName: item.languageName,
              displayName:
                item.languageName === "日本語" ? "テストユーザー" : "Test User",
            },
            {
              classify: async () => methodResult.predictedLabel!,
              select: selectPredefinedAffirmationIndexStrict,
            },
          ),
        );
      }
      try {
        replies.push({
          method: methodResult.method,
          blindAlias: aliases[methodResult.method],
          predictedLabel: methodResult.predictedLabel,
          reply: await replyCache.get(cacheKey)!,
          error: null,
        });
      } catch (error) {
        replies.push({
          method: methodResult.method,
          blindAlias: aliases[methodResult.method],
          predictedLabel: methodResult.predictedLabel,
          reply: null,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const legacy = methodResults.find(
      (candidate) => candidate.method === "legacy-dictionary",
    );
    let historicalLegacyRandomReply: string | null = null;
    if (legacy?.predictedLabel) {
      historicalLegacyRandomReply = await predefinedAffirmation(
        {
          text: item.text,
          languageName: item.languageName,
          displayName:
            item.languageName === "日本語" ? "テストユーザー" : "Test User",
        },
        {
          classify: async () => legacy.predictedLabel!,
          select: async (templates) => stableIndex(item.id, templates.length),
        },
      );
    }
    results.push({
      case: item,
      methods: methodResults,
      replies,
      historicalLegacyRandomReply,
    });
  }

  const report = {
    schemaVersion: 2,
    createdAt,
    corpus: {
      path: "scripts/fixtures/predefinedReplyEvaluationCases.json",
      extraPath: extraCorpusPath ?? null,
      baseCases: cases.length - extraIds.size,
      extraCases: extraIds.size,
      cases: cases.length,
      japanese: cases.filter((item) => item.languageName === "日本語").length,
      english: cases.filter((item) => item.languageName === "English").length,
      containsProductionData: false,
    },
    repetitions,
    methods: PREDEFINED_REPLY_CLASSIFIER_METHODS,
    classifierPromptVersion: PREDEFINED_REPLY_CLASSIFIER_PROMPT_VERSION,
    ollamaModel: aiModel("OLLAMA_PREDEFINED_AFFIRMATION"),
    endpointValuesRecorded: false,
    blindMapping: aliases,
    metrics: metrics(results),
    cases: results,
    humanReview: null,
  };

  const outputDirectory = recordDate
    ? path.resolve("docs/evaluations/predefined-reply")
    : tmpdir();
  const prefix = recordDate ?? `predefined-reply-evaluation-${Date.now()}`;
  const resultsPath = path.join(outputDirectory, `${prefix}-results.json`);
  const reviewPath = path.join(outputDirectory, `${prefix}-review.md`);
  const fullReviewPath = path.join(outputDirectory, `${prefix}-review-full.md`);
  await mkdir(outputDirectory, { recursive: true });
  await ensureWritable([resultsPath, reviewPath, fullReviewPath]);
  await writeFile(resultsPath, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o600,
  });
  const extraReviewMethods: PredefinedReplyClassifierMethod[] = [
    "ollama-seven-way",
    "ollama-special-then-polarity",
    "rules-ollama-three-way",
  ];
  const primaryReview = reviewExtraOnly
    ? reviewMarkdown(
        {
          ...report,
          cases: results.filter((item) => extraIds.has(item.case.id)),
        },
        {
          title: "定型文分類方式 挨拶境界レビュー",
          introduction:
            "伝聞・引用・言葉への言及と直接挨拶の境界だけを、関連する3方式で確認します。返信ごとに「採用可能」または「不適切」を記入してください。",
          methods: extraReviewMethods,
          binaryScore: true,
        },
      )
    : compactReviewMarkdown(report);
  await writeFile(reviewPath, primaryReview, { mode: 0o600 });
  await writeFile(fullReviewPath, reviewMarkdown(report), { mode: 0o600 });
  console.log(`Results: ${resultsPath}`);
  console.log(
    reviewExtraOnly
      ? `Boundary review (${extraIds.size} cases): ${reviewPath}`
      : `Compact review (${compactReviewCases(results).length} cases): ${reviewPath}`,
  );
  console.log(`Full audit review: ${fullReviewPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
