import { describe, expect, it } from 'vitest';
import { buildCanvasFilter, toCompositeOperation } from './renderLayerStack';

describe('buildCanvasFilter', () => {
    it('builds adjustment functions from slider values', () => {
        expect(buildCanvasFilter({ brightness: 120, contrast: 80, saturation: 150, filter: 'none' }))
            .toBe('brightness(120%) contrast(80%) saturate(150%) ');
    });

    it('appends the preset filter when one is active', () => {
        expect(buildCanvasFilter({ brightness: 100, contrast: 100, saturation: 100, filter: 'sepia(100%)' }))
            .toBe('brightness(100%) contrast(100%) saturate(100%) sepia(100%)');
    });
});

describe('toCompositeOperation', () => {
    it('maps normal and missing blend modes to source-over', () => {
        expect(toCompositeOperation('normal')).toBe('source-over');
        expect(toCompositeOperation(undefined)).toBe('source-over');
    });

    it('passes other blend modes through', () => {
        expect(toCompositeOperation('multiply')).toBe('multiply');
        expect(toCompositeOperation('screen')).toBe('screen');
    });
});
