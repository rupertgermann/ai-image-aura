export type CompletionNotificationReadiness =
    | 'unsupported'
    | 'insecure-context'
    | 'denied'
    | 'default'
    | 'granted';

export interface CompletionNotificationPayload {
    title: string;
    body: string;
}

export interface CompletionNotificationInstance {
    onclick: ((event: Event) => unknown) | null;
}

interface NotificationConstructorLike {
    permission: NotificationPermission;
    requestPermission?: () => Promise<NotificationPermission>;
    new(title: string, options?: NotificationOptions): CompletionNotificationInstance;
}

interface BrowserCompletionNotificationEnvironment {
    isSecureContext: boolean;
    Notification?: NotificationConstructorLike;
    focusWindow: () => void;
}

export interface CompletionNotificationPort {
    getReadiness(): CompletionNotificationReadiness;
    requestPermission(): Promise<CompletionNotificationReadiness>;
    showCompletion(payload: CompletionNotificationPayload): CompletionNotificationInstance | null;
}

export function createBrowserCompletionNotificationPort(
    environment: BrowserCompletionNotificationEnvironment = getDefaultEnvironment(),
): CompletionNotificationPort {
    const getReadiness = (): CompletionNotificationReadiness => {
        if (!environment.Notification) {
            return 'unsupported';
        }

        if (!environment.isSecureContext) {
            return 'insecure-context';
        }

        return normalizePermission(environment.Notification.permission);
    };

    return {
        getReadiness,
        async requestPermission() {
            if (getReadiness() !== 'default') {
                return getReadiness();
            }

            const permission = await environment.Notification!.requestPermission?.();
            return normalizePermission(permission ?? environment.Notification!.permission);
        },
        showCompletion(payload) {
            if (getReadiness() !== 'granted') {
                return null;
            }

            const notification = new environment.Notification!(payload.title, { body: payload.body });
            notification.onclick = () => {
                environment.focusWindow();
            };
            return notification;
        },
    };
}

export const browserCompletionNotificationPort = createBrowserCompletionNotificationPort();

function getDefaultEnvironment(): BrowserCompletionNotificationEnvironment {
    return {
        isSecureContext: typeof window !== 'undefined' ? window.isSecureContext : false,
        Notification: typeof Notification !== 'undefined' ? Notification : undefined,
        focusWindow: () => {
            if (typeof window !== 'undefined') {
                window.focus();
            }
        },
    };
}

function normalizePermission(permission: NotificationPermission): CompletionNotificationReadiness {
    if (permission === 'granted' || permission === 'denied' || permission === 'default') {
        return permission;
    }

    return 'default';
}
