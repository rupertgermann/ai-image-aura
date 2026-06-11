import { describe, expect, it } from 'vitest';
import { classifyTransformMaskCoverage } from './transformMask';

describe('transform mask coverage', () => {
    it('classifies a fully transparent mask as empty', () => {
        expect(classifyTransformMaskCoverage({
            width: 2,
            height: 2,
            data: new Uint8ClampedArray([
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
                0, 0, 0, 0,
            ]),
        })).toBe('empty');
    });

    it('classifies any non-transparent mask pixel as painted', () => {
        expect(classifyTransformMaskCoverage({
            width: 2,
            height: 2,
            data: new Uint8ClampedArray([
                0, 0, 0, 0,
                0, 0, 0, 12,
                0, 0, 0, 0,
                0, 0, 0, 0,
            ]),
        })).toBe('painted');
    });
});
