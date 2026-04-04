import JSZip from 'jszip';
import type { ArchiveImage } from '../db/types';
import { downloadBlob } from '../download/download';
import { lineageStore } from '../lineage/LineageStore';
import { buildArchiveZip } from './ArchiveTransfer';

export async function downloadArchiveImagesAsZip(images: ArchiveImage[]) {
    const bytes = await buildArchiveZip(images, {
        lineageStore,
        createZip: () => new JSZip(),
    });
    const normalizedBytes = new Uint8Array(bytes.byteLength);
    normalizedBytes.set(bytes);
    const content = new Blob([normalizedBytes], { type: 'application/zip' });
    downloadBlob(content, `aura-collection-${Date.now()}.zip`);
}
