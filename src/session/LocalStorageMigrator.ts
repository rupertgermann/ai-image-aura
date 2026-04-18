import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';

export const MIGRATION_DECISION_KEY = 'aura_storage_migration_decision';
export const API_KEY_PRIMARY_LS_KEY = 'aura_openapi_key';
export const API_KEY_LEGACY_LS_KEY = 'openai_api_key';

export type MigrationDecision = 'migrated' | 'declined';

export interface MigrationFieldSnapshot {
    present: boolean;
}

export interface MigrationSnapshot {
    apiKey: MigrationFieldSnapshot;
}

export interface MigrationFieldOutcome {
    detected: boolean;
    migrated: boolean;
    error?: Error;
}

export interface MigrationOutcome {
    apiKey: MigrationFieldOutcome;
}

export interface CreateLocalStorageMigratorDeps {
    credentialsPort: Pick<CredentialsPort, 'save'>;
    localStorage?: Storage;
}

export interface LocalStorageMigrator {
    detect(): MigrationSnapshot;
    hasMigratableData(): boolean;
    migrate(): Promise<MigrationOutcome>;
    decline(): void;
    getDecision(): MigrationDecision | null;
    resetDecision(): void;
}

export function createLocalStorageMigrator(deps: CreateLocalStorageMigratorDeps): LocalStorageMigrator {
    const ls = deps.localStorage ?? window.localStorage;

    function readApiKeyFromLocalStorage(): string | null {
        const primary = readStringValue(ls, API_KEY_PRIMARY_LS_KEY);
        if (primary !== null) {
            return primary;
        }

        return readStringValue(ls, API_KEY_LEGACY_LS_KEY);
    }

    function detect(): MigrationSnapshot {
        return {
            apiKey: { present: readApiKeyFromLocalStorage() !== null },
        };
    }

    return {
        detect,
        hasMigratableData(): boolean {
            const snapshot = detect();
            return snapshot.apiKey.present;
        },
        async migrate(): Promise<MigrationOutcome> {
            const apiKey = readApiKeyFromLocalStorage();
            const outcome: MigrationOutcome = {
                apiKey: { detected: apiKey !== null, migrated: false },
            };

            if (apiKey !== null) {
                try {
                    await deps.credentialsPort.save(apiKey);
                    ls.removeItem(API_KEY_PRIMARY_LS_KEY);
                    ls.removeItem(API_KEY_LEGACY_LS_KEY);
                    outcome.apiKey.migrated = true;
                } catch (error) {
                    outcome.apiKey.error = error instanceof Error ? error : new Error(String(error));
                }
            }

            ls.setItem(MIGRATION_DECISION_KEY, JSON.stringify('migrated'));
            return outcome;
        },
        decline(): void {
            ls.setItem(MIGRATION_DECISION_KEY, JSON.stringify('declined'));
        },
        getDecision(): MigrationDecision | null {
            const raw = ls.getItem(MIGRATION_DECISION_KEY);
            if (!raw) {
                return null;
            }

            const parsed = tryParseJson(raw) ?? raw;
            return parsed === 'migrated' || parsed === 'declined' ? parsed : null;
        },
        resetDecision(): void {
            ls.removeItem(MIGRATION_DECISION_KEY);
        },
    };
}

function readStringValue(ls: Storage, key: string): string | null {
    const raw = ls.getItem(key);
    if (raw === null) {
        return null;
    }

    const parsed = tryParseJson(raw);
    const candidate = typeof parsed === 'string' ? parsed : raw;
    return candidate.length > 0 ? candidate : null;
}

function tryParseJson(raw: string): unknown {
    try {
        return JSON.parse(raw);
    } catch {
        return undefined;
    }
}
