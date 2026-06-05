import { get, set, del, clear, keys } from 'idb-keyval';

export interface StorageProvider {
    save(key: string, data: string): Promise<void>;
    load(key: string): Promise<string | null>;
    remove(key: string): Promise<void>;
    clearAll(): Promise<void>;
    listKeys(): Promise<string[]>;
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

    async listKeys(): Promise<string[]> {
        const storedKeys = await keys();
        return storedKeys.filter((key): key is string => typeof key === 'string');
    }
}

export const storage = new LocalStorageProvider();
