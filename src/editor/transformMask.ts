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
