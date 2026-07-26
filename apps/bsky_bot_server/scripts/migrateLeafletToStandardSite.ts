import { migrateLegacyLeafletDocuments } from '@bsky-affirmative-bot/clients';
import { agent, initAgent } from '../src/bsky/agent.js';

const apply = process.argv.includes('--apply');

function printReport(report: Awaited<ReturnType<typeof migrateLegacyLeafletDocuments>>) {
  console.log(JSON.stringify(report, null, 2));
}

async function main() {
  await initAgent();
  const did = agent.session?.did;
  if (!did) throw new Error('Authenticated session DID is missing');

  console.log(
    apply
      ? '[LEAFLET MIGRATION] Apply mode: standard.site records will be created.'
      : '[LEAFLET MIGRATION] Dry-run mode: no records will be written. Pass --apply to migrate.',
  );

  const report = await migrateLegacyLeafletDocuments(agent, {
    did,
    publicationUrl: process.env.LEAFLET_PUBLICATION_URL,
    apply,
    onProgress: (message) => console.log(`[LEAFLET MIGRATION] ${message}`),
  });
  printReport(report);

  if (report.failures.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[LEAFLET MIGRATION] Fatal error:', error);
  process.exitCode = 1;
});
