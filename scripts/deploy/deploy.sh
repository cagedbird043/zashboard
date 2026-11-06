#!/usr/bin/env bash
# SSH config supplies the fixed host/user, key, port and pinned known_hosts.
# Usage: bash scripts/deploy/deploy.sh DIST COMMIT_SHA SSH_CONFIG_TARGET
# stdin: one short-lived descriptor from artifact.py; no URL/token in argv/logs.
set -euo pipefail
if [[ $# != 3 ]]; then
  printf 'Usage: %s DIST COMMIT_SHA SSH_CONFIG_TARGET\n' "$0" >&2
  exit 2
fi
dist=$1
sha=$2
target=$3
[[ $sha =~ ^[0-9a-f]{40}$ ]] || { printf 'Invalid commit SHA\n' >&2; exit 2; }
[[ $target =~ ^[a-zA-Z0-9_][a-zA-Z0-9_.@-]*$ ]] || { printf 'Invalid SSH target\n' >&2; exit 2; }
[[ -d $dist && ! -L $dist ]] || { printf 'Invalid dist directory\n' >&2; exit 2; }
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# Verification is deliberately read-only: a downloaded CI artifact must never
# be re-sealed, which would hide corruption or additions during transport.
python3 "$script_dir/seal.py" --verify "$dist" "$sha"
printf 'Fetching validated artifact for release %s\n' "$sha"
ssh -o BatchMode=yes -o StrictHostKeyChecking=yes "$target" "fetch $sha"
printf 'Activating and checking release %s\n' "$sha"
ssh -n -o BatchMode=yes -o StrictHostKeyChecking=yes "$target" "activate $sha"
