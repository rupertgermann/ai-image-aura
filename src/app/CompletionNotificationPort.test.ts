import { describe, expect, it, vi } from 'vitest';
import { createBrowserCompletionNotificationPort } from './CompletionNotificationPort';

describe('createBrowserCompletionNotificationPort', () => {
    it('reports unsupported, insecure, denied, default, and granted readiness states', () => {
        expect(createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification: undefined,
            focusWindow: vi.fn(),
        }).getReadiness()).toBe('unsupported');

        expect(createBrowserCompletionNotificationPort({
            isSecureContext: false,
            Notification: createNotificationConstructor('granted'),
            focusWindow: vi.fn(),
        }).getReadiness()).toBe('insecure-context');

        expect(createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification: createNotificationConstructor('denied'),
            focusWindow: vi.fn(),
        }).getReadiness()).toBe('denied');

        expect(createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification: createNotificationConstructor('default'),
            focusWindow: vi.fn(),
        }).getReadiness()).toBe('default');

        expect(createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification: createNotificationConstructor('granted'),
            focusWindow: vi.fn(),
        }).getReadiness()).toBe('granted');
    });

    it('requests permission only from the default readiness state', async () => {
        const requestPermission = vi.fn(async () => 'granted' as NotificationPermission);
        const Notification = createNotificationConstructor('default', requestPermission);
        const port = createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification,
            focusWindow: vi.fn(),
        });

        await expect(port.requestPermission()).resolves.toBe('granted');
        expect(requestPermission).toHaveBeenCalledOnce();

        await expect(createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification: createNotificationConstructor('denied'),
            focusWindow: vi.fn(),
        }).requestPermission()).resolves.toBe('denied');
    });

    it('shows a granted notification and focuses the window when clicked', () => {
        const focusWindow = vi.fn();
        const Notification = createNotificationConstructor('granted');
        const port = createBrowserCompletionNotificationPort({
            isSecureContext: true,
            Notification,
            focusWindow,
        });

        const notification = port.showCompletion({
            title: 'Generation complete',
            body: 'Your image is ready.',
        });

        expect(Notification.instances).toEqual([
            expect.objectContaining({
                title: 'Generation complete',
                options: { body: 'Your image is ready.' },
            }),
        ]);

        notification?.onclick?.(new Event('click'));
        expect(focusWindow).toHaveBeenCalledOnce();
    });
});

function createNotificationConstructor(
    permission: NotificationPermission,
    requestPermission = vi.fn(async () => permission),
) {
    class TestNotification {
        static permission = permission;
        static requestPermission = requestPermission;
        static instances: TestNotification[] = [];
        onclick: ((event: Event) => unknown) | null = null;
        readonly title: string;
        readonly options?: NotificationOptions;

        constructor(
            title: string,
            options?: NotificationOptions,
        ) {
            this.title = title;
            this.options = options;
            TestNotification.instances.push(this);
        }
    }

    return TestNotification;
}
