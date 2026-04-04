import { SQLocal } from 'sqlocal';
import type { LineageStep } from './types';

type LineageStepRow = Omit<LineageStep, 'metadata'> & {
    metadata: string | null;
};

export class SQLiteLineageMetadataPort {
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
            CREATE TABLE IF NOT EXISTS lineage_steps (
                id TEXT PRIMARY KEY,
                archiveImageId TEXT NOT NULL,
                parentStepId TEXT,
                stepType TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                metadata TEXT
            );
        `;

        await this.sql.sql`
            CREATE INDEX IF NOT EXISTS idx_lineage_steps_archive_image_id
            ON lineage_steps (archiveImageId, timestamp);
        `;

        await this.sql.sql`
            CREATE INDEX IF NOT EXISTS idx_lineage_steps_parent_step_id
            ON lineage_steps (parentStepId);
        `;

        this.initialized = true;
    }

    async save(step: LineageStep): Promise<void> {
        await this.init();

        await this.sql.sql`
            INSERT OR REPLACE INTO lineage_steps (id, archiveImageId, parentStepId, stepType, timestamp, metadata)
            VALUES (
                ${step.id},
                ${step.archiveImageId},
                ${step.parentStepId},
                ${step.stepType},
                ${step.timestamp},
                ${JSON.stringify(step.metadata)}
            )
        `;
    }

    async getById(id: string): Promise<LineageStep | null> {
        await this.init();

        const result = await this.sql.sql`SELECT * FROM lineage_steps WHERE id = ${id}`;
        const row = (result as LineageStepRow[])[0];

        return row ? hydrateLineageStep(row) : null;
    }

    async getByArchiveImageId(archiveImageId: string): Promise<LineageStep[]> {
        await this.init();

        const result = await this.sql.sql`
            SELECT *
            FROM lineage_steps
            WHERE archiveImageId = ${archiveImageId}
            ORDER BY timestamp ASC, id ASC
        `;

        return (result as LineageStepRow[]).map(hydrateLineageStep);
    }

    async getChildren(parentStepId: string): Promise<LineageStep[]> {
        await this.init();

        const result = await this.sql.sql`
            SELECT *
            FROM lineage_steps
            WHERE parentStepId = ${parentStepId}
            ORDER BY timestamp ASC, id ASC
        `;

        return (result as LineageStepRow[]).map(hydrateLineageStep);
    }

    async remove(id: string): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM lineage_steps WHERE id = ${id}`;
    }
}

function hydrateLineageStep(row: LineageStepRow): LineageStep {
    return {
        id: row.id,
        archiveImageId: row.archiveImageId,
        parentStepId: row.parentStepId,
        stepType: row.stepType,
        timestamp: row.timestamp,
        metadata: parseMetadata(row.metadata),
    };
}

function parseMetadata(value: string | null): Record<string, unknown> {
    if (!value) {
        return {};
    }

    try {
        const parsed = JSON.parse(value) as unknown;

        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            return parsed as Record<string, unknown>;
        }

        return {};
    } catch {
        return {};
    }
}
