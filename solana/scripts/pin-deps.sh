#!/usr/bin/env bash
# Pin crates incompatible with Solana platform-tools rustc 1.84.
# Run once when Cargo.lock is missing or after `cargo update`.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f Cargo.lock ]]; then
  cargo generate-lockfile
fi
cargo update -p blake3 --precise 1.8.2
cargo update -p constant_time_eq --precise 0.3.1
cargo update -p proc-macro-crate@3.5.0 --precise 3.2.0 2>/dev/null || true
cargo update -p borsh@1.6.1 --precise 1.5.5 2>/dev/null || true
cargo update -p indexmap@2.14.0 --precise 2.11.4 2>/dev/null || true
cargo update -p unicode-segmentation@1.13.2 --precise 1.12.0 2>/dev/null || true
echo "Cargo.lock pinned. Commit it. Build with: anchor build --no-idl"
