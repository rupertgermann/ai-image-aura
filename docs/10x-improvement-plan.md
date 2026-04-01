# Roadmap

## Product Direction

AURA AI focuses on a local-first creative workflow:

- fast prompt-to-image generation
- reference-guided creation and editing
- reliable local storage for image archives
- lightweight, browser-native editing tools
- safe handling of API credentials and image payloads

## Near-Term Priorities

### Archive portability

- Full archive export with metadata and binary payloads in a single package
- Archive import with conflict handling and validation
- Integrity checks for missing or orphaned binary records

### Archive scale and responsiveness

- Thumbnail generation for large libraries
- Virtualized archive rendering
- Batched loading for metadata and image payloads
- ZIP generation off the main thread

### Organization and discovery

- Tags and collections
- Additional archive filters for model, date, style, lighting, and palette
- Saved searches stored locally
- Bulk metadata actions

## Platform Hardening

### OpenAI request resilience

- Request timeouts
- Retry and backoff behavior for transient failures
- Consistent user-facing error mapping
- Centralized request orchestration for generate and edit flows

### Local data safety

- Optional encrypted API key storage
- Safer migration handling for archive schema evolution
- Recovery tools for corrupted or partial local data

### Quality and delivery

- Automated unit coverage for utilities, hooks, storage, and request helpers
- End-to-end coverage for generate, archive, edit, and export workflows
- CI automation for typecheck, lint, build, and security audit checks

## Success Indicators

- Large archives remain responsive during browsing and selection
- Export and restore workflows preserve image and reference relationships
- Error states are actionable and predictable
- Local data stays private and recoverable
- Core release checks stay green in automation
