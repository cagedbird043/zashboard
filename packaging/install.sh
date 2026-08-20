#!/usr/bin/env bash
set -euo pipefail
umask 022

if [[ $(id -u) -ne 0 ]]; then
  echo "Error: installer must be run as root." >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

ZASHBOARD_USER="${ZASHBOARD_USER:-zashboard-build}"
ZASHBOARD_GROUP="${ZASHBOARD_GROUP:-zashboard-build}"
ZASHBOARD_STATE_DIR="${ZASHBOARD_STATE_DIR:-/var/lib/zashboard}"
ZASHBOARD_RUNTIME_DIR="${ZASHBOARD_RUNTIME_DIR:-/srv/zashboard-runtime}"
ZASHBOARD_RECONCILE_SCRIPT="${ZASHBOARD_RECONCILE_SCRIPT:-/usr/local/libexec/zashboard-reconcile}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
CADDY_CONF_DIR="${CADDY_CONF_DIR:-/etc/caddy/conf.d}"

NODE_VERSION="24.19.0"
NODE_SHA256="14b342e71204f811bde6153be8e04b62aef63c236fef92b55f9c83154b409647"
NODE_PREFIX="/opt/node-v${NODE_VERSION}-linux-x64"
NODE_URL="https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-x64.tar.xz"
PNPM_VERSION="11.20.0"
PNPM_PREFIX="/opt/pnpm-${PNPM_VERSION}"

echo "==> Ensuring system user and group (${ZASHBOARD_USER}:${ZASHBOARD_GROUP})..."
if ! getent group "$ZASHBOARD_GROUP" >/dev/null; then
  groupadd --system "$ZASHBOARD_GROUP"
fi
if ! getent passwd "$ZASHBOARD_USER" >/dev/null; then
  useradd --system --gid "$ZASHBOARD_GROUP" --home-dir "$ZASHBOARD_STATE_DIR" --no-create-home --shell /usr/sbin/nologin "$ZASHBOARD_USER"
fi

echo "==> Preparing state and runtime directories..."
mkdir -p "$ZASHBOARD_STATE_DIR"
chown "$ZASHBOARD_USER:$ZASHBOARD_GROUP" "$ZASHBOARD_STATE_DIR"
chmod 0750 "$ZASHBOARD_STATE_DIR"

mkdir -p "$ZASHBOARD_RUNTIME_DIR" "$ZASHBOARD_RUNTIME_DIR/releases"
chown -R "$ZASHBOARD_USER:$ZASHBOARD_GROUP" "$ZASHBOARD_RUNTIME_DIR"
chmod 0755 "$ZASHBOARD_RUNTIME_DIR" "$ZASHBOARD_RUNTIME_DIR/releases"

echo "==> Ensuring Node.js and pnpm build tools..."
if [[ ! -x "$NODE_PREFIX/bin/node" ]]; then
  mkdir -p /opt /var/cache
  ARCHIVE="/var/cache/node-v${NODE_VERSION}-linux-x64.tar.xz"
  if [[ ! -f "$ARCHIVE" ]]; then
    echo "Downloading Node.js v${NODE_VERSION}..."
    curl -fsSL "$NODE_URL" -o "$ARCHIVE"
  fi
  echo "${NODE_SHA256}  ${ARCHIVE}" | sha256sum -c -
  tar -xJf "$ARCHIVE" -C /opt
fi

if [[ -x "$NODE_PREFIX/bin/node" ]]; then
  ln -sf "$NODE_PREFIX/bin/node" /usr/local/bin/node
  ln -sf "$NODE_PREFIX/bin/npm" /usr/local/bin/npm
  ln -sf "$NODE_PREFIX/bin/npx" /usr/local/bin/npx
fi

if [[ ! -x "$PNPM_PREFIX/bin/pnpm" ]]; then
  mkdir -p "$PNPM_PREFIX"
  npm install --prefix "$PNPM_PREFIX" "pnpm@${PNPM_VERSION}"
fi

if [[ -x "$PNPM_PREFIX/bin/pnpm" ]]; then
  ln -sf "$PNPM_PREFIX/bin/pnpm" /usr/local/bin/pnpm
fi

echo "==> Installing Zashboard reconcile script..."
mkdir -p "$(dirname "$ZASHBOARD_RECONCILE_SCRIPT")"
install -m 0755 -o root -g "$ZASHBOARD_GROUP" "$SCRIPT_DIR/zashboard-reconcile.sh" "$ZASHBOARD_RECONCILE_SCRIPT"

echo "==> Installing systemd units..."
mkdir -p "$SYSTEMD_DIR"
install -m 0644 -o root -g root "$SCRIPT_DIR/systemd/zashboard-reconcile.service" "$SYSTEMD_DIR/zashboard-reconcile.service"
install -m 0644 -o root -g root "$SCRIPT_DIR/systemd/zashboard-reconcile.timer" "$SYSTEMD_DIR/zashboard-reconcile.timer"
systemctl daemon-reload

if [[ -d "$CADDY_CONF_DIR" ]]; then
  echo "==> Installing and validating Caddy configuration snippet..."
  install -m 0644 -o root -g root "$SCRIPT_DIR/caddy/zashboard.caddy" "$CADDY_CONF_DIR/zashboard.caddy"
  caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile
  systemctl reload caddy.service
fi

echo "==> Enabling and starting zashboard-reconcile.timer..."
systemctl enable --now zashboard-reconcile.timer

if [[ ! -f "$ZASHBOARD_RUNTIME_DIR/current/index.html" ]]; then
  echo "==> Triggering initial Zashboard build and reconcile..."
  systemctl start zashboard-reconcile.service
fi

echo "==> Zashboard installation complete."
