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
});

function createNotificationConstructor(permission: NotificationPermission) {
    return class TestNotification {
        static permission = permission;
        onclick: ((event: Event) => unknown) | null = null;
    };
}
