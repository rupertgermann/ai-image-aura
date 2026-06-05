# Target AI Transforms to the Layer Selection

Editor AI transforms will operate on the current layer selection rather than always flattening the entire composition as the editable input. The selected layer or layers are flattened into a bounded target image, while the full visible composition is sent as contextual reference so the model can preserve surrounding style and placement. If no layer is selected, the visible composition remains the transform target for compatibility with the current Editor behavior.

## Consequences

AI results become new non-destructive raster image layers placed near the targeted layers, with non-base target layers preserved but hidden by default. If the base layer is targeted, it remains visible because it anchors the composition bounds. The Editor must compute target bounds, export selected layers separately from composition context, and record enough metadata for lineage summaries without storing the full layer stack in lineage.
