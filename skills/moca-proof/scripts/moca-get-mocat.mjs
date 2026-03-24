#!/usr/bin/env node
import process from 'node:process';

import {
  assertRequired,
  bearerHeaders,
  getJson,
  loadMocaContext,
  parseArgs,
  printJson,
} from './moca-common.mjs';

function printHelp() {
  console.log(`Usage:
  node moca-get-mocat.mjs --access-token <token>

Required:
  --access-token       Bearer token from moca-create-session

Optional:
  --proof-api-url      Override Moca Proof API base URL
  --config             Path to .air-wallet-config.json

Config fallback order:
  CLI flags -> environment variables -> .air-wallet-config.json -> staging defaults
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const context = await loadMocaContext(args);
  const accessToken = assertRequired(
    args['access-token'] ?? process.env.MOCA_ACCESS_TOKEN,
    'Provide an access token via --access-token.',
  );

  const url = `${context.mocaProofApiUrl}/mocaproof/mocat`;
  const result = await getJson(url, bearerHeaders(accessToken));

  console.log('\n--- MoCat Status ---\n');
  console.log(`  Current Stage:              ${result.currentStage}`);
  console.log(`  MoCat Rarity:               ${result.mocatRarity ?? 'N/A'}`);
  console.log(`  Verifications Completed:    ${result.verificationsCompleted}`);
  console.log(`  Next Stage Threshold:       ${result.nextStageVerificationThreshold}`);

  if (result.credentialsByCategory?.length > 0) {
    console.log('  Credentials by Category:');
    for (const cat of result.credentialsByCategory) {
      console.log(`    - ${cat.category}: ${cat.count}`);
    }
  }

  if (result.mocatImage) {
    console.log(`  MoCat Image:                ${result.mocatImage}`);
  }

  console.log('');
  printJson(result);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
