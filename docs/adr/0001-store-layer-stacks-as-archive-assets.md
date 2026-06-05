# Store Layer Stacks as Archive Assets

Layered images need to reopen as editable compositions and round-trip through archive export/import. We will store layer stack metadata with the archive image record and store each layer bitmap as a separate archive asset, following the existing pattern for flattened images and reference images, instead of embedding large layer data directly in metadata or treating layers as temporary Editor session state.

## Consequences

Layered archive exports must include both the flattened preview image and the per-layer image assets. Save, copy, overwrite, import, and delete flows must keep the layer stack metadata and layer assets in sync.
