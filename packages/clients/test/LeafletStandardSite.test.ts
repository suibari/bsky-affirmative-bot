import assert from 'node:assert/strict';
import test from 'node:test';
import type { AtpAgent } from '@atproto/api';
import {
  buildStandardSiteDocument,
  migrateLegacyLeafletDocuments,
  selectLeafletStandardPublication,
  standardSiteDocumentFromLegacy,
} from '../src/LeafletStandardSite.js';

const publicationUri =
  'at://did:plc:test/site.standard.publication/3mmt3fthntk2k';

const publicationRecord = {
  uri: publicationUri,
  value: {
    $type: 'site.standard.publication',
    url: 'https://bot-tan.leaflet.pub/',
    name: 'Bot-tan Diary',
  },
};

const legacyValue = {
  $type: 'pub.leaflet.document',
  title: '日記1日目',
  description: '説明',
  publishedAt: '2026-05-27T00:00:00.000Z',
  pages: [
    {
      $type: 'pub.leaflet.pages.linearDocument',
      blocks: [
        {
          $type: 'pub.leaflet.pages.linearDocument#block',
          block: { $type: 'pub.leaflet.blocks.text', plaintext: 'こんにちは' },
        },
        {
          $type: 'pub.leaflet.pages.linearDocument#block',
          block: { $type: 'pub.leaflet.blocks.text', plaintext: 'また明日' },
        },
      ],
    },
  ],
};

test('selects the sole Leaflet standard.site publication', () => {
  const selected = selectLeafletStandardPublication([
    {
      uri: 'at://did:plc:test/site.standard.publication/nagi',
      value: {
        $type: 'site.standard.publication',
        url: 'https://nagi.suibari.com',
        name: 'Nagi',
      },
    },
    publicationRecord,
  ]);

  assert.equal(selected.uri, publicationUri);
  assert.equal(selected.value.url, 'https://bot-tan.leaflet.pub/');
});

test('uses an explicit publication URL and rejects ambiguity', () => {
  const second = {
    uri: 'at://did:plc:test/site.standard.publication/second',
    value: {
      $type: 'site.standard.publication',
      url: 'https://other.leaflet.pub',
      name: 'Other',
    },
  };

  assert.equal(
    selectLeafletStandardPublication(
      [publicationRecord, second],
      'https://bot-tan.leaflet.pub',
    ).uri,
    publicationUri,
  );
  assert.throws(
    () => selectLeafletStandardPublication([publicationRecord, second]),
    /Multiple Leaflet-hosted/,
  );
});

test('builds a standard.site document with Leaflet content and plaintext', () => {
  const record = standardSiteDocumentFromLegacy(
    legacyValue,
    'legacy-rkey',
    publicationUri,
  );

  assert.deepEqual(record, {
    $type: 'site.standard.document',
    site: publicationUri,
    path: '/legacy-rkey',
    title: '日記1日目',
    publishedAt: '2026-05-27T00:00:00.000Z',
    description: '説明',
    textContent: 'こんにちは\n\nまた明日',
    content: {
      $type: 'pub.leaflet.content',
      pages: legacyValue.pages,
    },
  });
});

test('builds the same shape for newly generated pages', () => {
  const record = buildStandardSiteDocument({
    rkey: 'new-rkey',
    site: publicationUri,
    title: 'Diary Day 2',
    description: 'Description',
    publishedAt: '2026-05-28T00:00:00.000Z',
    pages: legacyValue.pages,
  });

  assert.equal(record.$type, 'site.standard.document');
  assert.equal(record.path, '/new-rkey');
  assert.equal(record.content.$type, 'pub.leaflet.content');
  assert.equal(record.textContent, 'こんにちは\n\nまた明日');
});

test('migration is idempotent and preserves legacy records', async () => {
  const writes: Array<Record<string, unknown>> = [];
  const legacyRecords = [
    {
      uri: 'at://did:plc:test/pub.leaflet.document/already-there',
      value: legacyValue,
    },
    {
      uri: 'at://did:plc:test/pub.leaflet.document/to-migrate',
      value: { ...legacyValue, title: 'Diary Day 2' },
    },
  ];
  const collections: Record<string, Array<{ uri: string; value: Record<string, unknown> }>> = {
    'site.standard.publication': [publicationRecord],
    'pub.leaflet.document': legacyRecords,
    'site.standard.document': [
      {
        uri: 'at://did:plc:test/site.standard.document/already-there',
        value: {},
      },
    ],
  };
  const agent = {
    api: {
      com: {
        atproto: {
          repo: {
            listRecords: async ({ collection }: { collection: string }) => ({
              data: { records: collections[collection] ?? [] },
            }),
            putRecord: async (input: Record<string, unknown>) => {
              writes.push(input);
              return { data: { uri: `at://did:plc:test/site.standard.document/${input.rkey}` } };
            },
          },
        },
      },
    },
  } as unknown as AtpAgent;

  const dryRun = await migrateLegacyLeafletDocuments(agent, {
    did: 'did:plc:test',
  });
  assert.deepEqual(
    {
      dryRun: dryRun.dryRun,
      legacyCount: dryRun.legacyCount,
      existingStandardCount: dryRun.existingStandardCount,
      eligible: dryRun.eligible,
      created: dryRun.created,
      skipped: dryRun.skipped,
      failures: dryRun.failures,
    },
    {
      dryRun: true,
      legacyCount: 2,
      existingStandardCount: 1,
      eligible: 1,
      created: 0,
      skipped: 1,
      failures: [],
    },
  );
  assert.equal(writes.length, 0);

  const applied = await migrateLegacyLeafletDocuments(agent, {
    did: 'did:plc:test',
    apply: true,
  });
  assert.equal(applied.created, 1);
  assert.equal(applied.skipped, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].collection, 'site.standard.document');
  assert.equal(writes[0].rkey, 'to-migrate');
});
