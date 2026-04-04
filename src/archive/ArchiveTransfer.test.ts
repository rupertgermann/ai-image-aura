import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import type { ArchiveStore } from './ArchiveStore';
import type { ArchiveImage } from '../db/types';
import { buildArchiveZip, importArchiveZip, LINEAGE_MANIFEST_FILE } from './ArchiveTransfer';
import { createLineageStore, type LineageMetadataPort, type LineageStep, type LineageStore } from '../lineage/LineageStore';

class InMemoryLineageMetadataPort implements LineageMetadataPort {
    private readonly steps = new Map<string, LineageStep>();

    async init(): Promise<void> {
        return undefined;
    }

    async save(step: LineageStep): Promise<void> {
        this.steps.set(step.id, step);
    }

    async getById(id: string): Promise<LineageStep | null> {
        return this.steps.get(id) ?? null;
    }

    async getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]> {
        return Array.from(this.steps.values())
            .filter((step) => step.archiveImageId === archiveImageId)
            .sort(compareSteps);
    }

    async getChildren(parentStepId: string): Promise<LineageStep[]> {
        return Array.from(this.steps.values())
            .filter((step) => step.parentStepId === parentStepId)
            .sort(compareSteps);
    }

    async remove(id: string): Promise<void> {
        this.steps.delete(id);
    }
}

class InMemoryArchiveStore implements Pick<ArchiveStore, 'save'> {
    readonly images = new Map<string, ArchiveImage>();

    async save(input: ArchiveImage): Promise<ArchiveImage> {
        this.images.set(input.id, input);
        return input;
    }
}

describe('ArchiveTransfer', () => {
    it('exports a lineage manifest with every exported image step', async () => {
        const lineage = createStore();
        const images = createImages();

        await seedLineage(lineage);

        const zipBytes = await buildArchiveZip(images, { lineageStore: lineage });
        const zip = await JSZip.loadAsync(zipBytes);
        const manifestText = await zip.file(LINEAGE_MANIFEST_FILE)?.async('text');

        expect(manifestText).toBeTruthy();
        expect(JSON.parse(manifestText ?? 'null')).toEqual({
            version: 1,
            steps: [
                expect.objectContaining({ id: 'step-1', stepType: 'generation' }),
                expect.objectContaining({ id: 'step-2', stepType: 'overwrite' }),
                expect.objectContaining({ id: 'step-3', stepType: 'ai-edit' }),
                expect.objectContaining({ id: 'step-4', stepType: 'save-as-copy' }),
            ],
        });
    });

    it('round-trips archive images and lineage relationships through ZIP import', async () => {
        const sourceLineage = createStore();
        const sourceImages = createImages();
        await seedLineage(sourceLineage);

        const zipBytes = await buildArchiveZip(sourceImages, { lineageStore: sourceLineage });
        const archiveStore = new InMemoryArchiveStore();
        const importedLineage = createStore();

        const summary = await importArchiveZip(zipBytes, {
            archiveStore,
            lineageStore: importedLineage,
        });

        expect(summary.brokenParentReferences).toEqual([]);
        expect(summary.missingAssetFiles).toEqual([]);
        expect(summary.importedImageIds).toEqual(['image-1', 'image-2', 'image-3']);
        expect(summary.importedStepIds).toEqual(['step-1', 'step-2', 'step-3', 'step-4']);
        expect(Array.from(archiveStore.images.keys())).toEqual(['image-1', 'image-2', 'image-3']);

        await expect(importedLineage.getByArchiveImageId('image-1')).resolves.toEqual([
            expect.objectContaining({ id: 'step-1', stepType: 'generation', parentStepId: null }),
            expect.objectContaining({ id: 'step-2', stepType: 'overwrite', parentStepId: 'step-1' }),
        ]);
        await expect(importedLineage.getByArchiveImageId('image-2')).resolves.toEqual([
            expect.objectContaining({ id: 'step-3', stepType: 'ai-edit', parentStepId: 'step-2' }),
        ]);
        await expect(importedLineage.getByArchiveImageId('image-3')).resolves.toEqual([
            expect.objectContaining({ id: 'step-4', stepType: 'save-as-copy', parentStepId: 'step-2' }),
        ]);
    });

    it('reports broken parent references during import instead of dropping them', async () => {
        const zip = new JSZip();
        zip.file('aura-image-1.png', Uint8Array.from([105, 109, 103]));
        zip.file('archive-manifest.json', JSON.stringify({
            version: 1,
            images: [
                {
                    id: 'image-1',
                    prompt: 'broken import',
                    quality: 'high',
                    aspectRatio: '1024x1024',
                    background: 'transparent',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    imageFileName: 'aura-image-1.png',
                    references: [],
                },
            ],
        }));
        zip.file('lineage-manifest.json', JSON.stringify({
            version: 1,
            steps: [
                {
                    id: 'step-1',
                    archiveImageId: 'image-1',
                    parentStepId: 'missing-parent',
                    stepType: 'save-as-copy',
                    timestamp: '2026-04-04T09:00:00.000Z',
                    metadata: {},
                },
            ],
        }));

        const summary = await importArchiveZip(await zip.generateAsync({ type: 'uint8array' }), {
            archiveStore: new InMemoryArchiveStore(),
            lineageStore: createStore(),
        });

        expect(summary.brokenParentReferences).toEqual([
            { stepId: 'step-1', parentStepId: 'missing-parent' },
        ]);
        expect(summary.importedStepIds).toEqual(['step-1']);
    });
});

function createStore(): LineageStore {
    return createLineageStore({ metadata: new InMemoryLineageMetadataPort() });
}

function createImages(): ArchiveImage[] {
    return [
        {
            id: 'image-1',
            url: 'data:image/png;base64,aaaa',
            prompt: 'glass city at dawn',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T09:00:00.000Z',
            model: 'gpt-image-1.5',
            width: 1024,
            height: 1024,
            references: ['data:image/png;base64,ref1'],
        },
        {
            id: 'image-2',
            url: 'data:image/png;base64,bbbb',
            prompt: 'glass city with neon reflections',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T10:00:00.000Z',
            model: 'gpt-image-1.5',
            width: 1024,
            height: 1024,
            references: [],
        },
        {
            id: 'image-3',
            url: 'data:image/png;base64,cccc',
            prompt: 'glass city alternate branch',
            quality: 'high',
            aspectRatio: '1024x1024',
            background: 'transparent',
            timestamp: '2026-04-04T11:00:00.000Z',
            model: 'gpt-image-1.5',
            width: 1024,
            height: 1024,
            references: [],
        },
    ];
}

async function seedLineage(lineage: LineageStore) {
    await lineage.save({
        id: 'step-1',
        archiveImageId: 'image-1',
        parentStepId: null,
        stepType: 'generation',
        timestamp: '2026-04-04T09:00:00.000Z',
        metadata: { prompt: 'glass city at dawn' },
    });
    await lineage.save({
        id: 'step-2',
        archiveImageId: 'image-1',
        parentStepId: 'step-1',
        stepType: 'overwrite',
        timestamp: '2026-04-04T09:30:00.000Z',
        metadata: { editorAdjustments: { brightness: 110, contrast: 100, saturation: 100, filter: 'none' } },
    });
    await lineage.save({
        id: 'step-3',
        archiveImageId: 'image-2',
        parentStepId: 'step-2',
        stepType: 'ai-edit',
        timestamp: '2026-04-04T10:00:00.000Z',
        metadata: { editPrompt: 'add neon reflections' },
    });
    await lineage.save({
        id: 'step-4',
        archiveImageId: 'image-3',
        parentStepId: 'step-2',
        stepType: 'save-as-copy',
        timestamp: '2026-04-04T11:00:00.000Z',
        metadata: { editorAdjustments: { brightness: 100, contrast: 120, saturation: 100, filter: 'none' } },
    });
}

function compareSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}
