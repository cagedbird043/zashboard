#!/usr/bin/env bash
set -euo pipefail
umask 022

ZASHBOARD_STATE_DIR="${ZASHBOARD_STATE_DIR:-/var/lib/zashboard}"
ZASHBOARD_RUNTIME_DIR="${ZASHBOARD_RUNTIME_DIR:-/srv/zashboard-runtime}"
ZASHBOARD_REPO="${ZASHBOARD_REPO:-https://github.com/cagedbird043/zashboard.git}"
ZASHBOARD_BRANCH="${ZASHBOARD_BRANCH:-cagedbird/providers}"

repo="$ZASHBOARD_STATE_DIR/repository"
builds="$ZASHBOARD_STATE_DIR/builds"
runtime="$ZASHBOARD_RUNTIME_DIR"
releases="$runtime/releases"
branch="$ZASHBOARD_BRANCH"
remote="$ZASHBOARD_REPO"

mkdir -p "$builds" "$releases"
if [[ ! -d "$repo/.git" ]]; then
  git -c core.hooksPath=/dev/null clone --filter=blob:none --no-checkout "$remote" "$repo"
fi

git -C "$repo" remote set-url origin "$remote"
git -C "$repo" -c core.hooksPath=/dev/null fetch --prune origin "refs/heads/$branch"
revision=$(git -C "$repo" rev-parse --verify FETCH_HEAD)
release="$releases/$revision"
current="$runtime/current"

if [[ -L "$current" ]] && [[ $(readlink "$current") == "releases/$revision" ]] && [[ -f "$release/index.html" ]]; then
  printf 'zashboard already current at %s\n' "$revision"
  exit 0
fi

if [[ ! -f "$release/index.html" ]]; then
  source_dir="$builds/$revision/source"
  stage="$releases/.$revision.tmp"
  git -C "$repo" worktree remove --force "$source_dir" 2>/dev/null || true
  git -C "$repo" worktree prune
  rm -rf "$builds/$revision" "$stage" "$release"
  mkdir -p "$builds/$revision" "$stage"
  git -C "$repo" worktree add --detach "$source_dir" "$revision"

  cd "$source_dir"
  pnpm install --frozen-lockfile --ignore-scripts
  pnpm run build

  test -f dist/index.html
  cp -a dist/. "$stage/"
  printf '%s\n' "$revision" > "$stage/.source-revision"
  mv "$stage" "$release"
  git -C "$repo" worktree remove --force "$source_dir"
  rm -rf "$builds/$revision"
fi

if [[ -L "$current" ]] && [[ -f "$current/index.html" ]]; then
  previous_target=$(readlink "$current")
  if [[ "$previous_target" != "releases/$revision" ]]; then
    rm -f "$runtime/.previous-$revision"
    ln -s "$previous_target" "$runtime/.previous-$revision"
    mv -Tf "$runtime/.previous-$revision" "$runtime/previous"
  fi
fi

rm -f "$runtime/.current-$revision"
ln -s "releases/$revision" "$runtime/.current-$revision"
mv -Tf "$runtime/.current-$revision" "$current"
printf 'zashboard activated %s\n' "$revision"
