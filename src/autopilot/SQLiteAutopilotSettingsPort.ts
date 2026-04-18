import { SQLocal } from 'sqlocal';
import {
    DEFAULT_AUTOPILOT_SETTINGS,
    sanitizeAutopilotSettings,
    type AutopilotSettings,
} from './AutopilotSettings';

export interface AutopilotSettingsPort {
    init(): Promise<void>;
    load(): Promise<AutopilotSettings | null>;
    save(settings: AutopilotSettings): Promise<void>;
    clear(): Promise<void>;
}

interface AutopilotSettingsRow {
    mode: string | null;
    goal: string | null;
    max_iterations: number | null;
    satisfaction_threshold: number | null;
}

export class SQLiteAutopilotSettingsPort implements AutopilotSettingsPort {
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
            CREATE TABLE IF NOT EXISTS autopilot_settings (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                mode TEXT,
                goal TEXT,
                max_iterations INTEGER,
                satisfaction_threshold REAL
            );
        `;

        this.initialized = true;
    }

    async load(): Promise<AutopilotSettings | null> {
        await this.init();
        const result = await this.sql.sql`
            SELECT mode, goal, max_iterations, satisfaction_threshold
            FROM autopilot_settings WHERE id = 1
        `;
        const row = (result as AutopilotSettingsRow[])[0];
        if (!row) {
            return null;
        }

        return sanitizeAutopilotSettings({
            mode: row.mode ?? DEFAULT_AUTOPILOT_SETTINGS.mode,
            goal: row.goal ?? DEFAULT_AUTOPILOT_SETTINGS.goal,
            maxIterations: row.max_iterations ?? DEFAULT_AUTOPILOT_SETTINGS.maxIterations,
            satisfactionThreshold: row.satisfaction_threshold ?? DEFAULT_AUTOPILOT_SETTINGS.satisfactionThreshold,
        });
    }

    async save(settings: AutopilotSettings): Promise<void> {
        await this.init();
        const sanitized = sanitizeAutopilotSettings(settings);
        await this.sql.sql`
            INSERT OR REPLACE INTO autopilot_settings (id, mode, goal, max_iterations, satisfaction_threshold)
            VALUES (
                1,
                ${sanitized.mode},
                ${sanitized.goal},
                ${sanitized.maxIterations},
                ${sanitized.satisfactionThreshold}
            )
        `;
    }

    async clear(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM autopilot_settings WHERE id = 1`;
    }
}
