import { SQLocal } from 'sqlocal';
import { storage } from '../services/StorageService';
import type { DatabaseAdapter, ArchiveImage } from './types';

export class SQLiteAdapter implements DatabaseAdapter {
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

        // Migration: Ensure ref_ids column exists
        try {
            await this.sql.sql`ALTER TABLE images ADD COLUMN ref_ids TEXT`;
            console.log('Migrated: Added ref_ids column');
        } catch (e) {
        }

        // Migration: Ensure style column exists
        try {
            await this.sql.sql`ALTER TABLE images ADD COLUMN style TEXT`;
            console.log('Migrated: Added style column');
        } catch (e) {
            // Column likely already exists, ignore
        }

        this.initialized = true;
        console.log('SQLite Database initialized');
    }

    async saveImage(image: ArchiveImage): Promise<void> {
        await this.init();

        // Move binary to storage if it's a data URL
        if (image.url.startsWith('data:')) {
            await storage.save(`img_${image.id}`, image.url);
        }

        // Handle Reference Images
        let refIds: number[] = [];
        if (image.references && image.references.length > 0) {
            // Save each reference blob to storage
            for (let i = 0; i < image.references.length; i++) {
                await storage.save(`ref_${image.id}_${i}`, image.references[i]);
                refIds.push(i);
            }
        }

        await this.sql.sql`
            INSERT OR REPLACE INTO images (id, url, prompt, quality, aspectRatio, background, timestamp, model, width, height, ref_ids, style) 
            VALUES (
                ${image.id}, 
                ${image.id}, -- Store ID as internal reference in url column
                ${image.prompt}, 
                ${image.quality}, 
                ${image.aspectRatio}, 
                ${image.background}, 
                ${image.timestamp},
                ${image.model || 'gpt-image-1.5'},
                ${image.width || 1024},
                ${image.height || 1024},
                ${JSON.stringify(refIds)},
                ${image.style || null}
            )
        `;
    }

    async getImages(): Promise<ArchiveImage[]> {
        await this.init();
        const result = await this.sql.sql`SELECT * FROM images ORDER BY timestamp DESC`;
        const images = result as ArchiveImage[];

        // Resolve images with their binary data
        for (const img of images) {
            const data = await storage.load(`img_${img.id}`);
            if (data) img.url = data;

            // Load references if present
            // @ts-ignore - ref_ids comes back as string from DB
            if (img.ref_ids) {
                try {
                    // @ts-ignore
                    const refIds = JSON.parse(img.ref_ids) as number[];
                    const loadedRefs: string[] = [];
                    for (const idx of refIds) {
                        const refData = await storage.load(`ref_${img.id}_${idx}`);
                        if (refData) loadedRefs.push(refData);
                    }
                    img.references = loadedRefs;
                } catch (e) {
                    console.error('Failed to parse references for image', img.id, e);
                    img.references = [];
                }
            }
        }

        return images;
    }

    async deleteImage(id: string): Promise<void> {
        await this.init();
        await storage.remove(`img_${id}`);

        // We need to fetch the image first to know how many references to delete
        // Or we can just brute force delete a reasonable number, but fetching is safer
        const result = await this.sql.sql`SELECT ref_ids FROM images WHERE id = ${id}`;
        // @ts-ignore
        if (result && result.length > 0 && result[0].ref_ids) {
            try {
                // @ts-ignore
                const refIds = JSON.parse(result[0].ref_ids) as number[];
                for (const idx of refIds) {
                    await storage.remove(`ref_${id}_${idx}`);
                }
            } catch (e) { /* ignore parse error */ }
        }

        await this.sql.sql`DELETE FROM images WHERE id = ${id}`;
    }

    async clearAll(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM images`;
    }
}

export const db = new SQLiteAdapter();
