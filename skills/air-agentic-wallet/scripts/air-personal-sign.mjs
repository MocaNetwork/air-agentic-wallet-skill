#!/usr/bin/env node
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
  node air-personal-sign.mjs --message "Hello world"
  node air-personal-sign.mjs "Hello world"

Required:
  --message            Plain text or 0x-prefixed hex message to sign

Optional:
  --config             Path to .air-wallet-config.json
  --private-key        Path to agent P-256 private key PEM
  --public-key         Path to agent public key PEM
  --user-id            Override AIR userId
  --wallet-id          Override AIR walletId
  --privy-app-id       Override AIR Privy app id
  --agent-sign-url     Override full AIR /v2/wallet/agent-sign URL

Config fallback order:
  CLI flags -> environment variables -> .air-wallet-config.json
`);
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }
  const context = await loadAirContext(args);
  const keys = await loadAgentKeys(args);
  const message =
    args.message ??
    (args._.length > 0 ? args._.join(" ") : undefined) ??
    process.env.AIR_MESSAGE;

  assertRequired(message, "Provide a message via --message or positional args.");

  const result = await signWithAir({
    context,
    keys,
    method: "personal_sign",
    payload: message,
  });

  printJson({
    method: "personal_sign",
    inputMessage: message,
    signature: result.signature,
    airApiAgentSignUrl: context.airApiAgentSignUrl,
  });
}

main().catch((error) => {
  console.error(error?.stack || error);
  process.exit(1);
});
