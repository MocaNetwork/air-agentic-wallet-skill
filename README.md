# AIR Agentic Wallet Skill

This repository packages the `air-agentic-wallet` Cursor skill so users can install it with:

```bash
npx skills add <owner/repo>
```

## What this repo contains

- `skills/air-agentic-wallet/SKILL.md`: the skill instructions Cursor reads
- `skills/air-agentic-wallet/scripts/*.mjs`: reusable helper scripts for signing, balances, transfers, approvals, NFT transfers, and arbitrary execution

## Install

After publishing this repository, install it from Cursor with:

```bash
npx skills add <owner/repo>
```

## Skill purpose

The skill helps an external agent operate AIR agentic wallets by:

- generating fresh AIR auth payloads
- requesting wallet signatures from AIR's `POST /v2/wallet/agent-sign` endpoint
- preparing and submitting ERC-4337 UserOps for common wallet actions

## Repo structure

```text
skills/
  air-agentic-wallet/
    SKILL.md
    scripts/
      air-common.mjs
      air-personal-sign.mjs
      air-sign-typed-data.mjs
      air-balance.mjs
      air-send.mjs
      air-approve.mjs
      air-nft-transfer.mjs
      air-execute.mjs
```

## Local files

The bundled scripts support reading local runtime configuration from `.air-wallet-config.json` and local PEM key files such as `p256-private-key.pem` and `p256-public-key.pem`. Those files are intentionally ignored by git.

## Notes

- Keep skill implementation files inside `skills/`.
- Put repository-level documentation and metadata at the repo root.
- If you run the bundled Node scripts directly in a project, make sure that project has the required runtime dependencies available, including `viem`.
