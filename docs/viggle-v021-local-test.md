# Viggle v0.2.1 local compatibility test

Test date: 2026-09-26. Branch: `feat/viggle-v021-local-test`.

## Verdict

The installed runtime can run the complete updated LoRA with Qwen's original
unfused base weights. Text-to-image passed the sample check. The existing base
GGUF only applies part of the adapter, and the full-adapter reference edit
produced substantial unwanted visual changes. Do not treat this as a validated
drop-in replacement for AURA's current model setup.

## Environment and scope

- Apple M2 Max, 96 GiB unified memory, Metal backend.
- Existing `stable-diffusion.cpp` CLI: `master-908-88411ef`, commit
  `88411ef1e0688ff2df1010aeeb5d92b2d8cea2be`.
- Existing Q4_K_M Qwen3-VL text encoder, F16 vision projector, and Qwen Image
  2.1 BF16 VAE.
- Adapter: `Qwen-Image-2.1-viggle-turbo-v0.2.1-6step-lora-r256.safetensors`,
  loaded at runtime with strength 1; not merged into base weights.
- Isolated CLI tests only. No server lifecycle, runtime build, AURA provider,
  or default model configuration changes.

Sources: [Viggle model and instructions](https://huggingface.co/Viggle/Qwen-Image-2.1-viggle-turbo/tree/bb26a0f38e5fe6c124aaccc9187a87eed5d9ed13),
[original Qwen base](https://huggingface.co/Qwen/Qwen-Image-2.1/tree/790c92633540aa0cb11d9abf19eb46d861714758/transformer).

## Existing GGUF: incomplete adapter application

The existing `qwen_image_2.1-Q4_K.gguf` generated a 1024×1024 PNG in
125.31 seconds, but the runtime reported:

```text
Only (326 / 454) LoRA tensors have been applied
```

All 128 unused tensors target `img_mlp.gate_layer` or `img_mlp.proj`.
The base GGUF uses a fused `img_mlp.gate_up` projection. The adapter has
separate projections, and this build does not map them onto the fused weight.
An output image and exit code zero therefore do not establish compatibility.
The Comfy-Org BF16 file also uses fused projections, so simply changing from
GGUF to that file does not address this mismatch.

## Sampling settings

Use Euler, CFG 1, six steps, no negative prompt. Unlike Diffusers, this CLI
uses custom sigma values directly and expects a terminal zero. For 1024×1024:

```text
raw nodes: 1, 0.9375, 0.875, 0.75, 0.5, 0.25
image sequence length: (1024 / 16)^2 = 4096
mu: 0.5 + (0.9 - 0.5) * (4096 - 256) / (8192 - 256)
shift(s): exp(mu) / (exp(mu) + 1/s - 1)
--sigmas 1,0.9677544578,0.9333582930,0.8571919774,0.6667558177,0.4000962934,0
```

These values are resolution-dependent; do not reuse them for another size.
The CLI emits a step-count warning even when the supplied six steps already
match the seven sigma values. That warning is distinct from unused LoRA tensors.

## Original unfused base

Text-to-image passed: the runtime confirmed `(454 / 454) LoRA tensors have
been applied`, exited successfully, and saved a 1024×1024 PNG in 138.57 seconds
(runtime-reported generation duration). Visual inspection showed the requested
red teapot and blue cup on a wooden table. The run reported 19,652.30 MB of
resident model parameter buffers; that is not a peak-memory measurement.

Reference-image editing completed in 190.98 seconds, exited successfully, saved
a 1024×1024 PNG, and applied all 454 tensors. The teapot became green and the
composition remained recognizable, but the cup, table, and background became
strongly over-sharpened and contrasty. It failed the visual requirement to keep
the scene and lighting unchanged. Runtime execution passed; edit quality did
not pass this sample check.

The default `strength: 0.75` is not the cause: the command supplies only a
reference image, has an empty `init_image_path`, and the runtime's strength
handling is inside the non-null `init_image` branch. All six sigma intervals
ran. The cause of the edit degradation remains unresolved; this test cannot
distinguish model behavior from runtime/preprocessing differences.

These are compatibility checks with one seed and prompt, not a quality
benchmark or parity test against Diffusers. AURA's browser/API path, 2K,
transparency, and multiple references were not tested.

The original base's `transformer/diffusion_pytorch_model.safetensors.index.json`
and both referenced shards preserve separate MLP projections. Download those
three files into one directory, along with the adapter (named
`viggle-v021.safetensors` for the command below). The base shards total
14,230,249,472 tensor bytes; the adapter is approximately 1.36 GB.

The command used for text-to-image, with paths expressed as variables:

```bash
sd_root="$HOME/sd-cpp"
test_dir=/private/tmp/aura-viggle-v021
"$sd_root/stable-diffusion.cpp/build/bin/sd-cli" \
  --diffusion-model "$test_dir/base-index.json" \
  --vae "$sd_root/models/qwen_image_2.1_vae_bf16.safetensors" \
  --llm "$sd_root/models/Qwen3VL-8B-Instruct-Q4_K_M.gguf" \
  --llm_vision "$sd_root/models/mmproj-Qwen3VL-8B-Instruct-F16.gguf" \
  --lora-model-dir "$test_dir" --lora-apply-mode at_runtime \
  --cfg-scale 1 --steps 6 --sampling-method euler \
  --sigmas '1,0.9677544578,0.9333582930,0.8571919774,0.6667558177,0.4000962934,0' \
  --diffusion-fa -W 1024 -H 1024 -s 42 \
  -p 'A red ceramic teapot on a wooden table beside a blue cup, soft daylight, realistic product photograph. <lora:viggle-v021:1>' \
  -o "$test_dir/t2i-full.png" -v
```

`base-index.json` is the downloaded index under a shorter local filename.
For editing, add `-r "$test_dir/t2i-full.png"`, use a separate output filename,
and replace the prompt with:

```text
Change the red teapot to green. Keep the blue cup, wooden table, composition and lighting unchanged. <lora:viggle-v021:1>
```

## Local evidence

Commands, downloaded test weights, logs, and images are in
`/private/tmp/aura-viggle-v021/`. This temporary directory is not committed and
may be removed by the operating system. Reproduction scripts:

- `run-t2i.sh`: existing GGUF, incomplete LoRA application.
- `run-t2i-full.sh`: original Qwen transformer shards via `base-index.json`.
- `run-edit-full.sh`: same original base, edits `t2i-full.png`.

These scripts use this machine's existing model paths. No weights are stored
in the AURA repository.

Copies of the three output images, completed inference logs, and reproduction
scripts are retained outside the temporary directory at:
`/Users/rupertgermann/.codex/visualizations/2026/09/26/01a0dd2a-331a-7211-af5e-5426dda62692/viggle-v021/`.

## Follow-up: upstream master (`b167b94`..`4c3cf75`, same day)

- Upstream #2057 maps the adapter's separate MLP projections onto the fused
  `img_mlp.gate_up` weight: the existing `qwen_image_2.1-Q4_K.gguf` now applies
  `(454 / 454)` tensors. Text-to-image: 126.68 s at 1024×1024, 6 steps.
- Reference editing is still over-sharpened and contrasty on master (166.81 s),
  so the #2054 VAE FP16 fix is not the cause. The shipped v0.1 turbo GGUF on
  `88411ef` edits the same scene without that degradation (122.84 s).
- Upstream #2048 moves the Qwen 2.1 mu anchor to 8192 tokens and forces
  `shift_terminal=0.02`, which the Viggle README says breaks the last turbo
  step and which `--extra-sample-args` cannot disable. `scripts/qwen-sd-server.sh`
  therefore pins stable-diffusion.cpp to `88411ef` (override with `SD_CPP_REF`).
- To adopt v0.2.1 later, AURA would pass resolution-specific sigmas per request
  via `<sd_cpp_extra_args>{"sample_params":{"custom_sigmas":[...]}}`
  (parsed by the server; not exercised here).

Decision: keep the v0.1 turbo GGUF until v0.2.1 editing passes in sd.cpp.
