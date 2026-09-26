#!/usr/bin/env bash
# Set up, run, and smoke-test local stable-diffusion.cpp image servers for AURA.
#
#   scripts/qwen-sd-server.sh setup [variant...]  # build sd-server + llama-swap, download weights (default: all variants)
#   scripts/qwen-sd-server.sh serve               # llama-swap on :1234 routing qwen-image-2.1 and flux-2-klein-4b (recommended)
#   scripts/qwen-sd-server.sh start [variant]     # a single sd-server on :1234 (default: turbo)
#   scripts/qwen-sd-server.sh test [model-id]     # smoke-test the endpoints AURA uses (default: qwen-image-2.1)
#
# Variants:
#   qwen    Qwen Image 2.1 base      20 steps, CFG 6  (~13 min per 1K image on Apple Silicon)
#   turbo   Qwen Image 2.1 Viggle    4 steps, CFG 1   (~75 s; 4-step distilled preview, weaker on complex edits)
#   klein   FLUX.2 klein 4B          4 steps, CFG 1   (no transparency)
#
# Environment overrides:
#   SD_HOME        install dir                            (default: ~/sd-cpp)
#   SD_CPP_REF     stable-diffusion.cpp commit to build   (default: pinned, see below)
#   QWEN_VARIANT   variant serving qwen-image-2.1 in serve (default: turbo)
#   STEPS          override the variant's sampling steps
#   OFFLOAD=1      pass --offload-to-cpu                  (default: off on macOS unified memory, on elsewhere)
#   FA=0           disable flash attention in the diffusion model
#   VERBOSE=1      verbose sd-server logs
#   QUANT / TE_QUANT  Qwen base diffusion / text-encoder GGUF quant (default: Q4_K / Q4_K_M)
#   BACKEND        metal | cuda | vulkan | cpu            (default: metal on macOS, cuda if nvcc found, else cpu)
#   SD_HOST/SD_PORT listen addr                           (default: 127.0.0.1:1234)
set -euo pipefail

SD_HOME="${SD_HOME:-$HOME/sd-cpp}"
QUANT="${QUANT:-Q4_K}"
TE_QUANT="${TE_QUANT:-Q4_K_M}"
QWEN_VARIANT="${QWEN_VARIANT:-turbo}"
HOST="${SD_HOST:-127.0.0.1}"
PORT="${SD_PORT:-1234}"
# Pinned: upstream b167b94 (#2048) changes the Qwen 2.1 flow schedule (8192-token mu anchor, forced
# shift_terminal=0.02), which breaks the turbo max_shift override below and cannot be disabled per server.
SD_CPP_REF="${SD_CPP_REF:-88411ef1e0688ff2df1010aeeb5d92b2d8cea2be}"
SRC="$SD_HOME/stable-diffusion.cpp"
MODELS="$SD_HOME/models"
BIN="$SRC/build/bin/sd-server"
LLAMA_SWAP_VERSION=256
LLAMA_SWAP="$SD_HOME/bin/llama-swap"
URL="http://$HOST:$PORT"
HF="https://huggingface.co"
ALL_VARIANTS=(qwen turbo klein)

log() { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || die "missing '$1' — install it first"; }

# Prints "<url> <local file>" lines for every weight a variant needs.
variant_files() {
    local qwen_vae="$HF/Comfy-Org/Qwen-Image-2.1/resolve/main/vae/qwen_image_2.1_vae_bf16.safetensors"
    local qwen_te="$HF/Qwen/Qwen3-VL-8B-Instruct-GGUF/resolve/main"
    case "$1" in
        qwen)
            echo "$HF/leejet/Qwen-Image-2.1-GGUF/resolve/main/qwen_image_2.1-$QUANT.gguf qwen_image_2.1-$QUANT.gguf"
            echo "$qwen_vae qwen_image_2.1_vae_bf16.safetensors"
            echo "$qwen_te/Qwen3VL-8B-Instruct-$TE_QUANT.gguf Qwen3VL-8B-Instruct-$TE_QUANT.gguf"
            echo "$qwen_te/mmproj-Qwen3VL-8B-Instruct-F16.gguf mmproj-Qwen3VL-8B-Instruct-F16.gguf" ;;
        turbo)
            echo "$HF/Abiray/Qwen-Image-2.1-viggle-4-steps-turbo-GGUF/resolve/main/qwen_image_2.1_turbo_Q8_0.gguf qwen_image_2.1_turbo_Q8_0.gguf"
            echo "$qwen_vae qwen_image_2.1_vae_bf16.safetensors"
            echo "$qwen_te/Qwen3VL-8B-Instruct-$TE_QUANT.gguf Qwen3VL-8B-Instruct-$TE_QUANT.gguf"
            echo "$qwen_te/mmproj-Qwen3VL-8B-Instruct-F16.gguf mmproj-Qwen3VL-8B-Instruct-F16.gguf" ;;
        klein)
            echo "$HF/leejet/FLUX.2-klein-4B-GGUF/resolve/main/flux-2-klein-4b-Q8_0.gguf flux-2-klein-4b-Q8_0.gguf"
            echo "$HF/Comfy-Org/flux2-dev/resolve/main/split_files/vae/flux2-vae.safetensors flux2-vae.safetensors"
            echo "$HF/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf Qwen3-4B-Q4_K_M.gguf" ;;
        *) die "unknown variant '$1' (expected: ${ALL_VARIANTS[*]})" ;;
    esac
}

# Prints the sd-server arguments for a variant (without listen address).
variant_args() {
    local m="$MODELS" args=()
    case "$1" in
        qwen)
            args=(--diffusion-model "$m/qwen_image_2.1-$QUANT.gguf" --vae "$m/qwen_image_2.1_vae_bf16.safetensors"
                --llm "$m/Qwen3VL-8B-Instruct-$TE_QUANT.gguf" --llm_vision "$m/mmproj-Qwen3VL-8B-Instruct-F16.gguf"
                --cfg-scale 6.0 --steps "${STEPS:-20}") ;;
        turbo)
            args=(--diffusion-model "$m/qwen_image_2.1_turbo_Q8_0.gguf" --vae "$m/qwen_image_2.1_vae_bf16.safetensors"
                --llm "$m/Qwen3VL-8B-Instruct-$TE_QUANT.gguf" --llm_vision "$m/mmproj-Qwen3VL-8B-Instruct-F16.gguf"
                --cfg-scale 1.0 --steps "${STEPS:-4}"
                # diffusers' shift (max_shift 0.9 @ 8192 tokens) on sd.cpp's 4096-token anchor; the default 1.15 over-shifts
                --extra-sample-args "max_shift=0.6935") ;;
        klein)
            args=(--diffusion-model "$m/flux-2-klein-4b-Q8_0.gguf" --vae "$m/flux2-vae.safetensors"
                --llm "$m/Qwen3-4B-Q4_K_M.gguf" --cfg-scale 1.0 --steps "${STEPS:-4}") ;;
        *) die "unknown variant '$1' (expected: ${ALL_VARIANTS[*]})" ;;
    esac
    args+=(--sampling-method euler)
    [[ "${FA:-1}" == 1 ]] && args+=(--diffusion-fa)
    local offload_default=1
    [[ "$(uname)" == Darwin ]] && offload_default=0
    [[ "${OFFLOAD:-$offload_default}" == 1 ]] && args+=(--offload-to-cpu)
    [[ "${VERBOSE:-0}" == 1 ]] && args+=(-v)
    printf '%s\n' "${args[@]}"
}

check_variant() {
    [[ -x "$BIN" ]] || die "sd-server not built — run: $0 setup"
    local url file
    while read -r url file; do
        [[ -s "$MODELS/$file" ]] || die "missing $MODELS/$file — run: $0 setup $1"
    done < <(variant_files "$1")
}

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

build_sd_server() {
    if [[ -d "$SRC/.git" ]]; then
        log "updating stable-diffusion.cpp"
        git -C "$SRC" fetch
    else
        log "cloning stable-diffusion.cpp"
        git clone https://github.com/leejet/stable-diffusion.cpp "$SRC"
    fi
    git -C "$SRC" checkout --detach "$SD_CPP_REF"
    git -C "$SRC" submodule update --init --recursive

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
    cmake --build "$SRC/build" --config Release -j --target sd-server
    [[ -x "$BIN" ]] || die "build finished but $BIN not found"
}

install_llama_swap() {
    if [[ -x "$LLAMA_SWAP" ]]; then log "have llama-swap"; return; fi
    local os arch
    os="$(uname | tr '[:upper:]' '[:lower:]')"
    arch="$(uname -m)"; [[ "$arch" == x86_64 ]] && arch=amd64; [[ "$arch" == aarch64 ]] && arch=arm64
    log "installing llama-swap v$LLAMA_SWAP_VERSION"
    mkdir -p "$SD_HOME/bin"
    curl -fsSL "https://github.com/mostlygeek/llama-swap/releases/download/v$LLAMA_SWAP_VERSION/llama-swap_${LLAMA_SWAP_VERSION}_${os}_${arch}.tar.gz" \
        | tar -xz -C "$SD_HOME/bin" llama-swap
}

cmd_setup() {
    need git; need cmake; need curl
    local variants=("$@")
    [[ ${#variants[@]} -gt 0 ]] || variants=("${ALL_VARIANTS[@]}")
    mkdir -p "$SD_HOME" "$MODELS"
    [[ -x "$BIN" && "${REBUILD:-0}" != 1 ]] && log "have sd-server (REBUILD=1 to rebuild)" || build_sd_server
    install_llama_swap
    local variant url file
    for variant in "${variants[@]}"; do
        while read -r url file; do download "$url" "$MODELS/$file"; done < <(variant_files "$variant")
    done
    log "done. next: $0 serve   (then in another terminal: $0 test)"
}

cmd_start() {
    local variant="${1:-turbo}" args=()
    check_variant "$variant"
    while IFS= read -r arg; do args+=("$arg"); done < <(variant_args "$variant")
    log "starting sd-server ($variant) on $URL (Ctrl-C to stop)"
    log "AURA: Settings → Local Server → $URL → Save → Test connection"
    exec "$BIN" "${args[@]}" --listen-ip "$HOST" --listen-port "$PORT"
}

cmd_serve() {
    [[ -x "$LLAMA_SWAP" ]] || die "llama-swap not installed — run: $0 setup"
    check_variant "$QWEN_VARIANT"
    check_variant klein
    local config="$SD_HOME/llama-swap.yaml"
    {
        echo "healthCheckTimeout: 300"
        echo "models:"
        local id variant
        for id in qwen-image-2.1 flux-2-klein-4b; do
            [[ "$id" == qwen-image-2.1 ]] && variant="$QWEN_VARIANT" || variant=klein
            echo "  \"$id\":"
            printf '    cmd: %q' "$BIN"
            while IFS= read -r arg; do printf ' %q' "$arg"; done < <(variant_args "$variant")
            echo ' --listen-ip 127.0.0.1 --listen-port ${PORT}'
            echo '    proxy: "http://127.0.0.1:${PORT}"'
            echo "    checkEndpoint: /v1/models"
        done
    } > "$config"
    log "wrote $config (qwen-image-2.1 → $QWEN_VARIANT, flux-2-klein-4b → klein)"
    log "llama-swap on $URL — the first request per model loads it (Ctrl-C to stop)"
    log "AURA: Settings → Local Server → $URL → Save → Test connection"
    exec "$LLAMA_SWAP" --config "$config" --listen "$HOST:$PORT"
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

timed() { local start=$SECONDS; "$@"; log "took $((SECONDS - start))s"; }

cmd_test() {
    need curl; need python3
    local model="${1:-qwen-image-2.1}" out
    out="$(mktemp -d)"
    local tag='<sd_cpp_extra_args>{"init_image":null}</sd_cpp_extra_args>'

    log "GET /v1/models"
    curl -fsS "$URL/v1/models" || die "server not reachable at $URL — is '$0 serve' running?"
    echo

    log "CORS preflight (AURA calls from the browser)"
    curl -fsS -o /dev/null -D - -X OPTIONS "$URL/v1/images/generations" \
        -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' \
        -H 'Access-Control-Request-Headers: content-type' | grep -i '^access-control-allow' \
        || log "WARNING: no CORS headers on preflight — browser requests from AURA may fail"

    log "text-to-image 1024x1024 ($model)"
    timed curl -fsS "$URL/v1/images/generations" -H 'Content-Type: application/json' -d "{
        \"model\": \"$model\",
        \"prompt\": \"a red fox sitting in fresh snow, photo\",
        \"n\": 1, \"size\": \"1024x1024\", \"output_format\": \"png\"
    }" -o "$out/t2i.json"
    b64_to_png "$out/t2i.json" "$out/t2i"

    if [[ "$model" == qwen-image-2.1 ]]; then
        log "transparent (RGBA) output"
        timed curl -fsS "$URL/v1/images/generations" -H 'Content-Type: application/json' -d '{
            "model": "qwen-image-2.1",
            "prompt": "This is an RGBA image with transparency. A ceramic coffee mug. The image has alpha channel and the background is transparent.",
            "n": 1, "size": "1024x1024", "output_format": "png"
        }' -o "$out/rgba.json"
        b64_to_png "$out/rgba.json" "$out/rgba"
        python3 -c "import sys; d=open(sys.argv[1],'rb').read(); print('PNG color type:', d[25], '(6 = RGBA)')" "$out/rgba-0.png"
    fi

    log "edit with reference image and cleared init image"
    timed curl -fsS "$URL/v1/images/edits" \
        -F "model=$model" \
        --form-string "prompt=turn the fox into a white arctic fox, same pose $tag" \
        -F n=1 -F size=1024x1024 -F output_format=png \
        -F "image[]=@$out/t2i-0.png;type=image/png" \
        -o "$out/edit.json"
    b64_to_png "$out/edit.json" "$out/edit"

    log "all requests succeeded — outputs in $out"
    [[ "$(uname)" == Darwin && -z "${NO_OPEN:-}" ]] && open "$out"
    return 0
}

case "${1:-}" in
    setup) shift; cmd_setup "$@" ;;
    serve) cmd_serve ;;
    start) cmd_start "${2:-}" ;;
    test)  cmd_test "${2:-}" ;;
    *) sed -n '2,24p' "$0"; exit 1 ;;
esac
