import { SQLocal } from 'sqlocal';
import type { ArchiveImage } from '../db/types';

type ArchiveImageRow = ArchiveImage & { ref_ids?: string };

type ArchiveMetadataRecord = Omit<ArchiveImage, 'url' | 'references'> & {
    storedUrl: string;
    referenceIds: number[];
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
                ref_ids TEXT,
                style TEXT
            );
        `;

        await this.sql.sql`ALTER TABLE images ADD COLUMN ref_ids TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN style TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN lighting TEXT`.catch(() => null);
        await this.sql.sql`ALTER TABLE images ADD COLUMN palette TEXT`.catch(() => null);

        this.initialized = true;
    }

    async save(record: ArchiveMetadataRecord): Promise<void> {
        await this.init();

        await this.sql.sql`
            INSERT OR REPLACE INTO images (id, url, prompt, quality, aspectRatio, background, timestamp, model, width, height, ref_ids, style, lighting, palette)
            VALUES (
                ${record.id},
                ${record.storedUrl},
                ${record.prompt},
                ${record.quality},
                ${record.aspectRatio},
                ${record.background},
                ${record.timestamp},
                ${record.model || 'gpt-image-1.5'},
                ${record.width || 1024},
                ${record.height || 1024},
                ${JSON.stringify(record.referenceIds)},
                ${record.style || null},
                ${record.lighting || null},
                ${record.palette || null}
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
            width: image.width,
            height: image.height,
            style: image.style,
            lighting: image.lighting,
            palette: image.palette,
            referenceIds: parseReferenceIds(image.ref_ids),
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
            width: row.width,
            height: row.height,
            style: row.style,
            lighting: row.lighting,
            palette: row.palette,
            referenceIds: parseReferenceIds(row.ref_ids),
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
