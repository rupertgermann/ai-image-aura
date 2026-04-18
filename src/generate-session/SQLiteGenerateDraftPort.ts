import { SQLocal } from 'sqlocal';
import type { GenerateDraft } from './GenerateSession';
import { DEFAULT_GENERATE_DRAFT, sanitizeGenerateDraft } from './GenerateSession';

export interface GenerateDraftPort {
    init(): Promise<void>;
    load(): Promise<GenerateDraft | null>;
    save(draft: GenerateDraft): Promise<void>;
    clear(): Promise<void>;
}

interface GenerateDraftRow {
    prompt: string | null;
    quality: string | null;
    aspect_ratio: string | null;
    background: string | null;
    style: string | null;
    lighting: string | null;
    palette: string | null;
    is_saved: number | null;
}

export class SQLiteGenerateDraftPort implements GenerateDraftPort {
    private readonly sql: SQLocal;
    private initialized = false;

    constructor(databaseName: string = 'aura_database.sqlite3') {
        this.sql = new SQLocal(databaseName);
    }

    async init(): Promise<void> {
        if (this.initialized) {
            return;
        }

        await this.sql.sql`
            CREATE TABLE IF NOT EXISTS generate_draft (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                prompt TEXT,
                quality TEXT,
                aspect_ratio TEXT,
                background TEXT,
                style TEXT,
                lighting TEXT,
                palette TEXT,
                is_saved INTEGER
            );
        `;

        this.initialized = true;
    }

    async load(): Promise<GenerateDraft | null> {
        await this.init();
        const result = await this.sql.sql`
            SELECT prompt, quality, aspect_ratio, background, style, lighting, palette, is_saved
            FROM generate_draft WHERE id = 1
        `;
        const row = (result as GenerateDraftRow[])[0];
        if (!row) {
            return null;
        }

        return sanitizeGenerateDraft({
            prompt: row.prompt ?? DEFAULT_GENERATE_DRAFT.prompt,
            quality: row.quality ?? DEFAULT_GENERATE_DRAFT.quality,
            aspectRatio: row.aspect_ratio ?? DEFAULT_GENERATE_DRAFT.aspectRatio,
            background: row.background ?? DEFAULT_GENERATE_DRAFT.background,
            style: row.style ?? DEFAULT_GENERATE_DRAFT.style,
            lighting: row.lighting ?? DEFAULT_GENERATE_DRAFT.lighting,
            palette: row.palette ?? DEFAULT_GENERATE_DRAFT.palette,
            isSaved: row.is_saved === 1,
        });
    }

    async save(draft: GenerateDraft): Promise<void> {
        await this.init();
        const sanitized = sanitizeGenerateDraft(draft);
        await this.sql.sql`
            INSERT OR REPLACE INTO generate_draft (id, prompt, quality, aspect_ratio, background, style, lighting, palette, is_saved)
            VALUES (
                1,
                ${sanitized.prompt},
                ${sanitized.quality},
                ${sanitized.aspectRatio},
                ${sanitized.background},
                ${sanitized.style},
                ${sanitized.lighting},
                ${sanitized.palette},
                ${sanitized.isSaved ? 1 : 0}
            )
        `;
    }

    async clear(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM generate_draft WHERE id = 1`;
    }
}
