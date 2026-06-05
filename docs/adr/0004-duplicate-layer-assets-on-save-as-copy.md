# Duplicate Layer Assets on Save as Copy

When a layered image is saved as a copy, the new archive image will own duplicated layer bitmap assets rather than sharing asset references with the source image. This favors predictable local deletion, import/export, and archive ownership semantics over storage efficiency, avoiding reference counting and shared-asset lifecycle bugs in the first layered editing release.
