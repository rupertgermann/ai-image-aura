import { archiveStore } from '../src/archive/ArchiveStore';
import { loadEditorDraft } from '../src/editor/editorDraftStorage';
import type { ArchiveImage } from '../src/db/types';

export { archiveStore, loadEditorDraft };

function texture(size: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    const pixels = context.createImageData(size, size);
    let state = 42;
    for (let i = 0; i < pixels.data.length; i += 4) {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        pixels.data[i] = state & 255;
        pixels.data[i + 1] = (state >>> 8) & 255;
        pixels.data[i + 2] = (state >>> 16) & 255;
        pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    return canvas.toDataURL();
}

export async function seed() {
    const thumbnail = texture(128);
    const artwork = texture(1024);
    for (let index = 0; index < 300; index++) {
        const layered = index === 0;
        const image: ArchiveImage = {
            id: `perf-${index}`, url: layered ? artwork : thumbnail,
            prompt: layered ? 'Performance layered image' : `Performance image ${index}`,
            timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, 300 - index)).toISOString(),
            quality: 'high', aspectRatio: '1024x1024', background: 'opaque',
            width: layered ? 1024 : 128, height: layered ? 1024 : 128,
            references: layered ? [artwork] : [],
            ...(layered ? { layerStack: {
                canvasWidth: 1024, canvasHeight: 1024,
                adjustments: { brightness: 100, contrast: 100, saturation: 100, filter: 'none' },
                layers: Array.from({ length: 4 }, (_, layer) => ({
                    id: layer === 0 ? 'base' : `layer-${layer}`,
                    name: layer === 0 ? 'Base image' : `Layer ${layer}`,
                    kind: layer === 0 ? 'base' : 'uploaded', assetUrl: artwork,
                    x: layer * 20, y: layer * 20, width: 1024, height: 1024,
                    rotation: 0, opacity: 1, blendMode: 'normal', visible: true, locked: layer === 0,
                })),
            } } : {}),
        };
        await archiveStore.save(image);
    }
    return { images: 300, canvas: [1024, 1024], layers: 4, references: 1,
        thumbnailBytes: thumbnail.length, artworkBytes: artwork.length };
}
