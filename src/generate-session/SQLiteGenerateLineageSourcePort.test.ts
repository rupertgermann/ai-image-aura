import { describe, expect, it } from 'vitest';
import type { GenerateLineageSourcePort } from './SQLiteGenerateLineageSourcePort';
import type { GenerateLineageSource } from './GenerateSession';

class InMemoryGenerateLineageSourcePort implements GenerateLineageSourcePort {
    private source: GenerateLineageSource | null = null;
    private rowPresent = false;
    private rowCount = 0;
    private initialized = false;

    async init(): Promise<void> {
        this.initialized = true;
    }

    async load(): Promise<GenerateLineageSource | null> {
        if (!this.initialized) {
            await this.init();
        }
        if (!this.rowPresent) {
            return null;
        }
        return this.source;
    }

    async save(source: GenerateLineageSource): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.source = { archiveImageId: source.archiveImageId, stepId: source.stepId ?? null };
        this.rowPresent = true;
        this.rowCount = 1;
    }

    async clear(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.source = null;
        this.rowPresent = false;
        this.rowCount = 0;
    }

    getRowCount(): number {
        return this.rowCount;
    }

    rowExists(): boolean {
        return this.rowPresent;
    }
}

function makeSource(overrides: Partial<GenerateLineageSource> = {}): GenerateLineageSource {
    return {
        archiveImageId: 'archive-1',
        stepId: 'step-1',
        ...overrides,
    };
}

describe('GenerateLineageSourcePort contract', () => {
    it('returns null for an empty store', async () => {
        const port = new InMemoryGenerateLineageSourcePort();

        await expect(port.load()).resolves.toBeNull();
    });

    it('round-trips a saved lineage source', async () => {
        const port = new InMemoryGenerateLineageSourcePort();
        const source = makeSource();

        await port.save(source);

        await expect(port.load()).resolves.toEqual(source);
    });

    it('round-trips a lineage source with a null step id', async () => {
        const port = new InMemoryGenerateLineageSourcePort();
        const source = makeSource({ stepId: null });

        await port.save(source);

        await expect(port.load()).resolves.toEqual({ archiveImageId: 'archive-1', stepId: null });
    });

    it('overwrites the lineage source on subsequent save', async () => {
        const port = new InMemoryGenerateLineageSourcePort();

        await port.save(makeSource({ archiveImageId: 'first' }));
        await port.save(makeSource({ archiveImageId: 'second' }));

        const loaded = await port.load();
        expect(loaded?.archiveImageId).toBe('second');
    });

    it('keeps the lineage source table as a singleton across saves', async () => {
        const port = new InMemoryGenerateLineageSourcePort();

        await port.save(makeSource({ archiveImageId: 'first' }));
        await port.save(makeSource({ archiveImageId: 'second' }));
        await port.save(makeSource({ archiveImageId: 'third' }));

        expect(port.getRowCount()).toBe(1);
    });

    it('clears the stored value and distinguishes absence from a null step id', async () => {
        const port = new InMemoryGenerateLineageSourcePort();

        await port.save(makeSource({ stepId: null }));
        expect(port.rowExists()).toBe(true);
        await expect(port.load()).resolves.toEqual({ archiveImageId: 'archive-1', stepId: null });

        await port.clear();

        expect(port.rowExists()).toBe(false);
        await expect(port.load()).resolves.toBeNull();
        expect(port.getRowCount()).toBe(0);
    });
});
