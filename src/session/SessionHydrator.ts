import type { CredentialsPort } from '../credentials/SQLiteCredentialsPort';
import {
    EMPTY_SESSION_SNAPSHOT,
    INITIAL_SESSION_STATE,
    type SessionError,
    type SessionState,
} from './types';

export interface SessionHydratorDeps {
    credentialsPort: CredentialsPort;
    bootstrap?: () => Promise<void>;
}

export interface SessionHydrator {
    hydrate(): Promise<void>;
    refresh(): Promise<void>;
    getState(): SessionState;
    subscribe(listener: () => void): () => void;
    setApiKey(value: string): Promise<void>;
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

    async function loadFromPort(markHydrated: boolean): Promise<void> {
        try {
            const apiKey = await deps.credentialsPort.load();
            setState({
                snapshot: { ...EMPTY_SESSION_SNAPSHOT, apiKey: apiKey ?? '' },
                isHydrated: markHydrated || state.isHydrated,
                lastError: null,
            });
        } catch (error) {
            setState({
                snapshot: state.snapshot,
                isHydrated: markHydrated || state.isHydrated,
                lastError: {
                    domain: 'apiKey',
                    operation: 'load',
                    cause: toError(error),
                },
            });
        }
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
                            lastError: {
                                domain: 'apiKey',
                                operation: 'load',
                                cause: toError(error),
                            },
                        });
                        return;
                    }
                }
                await loadFromPort(true);
            })();

            return hydrationPromise;
        },
        refresh(): Promise<void> {
            return loadFromPort(false);
        },
        getState(): SessionState {
            return state;
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

            const operation = value === '' ? 'clear' : 'save';

            try {
                if (operation === 'clear') {
                    await deps.credentialsPort.clear();
                } else {
                    await deps.credentialsPort.save(value);
                }
            } catch (error) {
                recordError({
                    domain: 'apiKey',
                    operation,
                    cause: toError(error),
                });
            }
        },
    };
}
