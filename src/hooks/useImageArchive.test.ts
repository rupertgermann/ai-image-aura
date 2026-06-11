import { describe, expect, it } from 'vitest';
import type { ArchiveImage } from '../db/types';
import { filterArchiveImages, sortImagesByTimestamp } from './useImageArchive';

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

    it('filters by prompt search and favorites-only together', () => {
        const images: ArchiveImage[] = [
            createImage({ id: 'favorite-match', prompt: 'Glass city', favorite: true }),
            createImage({ id: 'favorite-miss', prompt: 'Forest path', favorite: true }),
            createImage({ id: 'plain-match', prompt: 'Glass teapot' }),
        ];

        expect(filterArchiveImages(images, {
            search: 'glass',
            favoritesOnly: true,
        }).map((image) => image.id)).toEqual(['favorite-match']);
    });
});

function createImage(overrides: Partial<ArchiveImage>): ArchiveImage {
    return {
        id: 'image',
        url: 'data:image/png;base64,image',
        prompt: 'prompt',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'transparent',
        timestamp: '2026-04-02T09:00:00.000Z',
        ...overrides,
    };
}
