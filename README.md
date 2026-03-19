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

The bundled scripts resolve key paths from CLI flags, environment variables, or `.air-wallet-config.json`, and read PEM keys from those paths (commonly `p256-private-key.pem` and `p256-public-key.pem` in the working directory). Local key and config files are intentionally ignored by git.

Generate the P-256 key pair (run in your working directory):

```bash
# Generate a P-256 (secp256r1 / prime256v1) private key
openssl ecparam -name prime256v1 -genkey -noout -out p256-private-key.pem

# Derive the matching public key
openssl ec -in p256-private-key.pem -pubout -out p256-public-key.pem
```

Optional check:

```bash
openssl ec -in p256-private-key.pem -text -noout
openssl ec -pubin -in p256-public-key.pem -text -noout
```

## Notes

- Keep skill implementation files inside `skills/`.
- Put repository-level documentation and metadata at the repo root.
- If you run the bundled Node scripts directly in a project, make sure that project has the required runtime dependencies available, including `viem`.
