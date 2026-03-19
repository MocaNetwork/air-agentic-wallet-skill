#!/usr/bin/env node
import fs from "node:fs/promises";
import process from "node:process";

import {
  assertRequired,
  loadAgentKeys,
  loadAirContext,
  parseArgs,
  printJson,
  signWithAir,
} from "./air-common.mjs";

function printHelp() {
  console.log(`Usage:
  node air-sign-typed-data.mjs --typed-data-file typed-data.json
  node air-sign-typed-data.mjs --typed-data-json '{"domain":{},"primaryType":"Action","types":{},"message":{}}'

Required:
  --typed-data-file    Path to typed data JSON file
  or
  --typed-data-json    Inline typed data JSON string

Optional:
  --config             Path to .air-wallet-config.json
  --private-key        Path to agent P-256 private key PEM
  --public-key         Path to agent public key PEM
  --user-id            Override AIR userId
  --wallet-id          Override AIR walletId
  --agent-sign-url     Override full AIR /v2/wallet/agent-sign URL

Config fallback order:
  CLI flags -> environment variables -> .air-wallet-config.json
`);
}

async function loadTypedData(args) {
  if (args["typed-data-file"]) {
    return JSON.parse(await fs.readFile(args["typed-data-file"], "utf8"));
  }
  if (args["typed-data-json"]) {
    return JSON.parse(args["typed-data-json"]);
  }
  throw new Error("Provide typed data via --typed-data-file or --typed-data-json.");
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const context = await loadAirContext(args);
  const keys = await loadAgentKeys(args);
  const typedData = await loadTypedData(args);

  assertRequired(
    typedData.primaryType ?? typedData.primary_type,
    "Typed data must include primaryType or primary_type.",
  );

  const result = await signWithAir({
    context,
    keys,
    method: "eth_signTypedData_v4",
    payload: typedData,
  });

  printJson({
    method: "eth_signTypedData_v4",
    primaryType: typedData.primaryType ?? typedData.primary_type,
    signature: result.signature,
    airApiAgentSignUrl: context.airApiAgentSignUrl,
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
