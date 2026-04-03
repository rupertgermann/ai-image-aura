import type { ArchiveImage } from '../db/types';

export function downloadUrl(url: string, filename: string) {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
}

export function downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    downloadUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function downloadArchiveImage(image: Pick<ArchiveImage, 'id' | 'url'>) {
    downloadUrl(image.url, `aura-${image.id}.png`);
}

export function downloadGeneratedImage(url: string) {
    downloadUrl(url, `aura-generation-${Date.now()}.png`);
}
