#!/usr/bin/env bash
set -euo pipefail

# Only the pinned Linux/amd64 archive is used; cached archives are verified again.
script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
metadata=$(node -e '
  const release = require(process.argv[1]);
  if (!/^[a-f0-9]{64}$/.test(release.sha256) || release.tag !== "v" + release.version ||
      !/^[a-f0-9]{40}$/.test(release.commit)) throw new Error("Invalid pinned release");
  console.log([release.url, release.sha256, release.version, release.commit].join("\t"));
' "$script_dir/sing-box-release.json")
IFS=$'\t' read -r url sha256 version commit <<< "$metadata"
mkdir -p -- "${1:-$script_dir/../../.cache/sing-box}"
target=$(cd -- "${1:-$script_dir/../../.cache/sing-box}" && pwd)
staging=$(mktemp -d "$target/.download.XXXXXXXX")
trap 'rm -rf -- "$staging"' EXIT
archive="$target/sing-box.tar.gz"
if [[ ! -f "$archive" ]]; then
  curl --fail --location --show-error --retry 3 --output "$staging/archive.tar.gz" "$url" >&2
  printf '%s  %s\n' "$sha256" "$staging/archive.tar.gz" | sha256sum --check >&2
  mv -- "$staging/archive.tar.gz" "$archive"
else
  printf '%s  %s\n' "$sha256" "$archive" | sha256sum --check >&2
fi
member=sing-box-cagedbird-linux-amd64
tar -xzf "$archive" -C "$staging" "$member/sing-box" "$member/BUILD-INFO.txt"
grep -Fx -- "version=$version" "$staging/$member/BUILD-INFO.txt" >&2
grep -Fx -- "commit=$commit" "$staging/$member/BUILD-INFO.txt" >&2
install -m 0755 -- "$staging/$member/sing-box" "$target/sing-box"
printf '%s\n' "$target/sing-box"
