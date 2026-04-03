import { useEffect, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import type { ImageBackground, ImageQuality } from '../utils/openai';

const GENERATE_DRAFT_KEY = 'aura_generate_draft';
const GENERATE_CURRENT_RESULT_KEY = 'generate_current_result';
const GENERATE_TRANSFERRED_REFERENCES_KEY = 'generate_transferred_references';
const VALID_ASPECT_RATIOS = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);

const LEGACY_KEYS = {
    prompt: 'aura_generate_prompt',
    quality: 'aura_generate_quality',
    aspectRatio: 'aura_generate_aspect_ratio',
    background: 'aura_generate_background',
    style: 'aura_generate_style',
    lighting: 'aura_generate_lighting',
    palette: 'aura_generate_palette',
    isSaved: 'aura_generate_is_saved',
} as const;

export interface GenerateDraft {
    prompt: string;
    quality: ImageQuality;
    aspectRatio: string;
    background: ImageBackground;
    style: string;
    lighting: string;
    palette: string;
    isSaved: boolean;
}

export interface GenerateSessionStore {
    readDraft(): GenerateDraft;
    writeDraft(draft: GenerateDraft): void;
    transferFromArchive(image: ArchiveImage): Promise<void>;
    loadCurrentResult(): Promise<string | null>;
    saveCurrentResult(result: string): Promise<void>;
    clearCurrentResult(): Promise<void>;
    consumeTransferredReferences(): Promise<string[]>;
}

interface CreateGenerateSessionStoreDeps {
    blobStorage?: StorageProvider;
    localStorage?: Storage;
}

const DEFAULT_GENERATE_DRAFT: GenerateDraft = {
    prompt: '',
    quality: 'medium',
    aspectRatio: '1024x1024',
    background: 'auto',
    style: 'none',
    lighting: 'none',
    palette: 'none',
    isSaved: false,
};

class LocalGenerateSessionStore implements GenerateSessionStore {
    private readonly blobStorage: StorageProvider;
    private readonly localStorage: Storage;

    constructor(blobStorage: StorageProvider, localStorage: Storage) {
        this.blobStorage = blobStorage;
        this.localStorage = localStorage;
    }

    readDraft(): GenerateDraft {
        const storedDraft = this.readJson<GenerateDraft>(GENERATE_DRAFT_KEY);
        if (storedDraft) {
            return sanitizeGenerateDraft(storedDraft);
        }

        return sanitizeGenerateDraft({
            prompt: this.readLegacyValue(LEGACY_KEYS.prompt, DEFAULT_GENERATE_DRAFT.prompt),
            quality: this.readLegacyValue(LEGACY_KEYS.quality, DEFAULT_GENERATE_DRAFT.quality),
            aspectRatio: this.readLegacyValue(LEGACY_KEYS.aspectRatio, DEFAULT_GENERATE_DRAFT.aspectRatio),
            background: this.readLegacyValue(LEGACY_KEYS.background, DEFAULT_GENERATE_DRAFT.background),
            style: this.readLegacyValue(LEGACY_KEYS.style, DEFAULT_GENERATE_DRAFT.style),
            lighting: this.readLegacyValue(LEGACY_KEYS.lighting, DEFAULT_GENERATE_DRAFT.lighting),
            palette: this.readLegacyValue(LEGACY_KEYS.palette, DEFAULT_GENERATE_DRAFT.palette),
            isSaved: this.readLegacyValue(LEGACY_KEYS.isSaved, DEFAULT_GENERATE_DRAFT.isSaved),
        });
    }

    writeDraft(draft: GenerateDraft): void {
        const nextDraft = sanitizeGenerateDraft(draft);
        this.localStorage.setItem(GENERATE_DRAFT_KEY, JSON.stringify(nextDraft));
        this.clearLegacyDraftKeys();
    }

    async transferFromArchive(image: ArchiveImage): Promise<void> {
        this.writeDraft({
            prompt: image.prompt,
            quality: coerceQuality(image.quality),
            aspectRatio: image.aspectRatio,
            background: coerceBackground(image.background),
            style: image.style || 'none',
            lighting: image.lighting || 'none',
            palette: image.palette || 'none',
            isSaved: false,
        });

        if (image.references && image.references.length > 0) {
            await this.blobStorage.save(GENERATE_TRANSFERRED_REFERENCES_KEY, JSON.stringify(image.references));
            return;
        }

        await this.blobStorage.remove(GENERATE_TRANSFERRED_REFERENCES_KEY);
    }

    loadCurrentResult(): Promise<string | null> {
        return this.blobStorage.load(GENERATE_CURRENT_RESULT_KEY);
    }

    saveCurrentResult(result: string): Promise<void> {
        return this.blobStorage.save(GENERATE_CURRENT_RESULT_KEY, result);
    }

    clearCurrentResult(): Promise<void> {
        return this.blobStorage.remove(GENERATE_CURRENT_RESULT_KEY);
    }

    async consumeTransferredReferences(): Promise<string[]> {
        const value = await this.blobStorage.load(GENERATE_TRANSFERRED_REFERENCES_KEY);
        await this.blobStorage.remove(GENERATE_TRANSFERRED_REFERENCES_KEY);

        if (!value) {
            return [];
        }

        try {
            const references = JSON.parse(value) as string[];
            return Array.isArray(references) ? references : [];
        } catch {
            return [];
        }
    }

    private readLegacyValue<T>(key: string, fallback: T): T {
        const rawValue = this.localStorage.getItem(key);
        if (!rawValue) {
            return fallback;
        }

        try {
            return JSON.parse(rawValue) as T;
        } catch {
            return rawValue as T;
        }
    }

    private readJson<T>(key: string): T | null {
        const rawValue = this.localStorage.getItem(key);
        if (!rawValue) {
            return null;
        }

        try {
            return JSON.parse(rawValue) as T;
        } catch {
            return null;
        }
    }

    private clearLegacyDraftKeys() {
        Object.values(LEGACY_KEYS).forEach((key) => this.localStorage.removeItem(key));
    }
}

export function createGenerateSessionStore(deps: CreateGenerateSessionStoreDeps = {}): GenerateSessionStore {
    return new LocalGenerateSessionStore(
        deps.blobStorage ?? storage,
        deps.localStorage ?? window.localStorage,
    );
}

export const generateSessionStore = createGenerateSessionStore();

export function useGenerateDraft(store: GenerateSessionStore = generateSessionStore) {
    const [draft, setDraft] = useState<GenerateDraft>(() => store.readDraft());

    useEffect(() => {
        store.writeDraft(draft);
    }, [draft, store]);

    return [draft, setDraft] as const;
}

const sanitizeGenerateDraft = (draft: Partial<GenerateDraft>): GenerateDraft => ({
    prompt: typeof draft.prompt === 'string' ? draft.prompt : DEFAULT_GENERATE_DRAFT.prompt,
    quality: coerceQuality(draft.quality),
    aspectRatio: typeof draft.aspectRatio === 'string' && VALID_ASPECT_RATIOS.has(draft.aspectRatio)
        ? draft.aspectRatio
        : DEFAULT_GENERATE_DRAFT.aspectRatio,
    background: coerceBackground(draft.background),
    style: typeof draft.style === 'string' ? draft.style : DEFAULT_GENERATE_DRAFT.style,
    lighting: typeof draft.lighting === 'string' ? draft.lighting : DEFAULT_GENERATE_DRAFT.lighting,
    palette: typeof draft.palette === 'string' ? draft.palette : DEFAULT_GENERATE_DRAFT.palette,
    isSaved: typeof draft.isSaved === 'boolean' ? draft.isSaved : DEFAULT_GENERATE_DRAFT.isSaved,
});

const coerceQuality = (quality: unknown): ImageQuality => {
    return quality === 'low' || quality === 'medium' || quality === 'high'
        ? quality
        : DEFAULT_GENERATE_DRAFT.quality;
};

const coerceBackground = (background: unknown): ImageBackground => {
    return background === 'auto' || background === 'opaque' || background === 'transparent'
        ? background
        : DEFAULT_GENERATE_DRAFT.background;
};
