#!/bin/sh
# Fanaa installer — curl | sh
#
#   curl -fsSL https://raw.githubusercontent.com/FirozChauhan/fanaa/main/install.sh | sh
#   curl -fsSL https://raw.githubusercontent.com/FirozChauhan/fanaa/main/install.sh | sh -s -- v0.8.1
#
# Downloads the prebuilt fanaa binary for this OS/arch from the latest
# GitHub release (or a pinned version), verifies its SHA-256 against the
# release's SHA256SUMS, and installs it to $FANAA_BIN (~/.local/bin).
#
# Env overrides: FANAA_BIN (install dir), FANAA_VERSION (version to install),
# FANAA_REPO (owner/repo, default FirozChauhan/fanaa), FANAA_BASE (download base URL,
# defaults to the GitHub release URL — set it to test against a mirror).

set -eu

REPO="${FANAA_REPO:-FirozChauhan/fanaa}"
VERSION="${FANAA_VERSION:-${1:-}}"
INSTALL_DIR="${FANAA_BIN:-$HOME/.local/bin}"
BASE="${FANAA_BASE:-https://github.com/$REPO/releases/download}"

# --- fail loudly on any missing prerequisite -----------------------------
for cmd in curl uname; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "fanaa: required command not found: $cmd" >&2
    exit 1
  fi
done

# --- detect OS + arch -----------------------------------------------------
OS="$(uname -s)"
ARCH="$(uname -m)"
case "$OS" in
  Linux)  PLAT="linux" ;;
  Darwin) PLAT="darwin" ;;
  MINGW*|MSYS*|CYGWIN*) PLAT="windows" ;;
  *) echo "fanaa: unsupported OS: $OS" >&2; exit 1 ;;
esac
case "$ARCH" in
  x86_64|amd64)  HARCH="x64" ;;
  aarch64|arm64) HARCH="arm64" ;;
  *) echo "fanaa: unsupported architecture: $ARCH" >&2; exit 1 ;;
esac
if [ "$PLAT" = "windows" ]; then
  # Windows is only built for x64; the rest of this script still works under
  # MSYS/Cygwin (curl is present). The binary lands as fanaa.exe.
  [ "$HARCH" = "arm64" ] && { echo "fanaa: no Windows arm64 build" >&2; exit 1; }
  EXE=".exe"
else
  EXE=""
fi
ASSET="fanaa-$PLAT-$HARCH$EXE"
echo "fanaa: installing $ASSET${VERSION:+ (version $VERSION)} to $INSTALL_DIR"

# --- resolve version (default: latest release) ----------------------------
if [ -z "$VERSION" ]; then
  echo "fanaa: resolving latest release…"
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$TAG" ] || { echo "fanaa: could not resolve latest release" >&2; exit 1; }
  VERSION="$TAG"
fi
# normalize: accept "0.8.1" or "v0.8.1"
case "$VERSION" in v*) ;; *) VERSION="v$VERSION" ;; esac

# --- download + verify ----------------------------------------------------
TMP="$(mktemp -d 2>/dev/null || mktemp -d /tmp/fanaa.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

echo "fanaa: downloading $BASE/$VERSION/$ASSET"
curl -fsSL "$BASE/$VERSION/$ASSET" -o "$TMP/$ASSET"
curl -fsSL "$BASE/$VERSION/SHA256SUMS" -o "$TMP/SHA256SUMS"

if command -v sha256sum >/dev/null 2>&1; then
  CHECK="sha256sum -c"
elif command -v shasum >/dev/null 2>&1; then
  CHECK="shasum -a 256 -c"
else
  echo "fanaa: no sha256sum/shasum available — refusing to install unverified binary" >&2
  exit 1
fi
# verify the downloaded asset against the release's checksum file
# (sha256sum -c reads the checksums FROM SHA256SUMS; --ignore-missing
# only checks the file we actually downloaded).
if ! (cd "$TMP" && $CHECK --ignore-missing SHA256SUMS >/dev/null 2>&1); then
  echo "fanaa: SHA-256 verification failed for $ASSET — aborting" >&2
  exit 1
fi
echo "fanaa: checksum OK"

chmod +x "$TMP/$ASSET"

# --- install --------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
INSTALLED="$INSTALL_DIR/fanaa$EXE"
mv -f "$TMP/$ASSET" "$INSTALLED"

# --- post-install sanity --------------------------------------------------
if [ -z "$EXE" ]; then
  if "$INSTALLED" --version >/dev/null 2>&1; then
    echo "fanaa: installed $("$INSTALLED" --version) at $INSTALLED"
  else
    echo "fanaa: installed, but the binary did not run cleanly — check $INSTALLED" >&2
    exit 1
  fi
fi

# journal store — created lazily on first run, but make it now so the TUI's
# first launch never has to.
mkdir -p "$HOME/.fanaa"

# --- PATH hint -------------------------------------------------------------
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo
    echo "fanaa: $INSTALL_DIR is not on your PATH."
    case "$(basename "$SHELL" 2>/dev/null || echo sh)" in
      zsh) echo "       add to ~/.zshrc:  export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
      bash) echo "       add to ~/.bashrc: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
      *) echo "       add to your shell rc: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    esac
    ;;
esac

echo "fanaa: done — run 'fanaa tui' to write your first letter."
