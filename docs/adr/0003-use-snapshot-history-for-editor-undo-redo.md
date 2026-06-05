# Use Snapshot History for Editor Undo and Redo

The layered Editor needs undo and redo across mixed draft changes including layer operations, transforms, AI result layers, uploaded layers, reference changes, and composition adjustments. We will implement undo/redo as a bounded stack of serializable Editor draft snapshots instead of command-specific inverse operations, prioritizing correctness and recoverability over memory efficiency in the first layered editing release.

## Consequences

The undo/redo stack should be capped to prevent unbounded memory growth, and it should live only for the active Editor session. Persisted Editor drafts keep the current state across reloads, but do not persist undo/redo history.
