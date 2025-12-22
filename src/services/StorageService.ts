import { get, set, del, clear } from 'idb-keyval';

export interface StorageProvider {
    save(key: string, data: string): Promise<void>;
    load(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
    async save(key: string, data: string): Promise<void> {
        await set(key, data);
    }

    async load(key: string): Promise<string | null> {
        const val = await get(key);
        return val || null;
    }

    async remove(key: string): Promise<void> {
        await del(key);
    }

    async clearAll(): Promise<void> {
        await clear();
    }
}

export const storage = new LocalStorageProvider();
