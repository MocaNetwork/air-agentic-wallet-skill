#!/usr/bin/env node
import fs from 'node:fs/promises';
import process from 'node:process';

import {
  assertRequired,
  bearerHeaders,
  buildMocaProofChecksum,
  DEFAULT_QUERY_MATCH_ZKP,
  DEFAULT_TX_HASH,
  ensureZkpLength,
  extractTxHashFromVerifyResponse,
  extractZkpStringFromVerifyResponse,
  loadMocaContext,
  parseArgs,
  postJson,
  printJson,
} from './moca-common.mjs';

function printHelp() {
  console.log(`Usage:
  node moca-complete-program.mjs --access-token <token> --program-id <programId>

Required:
  --access-token          Bearer token from moca-create-session
  --program-id            Program ID used for verification

Optional:
  --tx-hash               Transaction hash from verify-by-agent (default: zero hash)
  --zkp                   ZKP string payload
  --zkp-file              Path to a file containing ZKP string or JSON
  --verify-response-file  Path to saved verify-by-agent JSON response (extracts txHash + zkp)
  --proof-api-url         Override Moca Proof API base URL
  --config                Path to .air-wallet-config.json

Notes:
  - checksum is generated as base64(md5("userId.programId.txHashLower.salt"))
  - if txHash/zkp cannot be derived, deterministic defaults are used
`);
}

async function readMaybeJson(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  try {
    return JSON.parse(content);
  } catch {
    return content;
  }
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
  const programId = assertRequired(
    args['program-id'] ?? args._[0],
    'Provide a program ID via --program-id.',
  );

  let verifyResponse;
  if (args['verify-response-file']) {
    verifyResponse = await readMaybeJson(args['verify-response-file']);
  }

  let txHash = args['tx-hash'];
  if (txHash === undefined && verifyResponse && typeof verifyResponse === 'object') {
    txHash = extractTxHashFromVerifyResponse(verifyResponse);
  }
  if (typeof txHash !== 'string' || txHash.length === 0) txHash = DEFAULT_TX_HASH;

  let zkp = args.zkp;
  if (zkp === undefined && args['zkp-file']) {
    const zkpRaw = await readMaybeJson(args['zkp-file']);
    zkp = typeof zkpRaw === 'string' ? zkpRaw : JSON.stringify(zkpRaw);
  }
  if (
    zkp === undefined &&
    verifyResponse &&
    typeof verifyResponse === 'object'
  ) {
    zkp = extractZkpStringFromVerifyResponse(verifyResponse);
  }
  zkp = ensureZkpLength(zkp);
  if (typeof zkp !== 'string' || zkp.length === 0) zkp = DEFAULT_QUERY_MATCH_ZKP;

  const checksum = buildMocaProofChecksum({
    userId: context.userId,
    programId,
    txHash,
  });

  const body = {
    programId,
    txHash,
    checksum,
    zkp,
  };

  const url = `${context.mocaProofApiUrl}/mocaproof/complete`;
  const result = await postJson(url, body, bearerHeaders(accessToken));

  console.log('Program completion submitted successfully.');
  printJson({
    request: { ...body, zkpLength: zkp.length },
    result,
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
