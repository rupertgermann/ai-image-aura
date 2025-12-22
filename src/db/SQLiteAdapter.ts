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
                height INTEGER
            );
        `;

        this.initialized = true;
        console.log('SQLite Database initialized');
    }

    async saveImage(image: ArchiveImage): Promise<void> {
        await this.init();

        // Move binary to storage if it's a data URL
        if (image.url.startsWith('data:')) {
            await storage.save(`img_${image.id}`, image.url);
        }

        await this.sql.sql`
            INSERT OR REPLACE INTO images (id, url, prompt, quality, aspectRatio, background, timestamp, model, width, height) 
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
                ${image.height || 1024}
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
        }

        return images;
    }

    async deleteImage(id: string): Promise<void> {
        await this.init();
        await storage.remove(`img_${id}`);
        await this.sql.sql`DELETE FROM images WHERE id = ${id}`;
    }

    async clearAll(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM images`;
    }
}

export const db = new SQLiteAdapter();
