import { describe, expect, it } from 'vitest';
import type { ArchiveImage } from '../db/types';
import { sortImagesByTimestamp } from './useImageArchive';

describe('useImageArchive helpers', () => {
    it('orders images by timestamp descending', () => {
        const images: ArchiveImage[] = [
            {
                id: 'older',
                url: 'data:image/png;base64,older',
                prompt: 'older',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                timestamp: '2026-04-01T09:00:00.000Z',
            },
            {
                id: 'newer',
                url: 'data:image/png;base64,newer',
                prompt: 'newer',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                timestamp: '2026-04-02T09:00:00.000Z',
            },
            {
                id: 'middle',
                url: 'data:image/png;base64,middle',
                prompt: 'middle',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                timestamp: '2026-04-01T10:00:00.000Z',
            },
        ];

        expect(sortImagesByTimestamp(images).map((image) => image.id)).toEqual([
            'newer',
            'middle',
            'older',
        ]);
    });

    it('keeps images with the same timestamp in their input order', () => {
        const images: ArchiveImage[] = [
            {
                id: 'first',
                url: 'data:image/png;base64,first',
                prompt: 'first',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                timestamp: '2026-04-02T09:00:00.000Z',
            },
            {
                id: 'second',
                url: 'data:image/png;base64,second',
                prompt: 'second',
                quality: 'high',
                aspectRatio: '1024x1024',
                background: 'transparent',
                timestamp: '2026-04-02T09:00:00.000Z',
            },
        ];

        expect(sortImagesByTimestamp(images).map((image) => image.id)).toEqual([
            'first',
            'second',
        ]);
    });
});
