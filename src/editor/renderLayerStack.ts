import type { ArchiveLayer, ArchiveLayerStack } from '../db/types';
import type { EditorAdjustments, LayerBounds } from './layers';

export async function renderLayerStackToDataUrl(
    layerStack: ArchiveLayerStack,
    adjustments: EditorAdjustments,
    bounds?: LayerBounds | null,
): Promise<string> {
    const canvas = document.createElement('canvas');
    const x = bounds?.x ?? 0;
    const y = bounds?.y ?? 0;
    const width = bounds?.width ?? layerStack.canvasWidth;
    const height = bounds?.height ?? layerStack.canvasHeight;
    canvas.width = Math.max(1, Math.round(width));
    canvas.height = Math.max(1, Math.round(height));

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas unavailable');
    }

    context.filter = buildCanvasFilter(adjustments);
    context.translate(-x, -y);

    for (const layer of layerStack.layers) {
        if (!layer.visible) {
            continue;
        }

        const image = await loadImage(layer.assetUrl);
        context.save();
        context.globalAlpha = layer.opacity;
        context.globalCompositeOperation = toCompositeOperation(layer.blendMode);
        context.translate(layer.x + layer.width / 2, layer.y + layer.height / 2);
        context.rotate((layer.rotation * Math.PI) / 180);
        context.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
        context.restore();
    }

    return canvas.toDataURL('image/png');
}

export async function renderLayerStackToBlob(
    layerStack: ArchiveLayerStack,
    adjustments: EditorAdjustments,
    bounds?: LayerBounds | null,
): Promise<Blob> {
    const dataUrl = await renderLayerStackToDataUrl(layerStack, adjustments, bounds);
    const response = await fetch(dataUrl);
    return response.blob();
}

export function toCompositeOperation(blendMode: ArchiveLayer['blendMode'] | undefined): GlobalCompositeOperation {
    if (!blendMode || blendMode === 'normal') {
        return 'source-over';
    }

    return blendMode;
}

export function buildCanvasFilter(adjustments: EditorAdjustments) {
    return `brightness(${adjustments.brightness}%) contrast(${adjustments.contrast}%) saturate(${adjustments.saturation}%) ${adjustments.filter !== 'none' ? adjustments.filter : ''}`;
}

function loadImage(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Failed to load layer image'));
        image.src = source;
    });
}
