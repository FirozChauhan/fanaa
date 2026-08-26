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
# FANAA_REPO (owner/repo, default FirozChauhan/fanaa), FANAA_BASE (download
# base URL, defaults to the GitHub release URL — set it to test a mirror).
#
# On a terminal: clears the screen, prints the TUI boot logo in the ember
# palette's amber→gold gradient, and animates a matching gradient progress
# bar while downloading. Falls back to plain text + silent curl when piped
# or logged.

set -eu

REPO="${FANAA_REPO:-FirozChauhan/fanaa}"
VERSION="${FANAA_VERSION:-${1:-}}"
INSTALL_DIR="${FANAA_BIN:-$HOME/.local/bin}"
BASE="${FANAA_BASE:-https://github.com/$REPO/releases/download}"

# --- ANSI color support (TTY + terminfo + NO_COLOR) ------------------------
# Mirrors the TUI's default "ember" palette: amber→gold logo gradient,
# accent checks, gold highlights, paper body text.
if [ -t 1 ] && [ -z "${NO_COLOR:-}" ] && command -v tput >/dev/null 2>&1 \
  && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  C=1
else
  C=0
fi
ESC=$(printf '\033')
RESET="${ESC}[0m"
# ember palette (theme.tsx) as 24-bit RGB
AMBER="38;2;201;138;61"
GOLD="38;2;255;216;138"
ACCENT="38;2;255;169;77"
PAPER="38;2;207;199;184"
ERR="38;2;255;109;109"

# --- pretty printing helpers ----------------------------------------------
# _info: muted body line.  _ok: completed step with accent ✓.
# _err: failure with red ✗ on stderr.  _hl: gold inline highlight (paths).
_info() {
  if [ "$C" = 1 ]; then printf '  %s[%sm%s%s\n' "$ESC" "$PAPER" "$*" "$RESET";
  else printf '  %s\n' "$*"; fi
}
_ok() {
  if [ "$C" = 1 ]; then printf '  %s[%sm✓ %s%s\n' "$ESC" "$ACCENT" "$*" "$RESET";
  else printf '  ✓ %s\n' "$*"; fi
}
_err() {
  if [ "$C" = 1 ]; then printf '  %s[%sm✗ %s%s\n' "$ESC" "$ERR" "$*" "$RESET" >&2;
  else printf '  ERROR: %s\n' "$*" >&2; fi
}
_hl() {
  if [ "$C" = 1 ]; then printf '%s[%sm%s%s' "$ESC" "$GOLD" "$*" "$RESET";
  else printf '%s' "$*"; fi
}

# --- the FANAA boot logo (identical to the TUI's SPLASH_LOGO) -------------
# 5 lines × 41 chars; gradient runs left→right across the whole block,
# exactly like the TUI splash (amber → gold).
_logo() {
  logo='███████ ███████ ██   ██ ███████ ███████
██      ██   ██ ███  ██ ██   ██ ██   ██
███████ ███████ ██ █ ██ ███████ ███████
██      ██   ██ ██  ███ ██   ██ ██   ██
██      ██   ██ ██   ██ ██   ██ ██   ██'
  if [ "$C" = 1 ] && command -v awk >/dev/null 2>&1; then
    printf '%s\n' "$logo" | awk 'BEGIN {
      r1=201; g1=138; b1=61    # amber  #c98a3d
      r2=255; g2=216; b2=138   # gold   #ffd88a
      total=205                # 41 chars x 5 lines
      idx=0
    }
    {
      line=$0; len=length(line)
      for (i=1; i<=len; i++) {
        r=int(r1 + (r2-r1) * idx / total)
        g=int(g1 + (g2-g1) * idx / total)
        b=int(b1 + (b2-b1) * idx / total)
        printf "\033[38;2;%d;%d;%dm%s", r, g, b, substr(line, i, 1)
        idx++
      }
      printf "\033[0m\n"
    }'
  else
    printf '%s\n' "$logo"
  fi
}

# --- gradient progress bar -------------------------------------------------
# _bar HAVE TOTAL LABEL — one frame of the download bar; the filled cells
# interpolate amber→gold (same gradient as the logo). Uses \r, no newline.
_bar() {
  awk -v have="$1" -v total="$2" -v label="$3" 'BEGIN {
    esc = sprintf("%c", 27)
    res = esc "[0m"
    faint = esc "[38;2;92;86;77m"    # empty track
    paper = esc "[38;2;207;199;184m"
    bold  = esc "[1m"
    width = 28
    pct = (total > 0) ? have * 100 / total : 0
    if (pct > 100) pct = 100
    filled = int(pct / 100 * width + 0.5)
    if (filled > width) filled = width
    out = "\r  " paper "downloading " label " "
    for (i = 0; i < width; i++) {
      t = (width > 1) ? i / (width - 1) : 0
      if (i < filled) {
        r = int(201 + (255 - 201) * t)
        g = int(138 + (216 - 138) * t)
        b = int(61  + (138 - 61)  * t)
        out = out esc sprintf("[38;2;%d;%d;%dm", r, g, b) "█"
      } else {
        out = out faint "░"
      }
    }
    out = out res " " bold sprintf("%3d%%", pct) res
    if (total > 0) {
      out = out " " esc "[38;2;255;169;77m" sprintf("%.1f", have / 1048576) \
              " / " esc "[38;2;255;216;138m" sprintf("%.1f", total / 1048576) " MiB"
    } else {
      out = out " " esc "[38;2;255;169;77m" sprintf("%.1f", have / 1048576) " MiB"
    }
    printf "%s", out
  }'
}

# _alive PID — 0 while the pid is still running; non-zero once it has exited
# (zombies count as gone, so the poll loop can't spin on a finished curl).
_alive() {
  st=$(ps -p "$1" -o stat= 2>/dev/null) || return 1
  [ -n "$st" ] || return 1
  case "$st" in *Z*|*X*) return 1 ;; esac
}

# --- banner -----------------------------------------------------------------
# The installer owns the screen on a terminal — clear it before painting.
if [ -t 1 ]; then
  printf '\033[2J\033[H'
fi
_logo
if [ "$C" = 1 ]; then
  printf '  %s[1;%smwrite letters only you will ever read.%s\n' "$ESC" "$ACCENT" "$RESET"
  printf '  %s[%sm──────────────────────────────────────%s\n' "$ESC" "$PAPER" "$RESET"
else
  echo "  write letters only you will ever read."
fi
echo

# --- fail loudly on any missing prerequisite -----------------------------
for cmd in curl uname; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    _err "required command not found: $cmd"
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
  *) _err "unsupported OS: $OS"; exit 1 ;;
esac
case "$ARCH" in
  x86_64|amd64)  HARCH="x64" ;;
  aarch64|arm64) HARCH="arm64" ;;
  *) _err "unsupported architecture: $ARCH"; exit 1 ;;
esac
if [ "$PLAT" = "windows" ]; then
  # Windows is only built for x64; the rest of this script still works under
  # MSYS/Cygwin (curl is present). The binary lands as fanaa.exe.
  [ "$HARCH" = "arm64" ] && { _err "no Windows arm64 build"; exit 1; }
  EXE=".exe"
else
  EXE=""
fi
ASSET="fanaa-$PLAT-$HARCH$EXE"
_info "installing $ASSET${VERSION:+ ($VERSION)} to $INSTALL_DIR"

# --- resolve version (default: latest release) ----------------------------
if [ -z "$VERSION" ]; then
  _info "resolving latest release …"
  TAG="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -1)"
  [ -n "$TAG" ] || { _err "could not resolve latest release"; exit 1; }
  VERSION="$TAG"
  _ok "resolved $(_hl "$VERSION")"
fi
# normalize: accept "0.8.1" or "v0.8.1"
case "$VERSION" in v*) ;; *) VERSION="v$VERSION" ;; esac

# --- download + verify ----------------------------------------------------
TMP="$(mktemp -d 2>/dev/null || mktemp -d /tmp/fanaa.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT

URL="$BASE/$VERSION/$ASSET"
if [ -t 1 ]; then
  # Terminal: animate a custom gradient bar while the asset downloads.
  TOTAL=$(curl -fsSL -I "$URL" 2>/dev/null | awk 'BEGIN{IGNORECASE=1} /^content-length:/{gsub("\r",""); print $2; exit}') || TOTAL=0
  : "${TOTAL:=0}"
  curl -fsSL "$URL" -o "$TMP/$ASSET" &
  CPID=$!
  while _alive "$CPID"; do
    HAVE=$(test -f "$TMP/$ASSET" && wc -c < "$TMP/$ASSET" || echo 0)
    _bar "$HAVE" "$TOTAL" "$ASSET"
    sleep 0.1
  done
  HAVE=$(test -f "$TMP/$ASSET" && wc -c < "$TMP/$ASSET" || echo 0)
  _bar "$HAVE" "$TOTAL" "$ASSET"
  printf '\n'
  if ! wait "$CPID"; then
    _err "download failed — check your connection"
    exit 1
  fi
else
  _info "downloading $(_hl "$ASSET")"
  curl -fsSL "$URL" -o "$TMP/$ASSET"
fi
curl -fsSL "$BASE/$VERSION/SHA256SUMS" -o "$TMP/SHA256SUMS"

if command -v sha256sum >/dev/null 2>&1; then
  CHECK="sha256sum -c"
elif command -v shasum >/dev/null 2>&1; then
  CHECK="shasum -a 256 -c"
else
  _err "no sha256sum/shasum available — refusing to install unverified binary"
  exit 1
fi
# verify the downloaded asset against the release's checksum file
# (sha256sum -c reads the checksums FROM SHA256SUMS; --ignore-missing
# only checks the file we actually downloaded).
if ! (cd "$TMP" && $CHECK --ignore-missing SHA256SUMS >/dev/null 2>&1); then
  _err "SHA-256 verification failed for $ASSET — aborting"
  exit 1
fi
_ok "checksum OK"

chmod +x "$TMP/$ASSET"

# --- install --------------------------------------------------------------
mkdir -p "$INSTALL_DIR"
INSTALLED="$INSTALL_DIR/fanaa$EXE"
mv -f "$TMP/$ASSET" "$INSTALLED"

# --- post-install sanity --------------------------------------------------
BIN_VER=""
if [ -z "$EXE" ]; then
  _ok "installed at $(_hl "$INSTALLED")"
  if "$INSTALLED" --version >/dev/null 2>&1; then
    BIN_VER="$("$INSTALLED" --version 2>/dev/null | head -1)"
  else
    _err "installed, but the binary did not run cleanly — check $INSTALLED"
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
    _info "$INSTALL_DIR is not on your PATH."
    case "$(basename "$SHELL" 2>/dev/null || echo sh)" in
      zsh)  _info "add to ~/.zshrc:  export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
      bash) _info "add to ~/.bashrc: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
      *)    _info "add to your shell rc: export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
    esac
    ;;
esac

echo
_ok "${BIN_VER:-fanaa $VERSION} ready — run 'fanaa tui' to write your first letter."
