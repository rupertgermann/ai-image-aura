import { SQLocal } from 'sqlocal';
import type { GenerateLineageSource } from './GenerateSession';

export interface GenerateLineageSourcePort {
    init(): Promise<void>;
    load(): Promise<GenerateLineageSource | null>;
    save(source: GenerateLineageSource): Promise<void>;
    clear(): Promise<void>;
}

interface GenerateLineageSourceRow {
    archive_image_id: string | null;
    step_id: string | null;
}

export class SQLiteGenerateLineageSourcePort implements GenerateLineageSourcePort {
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
            CREATE TABLE IF NOT EXISTS generate_lineage_source (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                archive_image_id TEXT,
                step_id TEXT
            );
        `;

        this.initialized = true;
    }

    async load(): Promise<GenerateLineageSource | null> {
        await this.init();
        const result = await this.sql.sql`
            SELECT archive_image_id, step_id
            FROM generate_lineage_source WHERE id = 1
        `;
        const row = (result as GenerateLineageSourceRow[])[0];
        if (!row) {
            return null;
        }

        if (typeof row.archive_image_id !== 'string' || row.archive_image_id.length === 0) {
            return null;
        }

        return {
            archiveImageId: row.archive_image_id,
            stepId: row.step_id,
        };
    }

    async save(source: GenerateLineageSource): Promise<void> {
        await this.init();
        await this.sql.sql`
            INSERT OR REPLACE INTO generate_lineage_source (id, archive_image_id, step_id)
            VALUES (
                1,
                ${source.archiveImageId},
                ${source.stepId ?? null}
            )
        `;
    }

    async clear(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM generate_lineage_source WHERE id = 1`;
    }
}
