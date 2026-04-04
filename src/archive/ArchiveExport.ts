import JSZip from 'jszip';
import type { ArchiveImage } from '../db/types';
import { downloadBlob } from '../download/download';

export async function downloadArchiveImagesAsZip(images: ArchiveImage[]) {
    const zip = new JSZip();

    for (const image of images) {
        zip.file(`aura-${image.id}.png`, await imageUrlToBlob(image.url));
    }

    const content = await zip.generateAsync({ type: 'blob' });
    downloadBlob(content, `aura-collection-${Date.now()}.zip`);
}

async function imageUrlToBlob(url: string) {
    if (!url.startsWith('data:')) {
        const response = await fetch(url);
        return response.blob();
    }

    const [metadata, base64Data] = url.split(',', 2);
    if (!metadata || !base64Data) {
        throw new Error('Invalid image data URL');
    }

    const mimeType = metadata.match(/data:(.*?);base64/)?.[1] ?? 'image/png';
    const binary = atob(base64Data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    return new Blob([bytes], { type: mimeType });
}
