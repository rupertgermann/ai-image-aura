import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import type { GenerateDraftPort } from '../generate-session/SQLiteGenerateDraftPort';
import {
    DEFAULT_GENERATE_DRAFT,
    sanitizeGenerateDraft,
    type GenerateDraft,
} from '../generate-session/GenerateSession';
import {
    EMPTY_SESSION_SNAPSHOT,
    INITIAL_SESSION_STATE,
    type SessionDomain,
    type SessionError,
    type SessionOperation,
    type SessionState,
} from './types';

export interface SessionHydratorDeps {
    credentialsPort: CredentialsPort;
    generateDraftPort: GenerateDraftPort;
    bootstrap?: () => Promise<void>;
}

export interface SessionHydrator {
    hydrate(): Promise<void>;
    refresh(): Promise<void>;
    getState(): SessionState;
    getDraft(): GenerateDraft;
    subscribe(listener: () => void): () => void;
    setApiKey(value: string): Promise<void>;
    setGenerateDraft(value: GenerateDraft): Promise<void>;
}

export function createSessionHydrator(deps: SessionHydratorDeps): SessionHydrator {
    let state: SessionState = INITIAL_SESSION_STATE;
    const listeners = new Set<() => void>();
    let hydrationPromise: Promise<void> | null = null;

    function notify() {
        for (const listener of listeners) {
            listener();
        }
    }

    function setState(next: SessionState) {
        state = next;
        notify();
    }

    function recordError(error: SessionError) {
        setState({
            ...state,
            lastError: error,
        });
    }

    function toError(value: unknown): Error {
        return value instanceof Error ? value : new Error(String(value));
    }

    function makeError(domain: SessionDomain, operation: SessionOperation, cause: unknown): SessionError {
        return { domain, operation, cause: toError(cause) };
    }

    async function loadFromPorts(markHydrated: boolean): Promise<void> {
        const [apiKeyResult, draftResult] = await Promise.all([
            deps.credentialsPort.load().then(
                (value) => ({ ok: true as const, value }),
                (error) => ({ ok: false as const, error }),
            ),
            deps.generateDraftPort.load().then(
                (value) => ({ ok: true as const, value }),
                (error) => ({ ok: false as const, error }),
            ),
        ]);

        const nextApiKey = apiKeyResult.ok ? (apiKeyResult.value ?? '') : state.snapshot.apiKey;
        const nextDraft = draftResult.ok
            ? (draftResult.value ? sanitizeGenerateDraft(draftResult.value) : DEFAULT_GENERATE_DRAFT)
            : state.snapshot.generateDraft;

        const loadError = !apiKeyResult.ok
            ? makeError('apiKey', 'load', apiKeyResult.error)
            : !draftResult.ok
                ? makeError('generateDraft', 'load', draftResult.error)
                : null;

        setState({
            snapshot: {
                ...EMPTY_SESSION_SNAPSHOT,
                apiKey: nextApiKey,
                generateDraft: nextDraft,
            },
            isHydrated: markHydrated || state.isHydrated,
            lastError: loadError,
        });
    }

    return {
        hydrate(): Promise<void> {
            if (hydrationPromise) {
                return hydrationPromise;
            }

            hydrationPromise = (async () => {
                if (deps.bootstrap) {
                    try {
                        await deps.bootstrap();
                    } catch (error) {
                        setState({
                            snapshot: EMPTY_SESSION_SNAPSHOT,
                            isHydrated: true,
                            lastError: makeError('apiKey', 'load', error),
                        });
                        return;
                    }
                }
                await loadFromPorts(true);
            })();

            return hydrationPromise;
        },
        refresh(): Promise<void> {
            return loadFromPorts(false);
        },
        getState(): SessionState {
            return state;
        },
        getDraft(): GenerateDraft {
            return state.snapshot.generateDraft;
        },
        subscribe(listener: () => void): () => void {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        async setApiKey(value: string): Promise<void> {
            const previousState = state;
            setState({
                ...previousState,
                snapshot: { ...previousState.snapshot, apiKey: value },
                lastError: null,
            });

            const operation: SessionOperation = value === '' ? 'clear' : 'save';

            try {
                if (operation === 'clear') {
                    await deps.credentialsPort.clear();
                } else {
                    await deps.credentialsPort.save(value);
                }
            } catch (error) {
                recordError(makeError('apiKey', operation, error));
            }
        },
        async setGenerateDraft(value: GenerateDraft): Promise<void> {
            const sanitized = sanitizeGenerateDraft(value);
            const previousState = state;
            setState({
                ...previousState,
                snapshot: { ...previousState.snapshot, generateDraft: sanitized },
                lastError: null,
            });

            try {
                await deps.generateDraftPort.save(sanitized);
            } catch (error) {
                recordError(makeError('generateDraft', 'save', error));
            }
        },
    };
}
