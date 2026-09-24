#!/usr/bin/env bash
# Set up, run, and smoke-test a local stable-diffusion.cpp sd-server for Qwen Image 2.1.
#
#   scripts/qwen-sd-server.sh setup   # clone + build sd-server, download weights
#   scripts/qwen-sd-server.sh start   # run sd-server in the foreground
#   scripts/qwen-sd-server.sh test    # smoke-test the endpoints AURA uses (server must be running)
#
# Environment overrides:
#   SD_HOME   install dir                     (default: ~/sd-cpp)
#   QUANT     diffusion GGUF quant            (default: Q4_K; also Q2_K Q3_K Q4_0 Q5_0 Q6_K Q8_0)
#   TE_QUANT  text encoder GGUF quant         (default: Q4_K_M; also Q8_0 F16)
#   BACKEND   metal | cuda | vulkan | cpu     (default: metal on macOS, cuda if nvcc found, else cpu)
#   SD_HOST/SD_PORT listen addr               (default: 127.0.0.1:1234)
set -euo pipefail

SD_HOME="${SD_HOME:-$HOME/sd-cpp}"
QUANT="${QUANT:-Q4_K}"
TE_QUANT="${TE_QUANT:-Q4_K_M}"
HOST="${SD_HOST:-127.0.0.1}"
PORT="${SD_PORT:-1234}"
SRC="$SD_HOME/stable-diffusion.cpp"
MODELS="$SD_HOME/models"
BIN="$SRC/build/bin/sd-server"
URL="http://$HOST:$PORT"
HF="https://huggingface.co"

DIFFUSION="$MODELS/qwen_image_2.1-$QUANT.gguf"
VAE="$MODELS/qwen_image_2.1_vae_bf16.safetensors"
LLM="$MODELS/Qwen3VL-8B-Instruct-$TE_QUANT.gguf"
MMPROJ="$MODELS/mmproj-Qwen3VL-8B-Instruct-F16.gguf"

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "missing '$1' — install it first"; }

detect_backend() {
    if [[ -n "${BACKEND:-}" ]]; then echo "$BACKEND"
    elif [[ "$(uname)" == Darwin ]]; then echo metal
    elif command -v nvcc >/dev/null; then echo cuda
    else echo cpu
    fi
}

download() { # url dest
    if [[ -s "$2" && ! -f "$2.part" ]]; then log "have $(basename "$2")"; return; fi
    log "downloading $(basename "$2")"
    touch "$2.part"
    curl -fL --retry 5 -C - -o "$2" "$1"
    rm -f "$2.part"
}

cmd_setup() {
    need git; need cmake; need curl
    mkdir -p "$SD_HOME" "$MODELS"

    if [[ -d "$SRC/.git" ]]; then
        log "updating stable-diffusion.cpp"
        git -C "$SRC" pull --ff-only
        git -C "$SRC" submodule update --init --recursive
    else
        log "cloning stable-diffusion.cpp"
        git clone --recursive https://github.com/leejet/stable-diffusion.cpp "$SRC"
    fi

    local backend flags=()
    backend="$(detect_backend)"
    case "$backend" in
        metal)  flags=(-DSD_METAL=ON) ;;
        cuda)   flags=(-DSD_CUDA=ON) ;;
        vulkan) flags=(-DSD_VULKAN=ON) ;;
        cpu)    flags=() ;;
        *)      die "unknown BACKEND '$backend'" ;;
    esac
    log "building sd-server (backend: $backend)"
    cmake -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DSD_SERVER_BUILD_FRONTEND=OFF "${flags[@]}"
    cmake --build "$SRC/build" --config Release -j
    [[ -x "$BIN" ]] || die "build finished but $BIN not found"

    download "$HF/leejet/Qwen-Image-2.1-GGUF/resolve/main/$(basename "$DIFFUSION")" "$DIFFUSION"
    download "$HF/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/$(basename "$VAE")" "$VAE"
    download "$HF/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/$(basename "$LLM")" "$LLM"
    download "$HF/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main/$(basename "$MMPROJ")" "$MMPROJ"

    log "done. next: $0 start   (then in another terminal: $0 test)"
}

cmd_start() {
    [[ -x "$BIN" ]] || die "sd-server not built — run: $0 setup"
    for f in "$DIFFUSION" "$VAE" "$LLM" "$MMPROJ"; do [[ -s "$f" ]] || die "missing $f — run: $0 setup"; done
    log "starting sd-server on $URL (Ctrl-C to stop)"
    log "AURA: Settings → Local Server → $URL → Save → Test connection"
    exec "$BIN" \
        --diffusion-model "$DIFFUSION" \
        --vae "$VAE" \
        --llm "$LLM" \
        --llm_vision "$MMPROJ" \
        --cfg-scale 6.0 --sampling-method euler \
        --diffusion-fa --offload-to-cpu -v \
        --listen-ip "$HOST" --listen-port "$PORT"
}

b64_to_png() { # json-file out-prefix -> writes out-prefix-N.png
    python3 - "$1" "$2" <<'PY'
import base64, json, sys
body = json.load(open(sys.argv[1]))
data = body.get("data") or []
if not data:
    sys.exit(f"no image data in response: {json.dumps(body)[:300]}")
for i, item in enumerate(data):
    path = f"{sys.argv[2]}-{i}.png"
    open(path, "wb").write(base64.b64decode(item["b64_json"]))
    print(path)
PY
}

cmd_test() {
    need curl; need python3
    local out; out="$(mktemp -d)"
    local tag='<sd_cpp_extra_args>{"init_image":null}</sd_cpp_extra_args>'

    log "1/5 GET /v1/models"
    curl -fsS "$URL/v1/models" || die "server not reachable at $URL — is '$0 start' running?"
    echo

    log "2/5 CORS preflight (AURA calls from the browser)"
    curl -fsS -o /dev/null -D - -X OPTIONS "$URL/v1/images/generations" \
        -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' \
        -H 'Access-Control-Request-Headers: content-type' | grep -i '^access-control-allow' \
        || log "WARNING: no CORS headers on preflight — browser requests from AURA may fail"

    log "3/5 text-to-image (1024x1024)"
    curl -fsS "$URL/v1/images/generations" -H 'Content-Type: application/json' -d '{
        "model": "qwen-image-2.1",
        "prompt": "a red fox sitting in fresh snow, photo",
        "n": 1, "size": "1024x1024", "output_format": "png"
    }' -o "$out/t2i.json"
    b64_to_png "$out/t2i.json" "$out/t2i"

    log "4/5 transparent (RGBA) output"
    curl -fsS "$URL/v1/images/generations" -H 'Content-Type: application/json' -d '{
        "model": "qwen-image-2.1",
        "prompt": "This is an RGBA image with transparency. A ceramic coffee mug. The image has alpha channel and the background is transparent.",
        "n": 1, "size": "1024x1024", "output_format": "png"
    }' -o "$out/rgba.json"
    b64_to_png "$out/rgba.json" "$out/rgba"
    python3 -c "import sys; d=open(sys.argv[1],'rb').read(); print('PNG color type:', d[25], '(6 = RGBA)')" "$out/rgba-0.png"

    log "5/5 edit with reference image and cleared init image"
    curl -fsS "$URL/v1/images/edits" \
        -F model=qwen-image-2.1 \
        --form-string "prompt=turn the fox into a white arctic fox, same pose $tag" \
        -F n=1 -F size=1024x1024 -F output_format=png \
        -F "image[]=@$out/t2i-0.png;type=image/png" \
        -o "$out/edit.json"
    b64_to_png "$out/edit.json" "$out/edit"

    log "all requests succeeded — outputs in $out"
    [[ "$(uname)" == Darwin ]] && open "$out"
    return 0
}

case "${1:-}" in
    setup) cmd_setup ;;
    start) cmd_start ;;
    test)  cmd_test ;;
    *) sed -n '2,15p' "$0"; exit 1 ;;
esac
