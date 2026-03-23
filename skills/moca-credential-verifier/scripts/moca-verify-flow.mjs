#!/usr/bin/env node
import process from 'node:process';

import {
  assertRequired,
  bearerHeaders,
  buildMocaProofChecksum,
  buildSignedMessage,
  DEFAULT_QUERY_MATCH_ZKP,
  extractTxHashFromVerifyResponse,
  getJson,
  loadAgentKeys,
  loadMocaContext,
  normalizeVerifyResponse,
  parseArgs,
  postJson,
  printJson,
} from './moca-common.mjs';

function printHelp() {
  console.log(`Usage:
  node moca-verify-flow.mjs
  node moca-verify-flow.mjs --option-index <n>
  node moca-verify-flow.mjs --program-id <programId>

  Runs the full credential verification flow:
    1. List verification program options with numeric indices
    2. Auto-try top tier first for each selected option
    3. If non-compliant, try next tier in the same option
    4. On first compliant tier: complete program + fetch MoCat
    5. If all tiers fail: print "Sorry, not compliant"

Optional:
  --program-id         Verify only this program ID (no tier fallback)
  --option-index       Verify only one listed option index (1-based)
  --page               Page number for listing (default 1)
  --limit              Items per page for listing (default 50)
  --config             Path to .air-wallet-config.json
  --private-key        Path to agent P-256 private key PEM
  --public-key         Path to agent public key PEM

Config fallback order:
  CLI flags -> environment variables -> .air-wallet-config.json -> staging defaults
`);
}

// ---------------------------------------------------------------------------
// List + option extraction
// ---------------------------------------------------------------------------

function extractOptions(listResult) {
  const options = [];
  let optionIndex = 1;
  for (const item of listResult?.data ?? []) {
    const programs = (item.programs ?? []).map((prog, index) => ({
      tierIndex: index + 1,
      programId: prog.programId,
      issueUrl: prog.issueUrl,
      verified: prog.verified === true,
    }));
    options.push({
      optionIndex,
      name: item.name,
      issuer: item.issuer?.name ?? null,
      category: item.category ?? null,
      programs,
    });
    optionIndex += 1;
  }
  return options;
}

// ---------------------------------------------------------------------------
// Step helpers
// ---------------------------------------------------------------------------

async function createSession(context, keys, programId) {
  console.log('\n=== Step 1: Creating scoped session ===\n');

  const signedMessage = buildSignedMessage({
    userId: context.userId,
    publicKeyPem: keys.publicKeyPem,
    privateKeyPem: keys.privateKeyPem,
  });

  const scope = `${programId},${context.partnerId}`;
  const url = `${context.airApiUrl}/auth/agent/session`;

  const result = await postJson(url, { signedMessage, scope });
  console.log(`Session created. Scope: ${scope}`);
  return result.accessToken;
}

async function listPrograms(context, accessToken, page, limit) {
  console.log('\n=== Step 2: Listing verification programs ===\n');

  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  const url = `${context.vpApiUrl}/vp/mocaproof/search?${params}`;
  const headers = accessToken ? bearerHeaders(accessToken) : {};
  const result = await getJson(url, headers);

  const { data, pagination, meta } = result;
  const mode = accessToken
    ? 'personalized (with access token)'
    : 'public (without access token)';

  console.log(`Mode: ${mode}`);
  console.log(
    `\nPrograms (page ${pagination.page}/${Math.ceil(pagination.total / pagination.limit) || 1}, ${pagination.total} total):\n`,
  );

  let optionIndex = 1;
  for (const item of data) {
    const verifiedTag = item.verified ? ' [VERIFIED]' : '';
    console.log(`  [${optionIndex}] ${item.name}${verifiedTag} — by ${item.issuer?.name ?? 'N/A'}`);
    let tierIndex = 1;
    for (const prog of item.programs ?? []) {
      const pTag = prog.verified ? ' [VERIFIED]' : '';
      console.log(`    (${optionIndex}.${tierIndex}) ${prog.programId}${pTag} | issue: ${prog.issueUrl}`);
      tierIndex += 1;
    }
    optionIndex += 1;
  }

  if (meta) {
    console.log(`\n  User verified count: ${meta.verified}`);
  }
  if (pagination.page * pagination.limit < pagination.total) {
    console.log(`\n  (more results — pass --page ${Number(pagination.page) + 1})`);
  }

  console.log('');
  return result;
}

async function triggerVerify(context, accessToken, programId) {
  console.log('\n=== Step 3: Triggering verification ===\n');
  console.log('Verifying....');

  const url = `${context.mocaChainApiUrl}/credentials/verify-by-agent`;
  let rawResponse;
  try {
    rawResponse = await postJson(
      url,
      { programId, responseMode: 'query_match' },
      bearerHeaders(accessToken),
    );
  } catch (err) {
    if (err.data) {
      rawResponse = err.data;
    } else {
      throw err;
    }
  }
  return normalizeVerifyResponse(rawResponse);
}

async function completeProgram(context, accessToken, programId, verifyRaw) {
  console.log('\n=== Step 4: Completing program (mocaproof) ===\n');
  const txHash = extractTxHashFromVerifyResponse(verifyRaw);
  const zkp = DEFAULT_QUERY_MATCH_ZKP;

  const checksum = buildMocaProofChecksum({
    userId: context.userId,
    programId,
    txHash,
  });

  const url = `${context.mocaProofApiUrl}/mocaproof/complete`;
  const body = { programId, txHash, zkp, checksum };
  const result = await postJson(url, body, bearerHeaders(accessToken));

  console.log('Program completion submitted successfully.');
  return { txHash, checksum, zkpLength: zkp.length, result };
}

async function fetchMocat(context, accessToken) {
  console.log('\n=== Step 5: Fetching MoCat status ===\n');

  const url = `${context.mocaProofApiUrl}/mocaproof/mocat`;
  const result = await getJson(url, bearerHeaders(accessToken));

  console.log(`  Current Stage:              ${result.currentStage}`);
  console.log(`  Verifications Completed:    ${result.verificationsCompleted}`);
  console.log(`  Next Stage Threshold:       ${result.nextStageVerificationThreshold}`);

  if (result.mocatRarity) {
    console.log(`  MoCat Rarity:               ${result.mocatRarity}`);
  }
  if (result.credentialsByCategory?.length > 0) {
    console.log('  Credentials by Category:');
    for (const cat of result.credentialsByCategory) {
      console.log(`    - ${cat.category}: ${cat.count}`);
    }
  }
  if (result.mocatImage) {
    console.log(`  MoCat Image:                ${result.mocatImage}`);
  }

  return result;
}

function shouldTryNextTier(verifyResult) {
  if (verifyResult.normalized === 'non_compliant') return true;
  if (verifyResult.normalized === 'no_vc') return true;
  if (verifyResult.normalized.startsWith('status_bucket:')) return true;
  if (verifyResult.normalized.startsWith('unknown_failure_code:')) return true;
  if (verifyResult.normalized === 'unknown_response') return true;
  if (verifyResult.normalized === 'processing') return true;
  return false;
}

async function attemptProgram(context, keys, option, tier) {
  console.log(
    `\nTrying option [${option.optionIndex}] ${option.name} -> tier ${tier.tierIndex}: ${tier.programId}`,
  );
  const accessToken = await createSession(context, keys, tier.programId);
  const verifyResult = await triggerVerify(context, accessToken, tier.programId);

  if (verifyResult.normalized === 'compliant') {
    const verifierName = option.issuer ?? option.name;
    console.log(`\nOK, verified, ${verifierName} is processing your data`);
    const completion = await completeProgram(
      context,
      accessToken,
      tier.programId,
      verifyResult.raw,
    );
    const mocat = await fetchMocat(context, accessToken);
    return {
      success: true,
      attemptedProgramId: tier.programId,
      verifyResult,
      completion,
      mocat,
    };
  }

  if (shouldTryNextTier(verifyResult)) {
    console.log(
      `Result for ${tier.programId}: ${verifyResult.normalized}. Trying next tier if available...`,
    );
    return {
      success: false,
      attemptedProgramId: tier.programId,
      verifyResult,
    };
  }

  return {
    success: false,
    attemptedProgramId: tier.programId,
    verifyResult,
  };
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  const context = await loadMocaContext(args);
  const keys = await loadAgentKeys(args);
  const page = Number(args.page) || 1;
  const limit = Number(args.limit) || 50;

  // Step 1: list first in public mode so no token is needed.
  const listResult = await listPrograms(context, null, page, limit);
  const options = extractOptions(listResult);
  if (options.length === 0) {
    console.log('\nNo verification options available.');
    process.exit(0);
  }

  // Build candidate options to try.
  let candidateOptions = options;
  const explicitProgramId = args['program-id'] ?? args._[0];
  const explicitOptionIndex = args['option-index']
    ? Number(args['option-index'])
    : undefined;

  if (explicitProgramId) {
    candidateOptions = options
      .map((option) => ({
        ...option,
        programs: option.programs.filter((p) => p.programId === explicitProgramId),
      }))
      .filter((option) => option.programs.length > 0);
    if (candidateOptions.length === 0) {
      throw new Error(`Program ID not found in listing: ${explicitProgramId}`);
    }
  } else if (explicitOptionIndex != null) {
    candidateOptions = options.filter(
      (option) => option.optionIndex === explicitOptionIndex,
    );
    if (candidateOptions.length === 0) {
      throw new Error(`Option index not found: ${explicitOptionIndex}`);
    }
  }

  const attemptLog = [];
  for (const option of candidateOptions) {
    console.log(
      `\n=== Trying option [${option.optionIndex}] ${option.name} (${option.programs.length} tiers) ===`,
    );
    for (const tier of option.programs) {
      const attempt = await attemptProgram(context, keys, option, tier);
      attemptLog.push({
        optionIndex: option.optionIndex,
        optionName: option.name,
        tierIndex: tier.tierIndex,
        programId: tier.programId,
        verifyResult: attempt.verifyResult,
      });

      if (attempt.success) {
        console.log('\n=== Done ===\n');
        printJson({
          selectedOption: option.optionIndex,
          selectedProgramId: tier.programId,
          verifyResult: attempt.verifyResult,
          completion: attempt.completion,
          mocat: attempt.mocat,
          attempts: attemptLog,
        });
        return;
      }
    }
  }

  console.log('\nSorry, not compliant');
  printJson({ attempts: attemptLog });
  process.exit(0);
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
