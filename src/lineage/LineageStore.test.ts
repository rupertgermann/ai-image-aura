import { describe, expect, it } from 'vitest';
import { createLineageStore, type LineageMetadataPort, type LineageStep } from './LineageStore';

class InMemoryLineageMetadataPort implements LineageMetadataPort {
    private readonly steps = new Map<string, LineageStep>();
    private initialized = false;

    async init(): Promise<void> {
        this.initialized = true;
    }

    async save(step: LineageStep): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }

        this.steps.set(step.id, step);
    }

    async getById(id: string): Promise<LineageStep | null> {
        if (!this.initialized) {
            await this.init();
        }

        return this.steps.get(id) ?? null;
    }

    async getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]> {
        if (!this.initialized) {
            await this.init();
        }

        return Array.from(this.steps.values())
            .filter((step) => step.archiveImageId === archiveImageId)
            .sort(compareSteps);
    }

    async getChildren(parentStepId: string): Promise<LineageStep[]> {
        if (!this.initialized) {
            await this.init();
        }

        return Array.from(this.steps.values())
            .filter((step) => step.parentStepId === parentStepId)
            .sort(compareSteps);
    }

    async remove(id: string): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }

        this.steps.delete(id);
    }
}

describe('LineageStore', () => {
    it('saves a step with a stable generated id', async () => {
        const store = createStore();

        const step = await store.save({
            archiveImageId: 'image-1',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: { prompt: 'Studio portrait' },
        });

        expect(step.id).toBe('step-1');
        await expect(store.getById('step-1')).resolves.toEqual(step);
    });

    it('returns null and empty collections for unknown lineage references', async () => {
        const store = createStore();

        await expect(store.getById('missing-step')).resolves.toBeNull();
        await expect(store.getByArchiveImageId('missing-image')).resolves.toEqual([]);
        await expect(store.getChildren('missing-parent')).resolves.toEqual([]);
    });

    it('returns image steps ordered by timestamp', async () => {
        const store = createStore();

        await store.save({
            archiveImageId: 'image-1',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: {},
        });

        await store.save({
            archiveImageId: 'image-1',
            parentStepId: 'step-1',
            stepType: 'overwrite',
            timestamp: '2026-04-04T11:00:00.000Z',
            metadata: {},
        });

        const steps = await store.getByArchiveImageId('image-1');

        expect(steps.map((step) => step.id)).toEqual(['step-1', 'step-2']);
    });

    it('returns children for a parent without failing when the parent record is absent', async () => {
        const store = createStore();

        await store.save({
            archiveImageId: 'image-1',
            parentStepId: 'missing-parent',
            stepType: 'save-as-copy',
            timestamp: '2026-04-04T12:00:00.000Z',
            metadata: {},
        });

        const children = await store.getChildren('missing-parent');

        expect(children).toHaveLength(1);
        expect(children[0]?.id).toBe('step-1');
    });

    it('removes only the targeted step', async () => {
        const store = createStore();

        await store.save({
            archiveImageId: 'image-1',
            parentStepId: null,
            stepType: 'generation',
            timestamp: '2026-04-04T09:00:00.000Z',
            metadata: {},
        });

        await store.save({
            archiveImageId: 'image-2',
            parentStepId: 'step-1',
            stepType: 'save-as-copy',
            timestamp: '2026-04-04T10:00:00.000Z',
            metadata: {},
        });

        await store.save({
            archiveImageId: 'image-3',
            parentStepId: 'step-1',
            stepType: 'save-as-copy',
            timestamp: '2026-04-04T11:00:00.000Z',
            metadata: {},
        });

        await store.remove('step-2');

        await expect(store.getById('step-2')).resolves.toBeNull();
        await expect(store.getById('step-3')).resolves.toMatchObject({ id: 'step-3', parentStepId: 'step-1' });
        await expect(store.getChildren('step-1')).resolves.toEqual([
            expect.objectContaining({ id: 'step-3' }),
        ]);
    });
});

function createStore() {
    let nextId = 0;

    return createLineageStore({
        metadata: new InMemoryLineageMetadataPort(),
        makeId: () => {
            nextId += 1;
            return `step-${nextId}`;
        },
    });
}

function compareSteps(left: LineageStep, right: LineageStep) {
    return left.timestamp.localeCompare(right.timestamp) || left.id.localeCompare(right.id);
}
