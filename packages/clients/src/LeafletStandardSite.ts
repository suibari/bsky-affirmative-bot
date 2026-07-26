import type { AtpAgent } from '@atproto/api';

export const STANDARD_SITE_PUBLICATION = 'site.standard.publication';
export const STANDARD_SITE_DOCUMENT = 'site.standard.document';
export const LEGACY_LEAFLET_DOCUMENT = 'pub.leaflet.document';
export const LEAFLET_CONTENT = 'pub.leaflet.content';

type RepoRecord = {
  uri: string;
  value: Record<string, unknown>;
};

export type StandardSitePublication = {
  uri: string;
  rkey: string;
  value: {
    $type?: string;
    url: string;
    name: string;
    [key: string]: unknown;
  };
};

export type StandardSiteDocumentInput = {
  rkey: string;
  site: string;
  title: string;
  publishedAt: string;
  pages: unknown[];
  description?: string;
  tags?: string[];
  coverImage?: unknown;
  bskyPostRef?: unknown;
};

export type LegacyLeafletMigrationFailure = {
  rkey: string;
  error: string;
};

export type LegacyLeafletMigrationReport = {
  dryRun: boolean;
  legacyCount: number;
  existingStandardCount: number;
  eligible: number;
  created: number;
  skipped: number;
  failures: LegacyLeafletMigrationFailure[];
  publicationUri: string;
  publicationUrl: string;
};

export type LegacyLeafletMigrationOptions = {
  did: string;
  publicationUrl?: string;
  apply?: boolean;
  onProgress?: (message: string) => void;
};

const rkeyOf = (uri: string) => uri.slice(uri.lastIndexOf('/') + 1);

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

function isLeafletUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return hostname === 'leaflet.pub' || hostname.endsWith('.leaflet.pub');
  } catch {
    return false;
  }
}

async function listAllRecords(
  agent: AtpAgent,
  did: string,
  collection: string,
): Promise<RepoRecord[]> {
  const records: RepoRecord[] = [];
  let cursor: string | undefined;

  do {
    const response = await agent.api.com.atproto.repo.listRecords({
      repo: did,
      collection,
      limit: 100,
      cursor,
    });
    records.push(
      ...response.data.records.map((record) => ({
        uri: record.uri,
        value: record.value as Record<string, unknown>,
      })),
    );
    cursor = response.data.cursor;
  } while (cursor);

  return records;
}

/**
 * Select the Leaflet-hosted standard.site publication without accidentally
 * attaching a document to another application's publication.
 */
export function selectLeafletStandardPublication(
  records: readonly RepoRecord[],
  expectedUrl?: string,
): StandardSitePublication {
  const publications = records
    .filter((record) => {
      const value = record.value;
      return (
        value.$type === STANDARD_SITE_PUBLICATION &&
        typeof value.url === 'string' &&
        typeof value.name === 'string'
      );
    })
    .map((record) => ({
      uri: record.uri,
      rkey: rkeyOf(record.uri),
      value: record.value as StandardSitePublication['value'],
    }));

  if (expectedUrl) {
    const normalizedExpectedUrl = normalizeUrl(expectedUrl);
    const matches = publications.filter(
      (publication) => normalizeUrl(publication.value.url) === normalizedExpectedUrl,
    );
    if (matches.length === 1) return matches[0];
    if (matches.length === 0) {
      throw new Error(
        `No ${STANDARD_SITE_PUBLICATION} record matches LEAFLET_PUBLICATION_URL=${normalizedExpectedUrl}`,
      );
    }
    throw new Error(
      `Multiple ${STANDARD_SITE_PUBLICATION} records match LEAFLET_PUBLICATION_URL=${normalizedExpectedUrl}`,
    );
  }

  const leafletPublications = publications.filter((publication) =>
    isLeafletUrl(publication.value.url),
  );
  if (leafletPublications.length === 1) return leafletPublications[0];
  if (leafletPublications.length === 0) {
    throw new Error(
      `No Leaflet-hosted ${STANDARD_SITE_PUBLICATION} record found. Create one in Leaflet before publishing.`,
    );
  }
  throw new Error(
    `Multiple Leaflet-hosted ${STANDARD_SITE_PUBLICATION} records found. Set LEAFLET_PUBLICATION_URL to select one.`,
  );
}

export async function findLeafletStandardPublication(
  agent: AtpAgent,
  did: string,
  expectedUrl?: string,
): Promise<StandardSitePublication> {
  const records = await listAllRecords(agent, did, STANDARD_SITE_PUBLICATION);
  return selectLeafletStandardPublication(records, expectedUrl);
}

function collectPlaintext(value: unknown, output: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectPlaintext(item, output);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const object = value as Record<string, unknown>;
  if (typeof object.plaintext === 'string' && object.plaintext.trim()) {
    output.push(object.plaintext.trim());
    return;
  }
  for (const child of Object.values(object)) collectPlaintext(child, output);
}

export function textContentFromLeafletPages(pages: unknown[]): string {
  const paragraphs: string[] = [];
  collectPlaintext(pages, paragraphs);
  return paragraphs.join('\n\n');
}

export function buildStandardSiteDocument(input: StandardSiteDocumentInput) {
  const textContent = textContentFromLeafletPages(input.pages);
  return {
    $type: STANDARD_SITE_DOCUMENT,
    site: input.site,
    path: `/${input.rkey}`,
    title: input.title,
    publishedAt: input.publishedAt,
    ...(input.description ? { description: input.description } : {}),
    ...(textContent ? { textContent } : {}),
    content: {
      $type: LEAFLET_CONTENT,
      pages: input.pages,
    },
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.coverImage !== undefined ? { coverImage: input.coverImage } : {}),
    ...(input.bskyPostRef !== undefined ? { bskyPostRef: input.bskyPostRef } : {}),
  };
}

export function standardSiteDocumentFromLegacy(
  value: Record<string, unknown>,
  rkey: string,
  site: string,
) {
  if (typeof value.title !== 'string' || !value.title) {
    throw new Error('Legacy document has no title');
  }
  if (typeof value.publishedAt !== 'string' || !value.publishedAt) {
    throw new Error('Legacy document has no publishedAt');
  }
  if (!Array.isArray(value.pages)) {
    throw new Error('Legacy document has no pages');
  }

  return buildStandardSiteDocument({
    rkey,
    site,
    title: value.title,
    publishedAt: value.publishedAt,
    pages: value.pages,
    ...(typeof value.description === 'string' && value.description
      ? { description: value.description }
      : {}),
    ...(Array.isArray(value.tags) && value.tags.every((tag) => typeof tag === 'string')
      ? { tags: value.tags as string[] }
      : {}),
    ...(value.coverImage !== undefined ? { coverImage: value.coverImage } : {}),
    ...(value.bskyPostRef !== undefined
      ? { bskyPostRef: value.bskyPostRef }
      : value.postRef !== undefined
        ? { bskyPostRef: value.postRef }
        : {}),
  });
}

export function standardSiteDocumentUrl(publicationUrl: string, rkey: string): string {
  return `${normalizeUrl(publicationUrl)}/${rkey}`;
}

/**
 * Add standard.site copies of legacy Leaflet documents. Legacy records are
 * intentionally retained; Leaflet deduplicates matching DID+rkey records and
 * prefers the standard.site version.
 */
export async function migrateLegacyLeafletDocuments(
  agent: AtpAgent,
  options: LegacyLeafletMigrationOptions,
): Promise<LegacyLeafletMigrationReport> {
  const publication = await findLeafletStandardPublication(
    agent,
    options.did,
    options.publicationUrl,
  );
  const [legacyRecords, standardRecords] = await Promise.all([
    listAllRecords(agent, options.did, LEGACY_LEAFLET_DOCUMENT),
    listAllRecords(agent, options.did, STANDARD_SITE_DOCUMENT),
  ]);
  const standardRkeys = new Set(standardRecords.map((record) => rkeyOf(record.uri)));
  const report: LegacyLeafletMigrationReport = {
    dryRun: options.apply !== true,
    legacyCount: legacyRecords.length,
    existingStandardCount: standardRecords.length,
    eligible: 0,
    created: 0,
    skipped: 0,
    failures: [],
    publicationUri: publication.uri,
    publicationUrl: publication.value.url,
  };

  for (const legacyRecord of legacyRecords) {
    const rkey = rkeyOf(legacyRecord.uri);
    if (standardRkeys.has(rkey)) {
      report.skipped++;
      continue;
    }

    let record: ReturnType<typeof standardSiteDocumentFromLegacy>;
    try {
      record = standardSiteDocumentFromLegacy(legacyRecord.value, rkey, publication.uri);
      report.eligible++;
    } catch (error) {
      report.failures.push({
        rkey,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (report.dryRun) continue;

    try {
      await agent.api.com.atproto.repo.putRecord({
        repo: options.did,
        collection: STANDARD_SITE_DOCUMENT,
        rkey,
        validate: false,
        record,
      });
      report.created++;
      standardRkeys.add(rkey);
      options.onProgress?.(`Created ${STANDARD_SITE_DOCUMENT}/${rkey}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.failures.push({ rkey, error: message });
      options.onProgress?.(`Failed ${STANDARD_SITE_DOCUMENT}/${rkey}: ${message}`);
    }
  }

  return report;
}
