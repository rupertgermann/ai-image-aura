import { describe, expect, it } from 'vitest';
import { buildActualParameterDetails, hasActualParameterDetails } from './actualParameters';

describe('actual parameter details', () => {
    it('omits details for legacy images without actual parameters', () => {
        const details = buildActualParameterDetails({});

        expect(details).toEqual({ rows: [] });
        expect(hasActualParameterDetails(details)).toBe(false);
    });

    it('compares requested and actual size and quality values', () => {
        const details = buildActualParameterDetails({
            requestedParameters: {
                size: '1024x1024',
                quality: 'high',
            },
            actualParameters: {
                size: '1536x1024',
                quality: 'high',
            },
        });

        expect(details.rows).toEqual([
            {
                label: 'Size',
                requested: '1024x1024',
                actual: '1536x1024',
                changed: true,
            },
            {
                label: 'Quality',
                requested: 'high',
                actual: 'high',
                changed: false,
            },
        ]);
        expect(hasActualParameterDetails(details)).toBe(true);
    });

    it('formats revised prompt and elapsed time when present', () => {
        expect(buildActualParameterDetails({
            actualParameters: {
                revisedPrompt: 'A more detailed prompt',
                elapsedMs: 930,
            },
        })).toEqual({
            rows: [],
            revisedPrompt: 'A more detailed prompt',
            elapsedLabel: '930 ms',
        });

        expect(buildActualParameterDetails({
            actualParameters: {
                elapsedMs: 1234,
            },
        }).elapsedLabel).toBe('1.2 s');
    });
});
