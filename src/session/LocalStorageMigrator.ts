import {
    LEGACY_AUTOPILOT_KEYS,
    sanitizeAutopilotSettings,
    type AutopilotSettings,
    type LegacyAutopilotField,
} from '../autopilot/AutopilotSettings';
import type { AutopilotSettingsPort } from '../autopilot/SQLiteAutopilotSettingsPort';
import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import type { GenerateLineageSourcePort } from '../generate-session/SQLiteGenerateLineageSourcePort';
import {
    DEFAULT_GENERATE_DRAFT,
    GENERATE_DRAFT_KEY,
    GENERATE_LINEAGE_SOURCE_KEY,
    LEGACY_DRAFT_KEYS,
    sanitizeGenerateDraft,
    sanitizeGenerateLineageSource,
    type GenerateDraft,
    type GenerateLineageSource,
    type LegacyDraftField,
} from '../generate-session/GenerateSession';

export const MIGRATION_DECISION_KEY = 'aura_storage_migration_decision';
export const API_KEY_PRIMARY_LS_KEY = 'aura_openapi_key';
export const API_KEY_LEGACY_LS_KEY = 'openai_api_key';

export type MigrationDecision = 'migrated' | 'declined';

export interface MigrationFieldSnapshot {
    present: boolean;
}

export interface MigrationSnapshot {
    apiKey: MigrationFieldSnapshot;
    generateDraft: MigrationFieldSnapshot;
    autopilotSettings: MigrationFieldSnapshot;
    generateLineageSource: MigrationFieldSnapshot;
}

export interface MigrationFieldOutcome {
    detected: boolean;
    migrated: boolean;
    error?: Error;
}

export interface MigrationOutcome {
    apiKey: MigrationFieldOutcome;
    generateDraft: MigrationFieldOutcome;
    autopilotSettings: MigrationFieldOutcome;
    generateLineageSource: MigrationFieldOutcome;
}

export interface CreateLocalStorageMigratorDeps {
    credentialsPort: Pick<CredentialsPort, 'save'>;
    generateDraftPort: Pick<GenerateDraftPort, 'save'>;
    autopilotSettingsPort: Pick<AutopilotSettingsPort, 'save'>;
    generateLineageSourcePort: Pick<GenerateLineageSourcePort, 'save'>;
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

const LEGACY_DRAFT_KEY_LIST: Array<[LegacyDraftField, string]> = Object.entries(LEGACY_DRAFT_KEYS) as Array<
    [LegacyDraftField, string]
>;

const LEGACY_AUTOPILOT_KEY_LIST: Array<[LegacyAutopilotField, string]> = Object.entries(LEGACY_AUTOPILOT_KEYS) as Array<
    [LegacyAutopilotField, string]
>;

export function createLocalStorageMigrator(deps: CreateLocalStorageMigratorDeps): LocalStorageMigrator {
    const ls = deps.localStorage ?? window.localStorage;

    function readApiKeyFromLocalStorage(): string | null {
        const primary = readStringValue(ls, API_KEY_PRIMARY_LS_KEY);
        if (primary !== null) {
            return primary;
        }

        return readStringValue(ls, API_KEY_LEGACY_LS_KEY);
    }

    function readAutopilotFromLocalStorage(): { settings: AutopilotSettings; sourceKeys: string[] } | null {
        const raw: Partial<Record<LegacyAutopilotField, unknown>> = {};
        const touchedKeys: string[] = [];
        for (const [field, key] of LEGACY_AUTOPILOT_KEY_LIST) {
            const rawValue = ls.getItem(key);
            if (rawValue === null) {
                continue;
            }
            touchedKeys.push(key);
            const parsed = tryParseJson(rawValue);
            raw[field] = parsed === undefined ? rawValue : parsed;
        }

        if (touchedKeys.length === 0) {
            return null;
        }

        return {
            settings: sanitizeAutopilotSettings(raw),
            sourceKeys: touchedKeys,
        };
    }

    function readLineageSourceFromLocalStorage(): { source: GenerateLineageSource; sourceKey: string } | null {
        const raw = ls.getItem(GENERATE_LINEAGE_SOURCE_KEY);
        if (raw === null) {
            return null;
        }

        const parsed = tryParseJson(raw);
        if (!parsed || typeof parsed !== 'object') {
            return null;
        }

        const sanitized = sanitizeGenerateLineageSource(parsed as Partial<GenerateLineageSource>);
        if (!sanitized) {
            return null;
        }

        return { source: sanitized, sourceKey: GENERATE_LINEAGE_SOURCE_KEY };
    }

    function readDraftFromLocalStorage(): { draft: GenerateDraft; sourceKeys: string[] } | null {
        const currentRaw = ls.getItem(GENERATE_DRAFT_KEY);
        if (currentRaw !== null) {
            const parsed = tryParseJson(currentRaw);
            if (parsed && typeof parsed === 'object') {
                return {
                    draft: sanitizeGenerateDraft(parsed as Partial<GenerateDraft>),
                    sourceKeys: [GENERATE_DRAFT_KEY, ...LEGACY_DRAFT_KEY_LIST.map(([, key]) => key)],
                };
            }
        }

        const legacy: Partial<GenerateDraft> = {};
        const touchedKeys: string[] = [];
        for (const [field, key] of LEGACY_DRAFT_KEY_LIST) {
            const raw = ls.getItem(key);
            if (raw === null) {
                continue;
            }
            touchedKeys.push(key);
            const parsed = tryParseJson(raw);
            const value = parsed === undefined ? raw : parsed;
            (legacy as Record<string, unknown>)[field] = value;
        }

        if (touchedKeys.length === 0) {
            return null;
        }

        return {
            draft: sanitizeGenerateDraft(legacy),
            sourceKeys: touchedKeys,
        };
    }

    function detect(): MigrationSnapshot {
        return {
            apiKey: { present: readApiKeyFromLocalStorage() !== null },
            generateDraft: { present: readDraftFromLocalStorage() !== null },
            autopilotSettings: { present: readAutopilotFromLocalStorage() !== null },
            generateLineageSource: { present: readLineageSourceFromLocalStorage() !== null },
        };
    }

    return {
        detect,
        hasMigratableData(): boolean {
            const snapshot = detect();
            return (
                snapshot.apiKey.present
                || snapshot.generateDraft.present
                || snapshot.autopilotSettings.present
                || snapshot.generateLineageSource.present
            );
        },
        async migrate(): Promise<MigrationOutcome> {
            const apiKey = readApiKeyFromLocalStorage();
            const apiKeyOutcome: MigrationFieldOutcome = {
                detected: apiKey !== null,
                migrated: false,
            };

            if (apiKey !== null) {
                try {
                    await deps.credentialsPort.save(apiKey);
                    ls.removeItem(API_KEY_PRIMARY_LS_KEY);
                    ls.removeItem(API_KEY_LEGACY_LS_KEY);
                    apiKeyOutcome.migrated = true;
                } catch (error) {
                    apiKeyOutcome.error = error instanceof Error ? error : new Error(String(error));
                }
            }

            const draftRead = readDraftFromLocalStorage();
            const draftOutcome: MigrationFieldOutcome = {
                detected: draftRead !== null,
                migrated: false,
            };

            if (draftRead !== null) {
                try {
                    await deps.generateDraftPort.save(draftRead.draft);
                    for (const key of draftRead.sourceKeys) {
                        ls.removeItem(key);
                    }
                    draftOutcome.migrated = true;
                } catch (error) {
                    draftOutcome.error = error instanceof Error ? error : new Error(String(error));
                }
            }

            const autopilotRead = readAutopilotFromLocalStorage();
            const autopilotOutcome: MigrationFieldOutcome = {
                detected: autopilotRead !== null,
                migrated: false,
            };

            if (autopilotRead !== null) {
                try {
                    await deps.autopilotSettingsPort.save(autopilotRead.settings);
                    for (const key of autopilotRead.sourceKeys) {
                        ls.removeItem(key);
                    }
                    autopilotOutcome.migrated = true;
                } catch (error) {
                    autopilotOutcome.error = error instanceof Error ? error : new Error(String(error));
                }
            }

            const lineageSourceRead = readLineageSourceFromLocalStorage();
            const lineageSourceOutcome: MigrationFieldOutcome = {
                detected: lineageSourceRead !== null,
                migrated: false,
            };

            if (lineageSourceRead !== null) {
                try {
                    await deps.generateLineageSourcePort.save(lineageSourceRead.source);
                    ls.removeItem(lineageSourceRead.sourceKey);
                    lineageSourceOutcome.migrated = true;
                } catch (error) {
                    lineageSourceOutcome.error = error instanceof Error ? error : new Error(String(error));
                }
            }

            ls.setItem(MIGRATION_DECISION_KEY, JSON.stringify('migrated'));

            return {
                apiKey: apiKeyOutcome,
                generateDraft: draftOutcome,
                autopilotSettings: autopilotOutcome,
                generateLineageSource: lineageSourceOutcome,
            };
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

// re-export so tests and callers have a single source of truth
export { DEFAULT_GENERATE_DRAFT };
