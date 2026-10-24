export type TransformMaskCoverage = 'empty' | 'painted';

export function classifyTransformMaskCoverage(
    mask: Pick<ImageData, 'data' | 'width' | 'height'>,
): TransformMaskCoverage {
    const expectedLength = mask.width * mask.height * 4;
    const length = Math.min(mask.data.length, expectedLength);

    for (let alphaIndex = 3; alphaIndex < length; alphaIndex += 4) {
        if (mask.data[alphaIndex] > 0) {
            return 'painted';
        }
    }

    return 'empty';
}

export async function createOpenAiTransformMask(mask: Blob, source: Blob): Promise<Blob> {
    const sourceBitmap = await createImageBitmap(source);
    try {
        const maskBitmap = await createImageBitmap(mask);
        try {
            if (maskBitmap.width !== sourceBitmap.width || maskBitmap.height !== sourceBitmap.height) {
                throw new Error('Transform mask dimensions must match the source image. Repaint the mask for this target.');
            }
            const canvas = document.createElement('canvas');
            canvas.width = maskBitmap.width;
            canvas.height = maskBitmap.height;
            const context = canvas.getContext('2d');
            if (!context) throw new Error('Could not prepare transform mask.');
            context.drawImage(maskBitmap, 0, 0);
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
            // Stored masks mark painted selections as opaque; OpenAI edits transparent pixels.
            for (let index = 3; index < pixels.data.length; index += 4) {
                pixels.data[index] = 255 - pixels.data[index];
            }
            context.putImageData(pixels, 0, 0);
            return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => {
                if (blob) resolve(blob);
                else reject(new Error('Could not prepare transform mask.'));
            }, 'image/png'));
        } finally {
            maskBitmap.close();
        }
    } finally {
        sourceBitmap.close();
    }
}
