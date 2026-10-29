#!/usr/bin/env bash
# kimo engine setup for Linux: runs the real kimo v6 engine on this PC and connects it to
# app.getkimo.tech through the free Cloudflare Tunnel "kimo-engine" (engine.getkimo.tech).
# Works only while this PC is on and the engine is running.
#
#   curl -fsSL https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine/setup.sh | KIMO_TUNNEL_TOKEN=... KIMO_ENGINE_TOKEN=... bash
#
# Docker running -> engine container (prebuilt release on x86_64, source build on arm64).
# Otherwise native: kimo release binary + node + ffmpeg + prebuilt whisper-cli.
# Afterwards: ~/.local/share/kimo-engine/start.sh  (and stop.sh)
set -euo pipefail
: "${KIMO_TUNNEL_TOKEN:?set KIMO_TUNNEL_TOKEN}" "${KIMO_ENGINE_TOKEN:?set KIMO_ENGINE_TOKEN}"
[ "${#KIMO_ENGINE_TOKEN}" -ge 32 ] || { echo "KIMO_ENGINE_TOKEN looks wrong" >&2; exit 1; }
case "$(uname -s)" in Linux) ;; *) echo "this script is for Linux; on Windows use setup.ps1" >&2; exit 1 ;; esac
RAW=https://raw.githubusercontent.com/naman-sharma12345/kimoapp/main/deploy/kimo-engine
KIMO=6.0.0; WHISPER=b5454
DIR="${KIMO_ENGINE_DIR:-$HOME/.local/share/kimo-engine}"
mkdir -p "$DIR" && cd "$DIR"
ARCH=$(uname -m); case "$ARCH" in x86_64|amd64) CF=amd64 ;; aarch64|arm64) CF=arm64 ;; *) echo "unsupported CPU $ARCH" >&2; exit 1 ;; esac
get() { [ -s "$2" ] || { echo "downloading $(basename "$2")"; curl -fL --retry 3 -o "$2.part" "$1" && mv "$2.part" "$2"; }; }
umask 077
printf 'KIMO_TUNNEL_TOKEN=%s\nKIMO_ENGINE_TOKEN=%s\n' "$KIMO_TUNNEL_TOKEN" "$KIMO_ENGINE_TOKEN" > engine.env
umask 022
get "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-$CF" cloudflared && chmod +x cloudflared
curl -fsSL -o server.mjs "$RAW/server.mjs"

MODE=native
if command -v docker >/dev/null && docker info >/dev/null 2>&1; then MODE=docker; fi
if [ "$MODE" = docker ]; then
  if [ "$CF" = amd64 ]; then curl -fsSL -o Dockerfile "$RAW/Dockerfile.release"; else curl -fsSL -o Dockerfile "$RAW/Dockerfile"; fi
  echo "Docker found: building the kimo engine image"
  docker build -t kimo-engine .
  cat > start.sh <<'EOS'
#!/usr/bin/env bash
cd "$(dirname "$0")"; set -a; . ./engine.env; set +a
docker rm -f kimo-engine >/dev/null 2>&1 || true
docker run -d --name kimo-engine --restart unless-stopped -p 127.0.0.1:7860:7860 -e ENGINE_TOKEN="$KIMO_ENGINE_TOKEN" kimo-engine >/dev/null
pkill -f "cloudflared tunnel --no-autoupdate run" 2>/dev/null || true
nohup ./cloudflared tunnel --no-autoupdate run --token "$KIMO_TUNNEL_TOKEN" > tunnel.log 2>&1 &
echo "kimo engine running (docker) and connected: https://engine.getkimo.tech/health"
EOS
else
  [ "$CF" = amd64 ] || { echo "native mode needs x86_64; install Docker for arm64" >&2; exit 1; }
  command -v node >/dev/null || { echo "install Node.js 18+ (e.g. sudo apt install nodejs) and re-run" >&2; exit 1; }
  command -v ffprobe >/dev/null || { echo "install FFmpeg (e.g. sudo apt install ffmpeg) and re-run" >&2; exit 1; }
  if [ ! -x kimo/bin/kimo-mcp ]; then
    get "https://github.com/naman-sharma12345/kimo/releases/download/v$KIMO/kimo-v$KIMO-linux-x86_64-glibc.tar.gz" kimo.tgz
    mkdir -p kimo && tar xzf kimo.tgz -C kimo --strip-components=1
  fi
  mkdir -p models/bin
  if [ ! -x models/bin/whisper-cli ]; then
    get "https://github.com/ggml-org/whisper.cpp/releases/download/$WHISPER/whisper-bin-ubuntu-x64.tar.gz" whisper.tgz
    rm -rf whisper-x && mkdir whisper-x && tar xzf whisper.tgz -C whisper-x
    W=$(find whisper-x -type f -name whisper-cli | head -1); cp "$(dirname "$W")"/* models/bin/ 2>/dev/null || true
    find whisper-x -name '*.so*' -exec cp {} models/bin/ \; ; chmod +x models/bin/whisper-cli
  fi
  get https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin models/ggml-small-q5_1.bin
  cat > start.sh <<'EOS'
#!/usr/bin/env bash
cd "$(dirname "$0")"; D="$PWD"; set -a; . ./engine.env; set +a
export ENGINE_TOKEN="$KIMO_ENGINE_TOKEN" KIMO_MCP_BIN="$D/kimo/bin/kimo-mcp" KIMO_FONTS="$D/kimo/fonts" \
  KIMO_MODELS="$D/models" KIMO_WHISPER_BIN="$D/models/bin/whisper-cli" KIMO_WHISPER_MODEL="$D/models/ggml-small-q5_1.bin" \
  LD_LIBRARY_PATH="$D/models/bin:${LD_LIBRARY_PATH:-}" KIMO_TOOLS=director KIMO_SPECTATOR=off PORT=7860
pkill -f "$D/server.mjs" 2>/dev/null || true
pkill -f "cloudflared tunnel --no-autoupdate run" 2>/dev/null || true
nohup node "$D/server.mjs" > engine.log 2>&1 &
nohup ./cloudflared tunnel --no-autoupdate run --token "$KIMO_TUNNEL_TOKEN" > tunnel.log 2>&1 &
echo "kimo engine running (native) and connected: https://engine.getkimo.tech/health"
EOS
fi
cat > stop.sh <<'EOS'
#!/usr/bin/env bash
cd "$(dirname "$0")"
pkill -f "cloudflared tunnel --no-autoupdate run" 2>/dev/null || true
pkill -f "$PWD/server.mjs" 2>/dev/null || true
docker rm -f kimo-engine >/dev/null 2>&1 || true
echo "kimo engine stopped"
EOS
chmod +x start.sh stop.sh
./start.sh
sleep 6
curl -fsS http://127.0.0.1:7860/health && echo || echo "engine not answering on 127.0.0.1:7860 yet; see $DIR/engine.log"
echo "done ($MODE). start again later: $DIR/start.sh   stop: $DIR/stop.sh"
