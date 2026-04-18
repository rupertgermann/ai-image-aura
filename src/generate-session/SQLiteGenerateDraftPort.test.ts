import { describe, expect, it } from 'vitest';
import type { GenerateDraftPort } from './SQLiteGenerateDraftPort';
import type { GenerateDraft } from './GenerateSession';

class InMemoryGenerateDraftPort implements GenerateDraftPort {
    private draft: GenerateDraft | null = null;
    private rowCount = 0;
    private initialized = false;

    async init(): Promise<void> {
        this.initialized = true;
    }

    async load(): Promise<GenerateDraft | null> {
        if (!this.initialized) {
            await this.init();
        }
        return this.draft;
    }

    async save(draft: GenerateDraft): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.draft = { ...draft };
        this.rowCount = 1;
    }

    async clear(): Promise<void> {
        if (!this.initialized) {
            await this.init();
        }
        this.draft = null;
        this.rowCount = 0;
    }

    getRowCount(): number {
        return this.rowCount;
    }
}

function makeDraft(overrides: Partial<GenerateDraft> = {}): GenerateDraft {
    return {
        prompt: 'a koi pond at dusk',
        quality: 'high',
        aspectRatio: '1024x1024',
        background: 'auto',
        style: 'risograph poster',
        lighting: 'golden hour',
        palette: 'copper + teal + cream',
        isSaved: true,
        ...overrides,
    };
}

describe('GenerateDraftPort contract', () => {
    it('returns null for an empty store', async () => {
        const port = new InMemoryGenerateDraftPort();

        await expect(port.load()).resolves.toBeNull();
    });

    it('round-trips a saved draft', async () => {
        const port = new InMemoryGenerateDraftPort();
        const draft = makeDraft();

        await port.save(draft);

        await expect(port.load()).resolves.toEqual(draft);
    });

    it('overwrites the draft on subsequent save', async () => {
        const port = new InMemoryGenerateDraftPort();

        await port.save(makeDraft({ prompt: 'first' }));
        await port.save(makeDraft({ prompt: 'second' }));

        const loaded = await port.load();
        expect(loaded?.prompt).toBe('second');
    });

    it('keeps the draft table as a singleton across saves', async () => {
        const port = new InMemoryGenerateDraftPort();

        await port.save(makeDraft({ prompt: 'first' }));
        await port.save(makeDraft({ prompt: 'second' }));
        await port.save(makeDraft({ prompt: 'third' }));

        expect(port.getRowCount()).toBe(1);
    });

    it('clears the stored value', async () => {
        const port = new InMemoryGenerateDraftPort();

        await port.save(makeDraft());
        await port.clear();

        await expect(port.load()).resolves.toBeNull();
        expect(port.getRowCount()).toBe(0);
    });
});
