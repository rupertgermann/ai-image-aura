import { SQLocal } from 'sqlocal';
import type { ArchiveImage, ArchiveLayerStack } from '../db/types';
import { OPENAI_IMAGE_MODEL } from '../utils/openaiModels';
import { createDurableLayerStackMetadata } from './ArchiveAssets';

type ArchiveImageRow = ArchiveImage & {
    favorite?: number | null;
    ref_ids?: string;
    layer_stack?: string;
    actual_parameters?: string | null;
};

type ArchiveMetadataRecord = Omit<ArchiveImage, 'url' | 'references'> & {
    storedUrl: string;
    referenceIds: number[];
    layerStack?: ArchiveLayerStack;
};

export class SQLiteArchiveMetadataPort {
    private sql: SQLocal;
    private initialized: boolean = false;

    constructor() {
        this.sql = new SQLocal('aura_database.sqlite3');
    }

    async init(): Promise<void> {
        if (this.initialized) return;

        await this.sql.sql`
            CREATE TABLE IF NOT EXISTS images (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                prompt TEXT,
                quality TEXT,
                aspectRatio TEXT,
                background TEXT,
                timestamp TEXT,
                model TEXT,
                width INTEGER,
                height INTEGER,
                favorite INTEGER,
                ref_ids TEXT,
                style TEXT
            );
        `;

        await this.sql.sql`ALTER TABLE images ADD COLUMN ref_ids TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN style TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN lighting TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN palette TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN layer_stack TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN favorite INTEGER`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN actual_parameters TEXT`.catch(() => null);

        this.initialized = true;
    }

    async save(record: ArchiveMetadataRecord): Promise<void> {
        await this.init();

        await this.sql.sql`
            INSERT OR REPLACE INTO images (id, url, prompt, quality, aspectRatio, background, timestamp, model, width, height, favorite, ref_ids, style, lighting, palette, layer_stack, actual_parameters)
            VALUES (
                ${record.id},
                ${record.storedUrl},
                ${record.prompt},
                ${record.quality},
                ${record.aspectRatio},
                ${record.background},
                ${record.timestamp},
                ${record.model || OPENAI_IMAGE_MODEL},
                ${record.width ?? null},
                ${record.height ?? null},
                ${record.favorite ? 1 : null},
                ${JSON.stringify(record.referenceIds)},
                ${record.style || null},
                ${record.lighting || null},
                ${record.palette || null},
                ${record.layerStack ? JSON.stringify(createDurableLayerStackMetadata(record.layerStack)) : null},
                ${record.actualParameters ? JSON.stringify(record.actualParameters) : null}
            )
        `;
    }

    async list(): Promise<ArchiveMetadataRecord[]> {
        await this.init();
        const result = await this.sql.sql`SELECT * FROM images ORDER BY timestamp DESC`;
        const images = result as ArchiveImageRow[];

        return images.map((image) => ({
            id: image.id,
            storedUrl: image.url,
            prompt: image.prompt,
            quality: image.quality,
            aspectRatio: image.aspectRatio,
            background: image.background,
            timestamp: image.timestamp,
            model: image.model,
            width: optionalNumber(image.width),
            height: optionalNumber(image.height),
            favorite: parseFavorite(image.favorite),
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            actualParameters: parseActualParameters(image.actual_parameters),
            referenceIds: parseReferenceIds(image.ref_ids),
            layerStack: parseLayerStack(image.layer_stack),
        }));
    }

    async get(id: string): Promise<ArchiveMetadataRecord | null> {
        await this.init();
        const result = await this.sql.sql`SELECT * FROM images WHERE id = ${id}`;
        const row = (result as ArchiveImageRow[])[0];

        if (!row) {
            return null;
        }

        return {
            id: row.id,
            storedUrl: row.url,
            prompt: row.prompt,
            quality: row.quality,
            aspectRatio: row.aspectRatio,
            background: row.background,
            timestamp: row.timestamp,
            model: row.model,
            width: optionalNumber(row.width),
            height: optionalNumber(row.height),
            favorite: parseFavorite(row.favorite),
            style: row.style,
            lighting: row.lighting,
            palette: row.palette,
            actualParameters: parseActualParameters(row.actual_parameters),
            referenceIds: parseReferenceIds(row.ref_ids),
            layerStack: parseLayerStack(row.layer_stack),
        };
    }

    async remove(id: string): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM images WHERE id = ${id}`;
    }
}

const parseReferenceIds = (value?: string): number[] => {
    if (!value) {
        return [];
    }

    try {
        return JSON.parse(value) as number[];
    } catch {
        return [];
    }
};

const optionalNumber = (value: unknown): number | undefined => {
    return typeof value === 'number' ? value : undefined;
};

const parseFavorite = (value: unknown): boolean | undefined => {
    return value === 1 || value === true ? true : undefined;
};

const parseActualParameters = (value?: string | null): ArchiveImage['actualParameters'] | undefined => {
    if (!value) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(value) as unknown;
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return undefined;
        }

        const record = parsed as Record<string, unknown>;
        const actualParameters: ArchiveImage['actualParameters'] = {
            ...(typeof record.revisedPrompt === 'string' ? { revisedPrompt: record.revisedPrompt } : {}),
            ...(typeof record.size === 'string' ? { size: record.size } : {}),
            ...(typeof record.quality === 'string' ? { quality: record.quality } : {}),
            ...(typeof record.elapsedMs === 'number' && Number.isFinite(record.elapsedMs) ? { elapsedMs: record.elapsedMs } : {}),
        };

        return Object.keys(actualParameters).length > 0 ? actualParameters : undefined;
    } catch {
        return undefined;
    }
};

const parseLayerStack = (value?: string): ArchiveLayerStack | undefined => {
    if (!value) {
        return undefined;
    }

    try {
        const parsed = JSON.parse(value) as ArchiveLayerStack;
        if (!parsed || !Array.isArray(parsed.layers)) {
            return undefined;
        }

        return parsed;
    } catch {
        return undefined;
    }
};
