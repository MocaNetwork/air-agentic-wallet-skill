# Testing and Support Matrix

This document defines what is currently tested and officially supported for this repository.

## What's tested

The following flows are validated end-to-end on Base Sepolia (`84532`):

- Agent authentication flow with fresh `signedMessage` + canonical payload signing
- Wallet signature requests via `POST /v2/wallet/agent-sign` for:
  - plain message signing (`personal_sign`)
  - typed data signing (`eth_signTypedData_v4`)
  - onchain UserOp signing (`userOpHash`)
- ERC-4337 wallet actions through bundler submission:
  - native and ERC-20 transfers
  - ERC-20/ERC-721/ERC-1155 approvals (including ERC404-compatible approval/read paths)
  - ERC-721/ERC-1155 NFT transfers
  - arbitrary contract execution through the smart account
- Asset and ownership reads for native, ERC-20, ERC-721, and ERC-1155

## What's supported

Currently supported networks:

- Ethereum `1`
- Sepolia `11155111`
- Base `8453`
- Base Sepolia `84532`
- BNB Smart Chain `56`
- BNB Smart Chain Testnet `97`
- Gnosis `100`

All supported chains other than Base Sepolia are currently "supported but not yet validated in this repo's end-to-end test pass".

## Harness and models

Validated test harness:

- Cursor CLI (with this repository skill package and bundled Node scripts)

Validated models:

- Opus 4.6
- Sonnet 4.6
- Sonnet 4.5
- Codex 5.2
- Kimi K2.5

Intended harness support:

- Any harness that supports `.agent/skills` (for example: Cursor, Claude Code, and Codex).
