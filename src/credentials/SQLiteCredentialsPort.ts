import { SQLocal } from 'sqlocal';

export interface CredentialsPort {
    init(): Promise<void>;
    load(): Promise<string | null>;
    save(apiKey: string): Promise<void>;
    clear(): Promise<void>;
}

interface CredentialsRow {
    openai_api_key: string | null;
}

export class SQLiteCredentialsPort implements CredentialsPort {
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
            CREATE TABLE IF NOT EXISTS app_credentials (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                openai_api_key TEXT
            );
        `;

        this.initialized = true;
    }

    async load(): Promise<string | null> {
        await this.init();
        const result = await this.sql.sql`
            SELECT openai_api_key FROM app_credentials WHERE id = 1
        `;
        const row = (result as CredentialsRow[])[0];
        return row?.openai_api_key ?? null;
    }

    async save(apiKey: string): Promise<void> {
        await this.init();
        await this.sql.sql`
            INSERT OR REPLACE INTO app_credentials (id, openai_api_key)
            VALUES (1, ${apiKey})
        `;
    }

    async clear(): Promise<void> {
        await this.init();
        await this.sql.sql`DELETE FROM app_credentials WHERE id = 1`;
    }
}
