# Use Konva for the Layered Editor Canvas

The layered Editor needs direct selection, z-ordering, hit-testing, move/scale/rotate handles, and reliable flattened export from an interactive canvas. We will use Konva through React bindings for the layered Editor canvas instead of extending the current native 2D canvas drawing hook, because these interactions are core object-canvas behavior rather than incidental rendering details.

## Consequences

The Editor gains a dedicated canvas object model for layers and transforms. The project accepts an additional runtime dependency, but avoids building and maintaining custom hit-testing, transform handles, pointer-event routing, and high-DPI export logic.
