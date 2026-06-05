import { useEffect, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import { storage, type StorageProvider } from '../services/StorageService';
import type { ImageBackground, ImageQuality } from '../utils/openai';
import {
    DEFAULT_IMAGE_MODEL,
    NANO_BANANA_PRO_IMAGE_MODEL,
    isImageModelSlug,
    type ImageModelSlug,
    type NanoBananaAspectRatio,
    type NanoBananaImageSize,
} from '../utils/openaiModels';

const GENERATE_DRAFT_KEY = 'aura_generate_draft';
const GENERATE_CURRENT_RESULT_KEY = 'generate_current_result';
const GENERATE_TRANSFERRED_REFERENCES_KEY = 'generate_transferred_references';
const GENERATE_LINEAGE_SOURCE_KEY = 'generate_lineage_source';
const VALID_OPENAI_SIZES = new Set(['1024x1024', '1536x1024', '1024x1536', 'auto']);
const VALID_NANO_ASPECT_RATIOS = new Set(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9']);
const VALID_NANO_IMAGE_SIZES = new Set(['1K', '2K', '4K']);

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
    model: ImageModelSlug;
    prompt: string;
    style: string;
    lighting: string;
    palette: string;
    gptImage2: GptImage2DraftControls;
    nanoBananaPro: NanoBananaProDraftControls;
    isSaved: boolean;
}

export interface GptImage2DraftControls {
    quality: ImageQuality;
    size: string;
    background: ImageBackground;
}

export interface NanoBananaProDraftControls {
    aspectRatio: NanoBananaAspectRatio;
    imageSize: NanoBananaImageSize;
}

export interface GenerateLineageSource {
    archiveImageId: string;
    stepId?: string | null;
}

export interface GenerateSessionStore {
    readDraft(): GenerateDraft;
    writeDraft(draft: GenerateDraft): void;
    transferFromArchive(image: ArchiveImage, lineageSource?: GenerateLineageSource | null, draftOverrides?: Partial<GenerateDraft>): Promise<void>;
    loadLineageSource(): GenerateLineageSource | null;
    saveLineageSource(source: GenerateLineageSource): void;
    clearLineageSource(): void;
    loadCurrentResult(): Promise<string | null>;
    saveCurrentResult(result: string): Promise<void>;
    clearCurrentResult(): Promise<void>;
    consumeTransferredReferences(): Promise<string[]>;
}

interface CreateGenerateSessionStoreDeps {
    blobStorage?: StorageProvider;
    localStorage?: Storage;
}

export const DEFAULT_GENERATE_DRAFT: GenerateDraft = {
    model: DEFAULT_IMAGE_MODEL,
    prompt: '',
    style: 'none',
    lighting: 'none',
    palette: 'none',
    gptImage2: {
        quality: 'medium',
        size: '1024x1024',
        background: 'auto',
    },
    nanoBananaPro: {
        aspectRatio: '1:1',
        imageSize: '1K',
    },
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
            quality: this.readLegacyValue(LEGACY_KEYS.quality, DEFAULT_GENERATE_DRAFT.gptImage2.quality),
            aspectRatio: this.readLegacyValue(LEGACY_KEYS.aspectRatio, DEFAULT_GENERATE_DRAFT.gptImage2.size),
            background: this.readLegacyValue(LEGACY_KEYS.background, DEFAULT_GENERATE_DRAFT.gptImage2.background),
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

    async transferFromArchive(image: ArchiveImage, lineageSource: GenerateLineageSource | null = { archiveImageId: image.id }, draftOverrides: Partial<GenerateDraft> = {}): Promise<void> {
        this.writeDraft(sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            prompt: image.prompt,
            model: isImageModelSlug(image.model) ? image.model : DEFAULT_IMAGE_MODEL,
            style: image.style || 'none',
            lighting: image.lighting || 'none',
            palette: image.palette || 'none',
            gptImage2: {
                ...DEFAULT_GENERATE_DRAFT.gptImage2,
                quality: coerceQuality(image.quality),
                size: coerceOpenAiSize(image.aspectRatio),
                background: coerceBackground(image.background),
            },
            nanoBananaPro: {
                ...DEFAULT_GENERATE_DRAFT.nanoBananaPro,
                aspectRatio: coerceNanoAspectRatio(image.aspectRatio),
                imageSize: coerceNanoImageSize(image.quality),
            },
            isSaved: false,
            ...draftOverrides,
        }));
        if (lineageSource) {
            this.saveLineageSource(lineageSource);
        } else {
            this.clearLineageSource();
        }

        if (image.references && image.references.length > 0) {
            await this.blobStorage.save(GENERATE_TRANSFERRED_REFERENCES_KEY, JSON.stringify(image.references));
            return;
        }

        await this.blobStorage.remove(GENERATE_TRANSFERRED_REFERENCES_KEY);
    }

    loadLineageSource(): GenerateLineageSource | null {
        return this.readJson<GenerateLineageSource>(GENERATE_LINEAGE_SOURCE_KEY);
    }

    saveLineageSource(source: GenerateLineageSource): void {
        this.localStorage.setItem(GENERATE_LINEAGE_SOURCE_KEY, JSON.stringify(source));
    }

    clearLineageSource(): void {
        this.localStorage.removeItem(GENERATE_LINEAGE_SOURCE_KEY);
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
        deps.localStorage ?? getDefaultLocalStorage(),
    );
}

export const generateSessionStore = createGenerateSessionStore();

function getDefaultLocalStorage(): Storage {
    if (typeof window !== 'undefined') {
        return window.localStorage;
    }

    const values = new Map<string, string>();
    return {
        get length() {
            return values.size;
        },
        clear() {
            values.clear();
        },
        getItem(key: string) {
            return values.get(key) ?? null;
        },
        key(index: number) {
            return Array.from(values.keys())[index] ?? null;
        },
        removeItem(key: string) {
            values.delete(key);
        },
        setItem(key: string, value: string) {
            values.set(key, value);
        },
    };
}

export function useGenerateDraft(store: GenerateSessionStore = generateSessionStore) {
    const [draft, setDraft] = useState<GenerateDraft>(() => store.readDraft());

    useEffect(() => {
        store.writeDraft(draft);
    }, [draft, store]);

    return [draft, setDraft] as const;
}

type DraftLike = Partial<GenerateDraft> & {
    quality?: unknown;
    aspectRatio?: unknown;
    background?: unknown;
};

export const sanitizeGenerateDraft = (draft: DraftLike): GenerateDraft => {
    const legacyQuality = coerceQuality(draft.quality);
    const legacySize = coerceOpenAiSize(draft.aspectRatio);
    const legacyBackground = coerceBackground(draft.background);

    return {
        model: isImageModelSlug(draft.model) ? draft.model : DEFAULT_GENERATE_DRAFT.model,
        prompt: typeof draft.prompt === 'string' ? draft.prompt : DEFAULT_GENERATE_DRAFT.prompt,
        style: typeof draft.style === 'string' ? draft.style : DEFAULT_GENERATE_DRAFT.style,
        lighting: typeof draft.lighting === 'string' ? draft.lighting : DEFAULT_GENERATE_DRAFT.lighting,
        palette: typeof draft.palette === 'string' ? draft.palette : DEFAULT_GENERATE_DRAFT.palette,
        gptImage2: sanitizeGptImage2Controls(draft.gptImage2, {
            quality: legacyQuality,
            size: legacySize,
            background: legacyBackground,
        }),
        nanoBananaPro: sanitizeNanoBananaProControls(draft.nanoBananaPro, {
            aspectRatio: coerceNanoAspectRatio(draft.aspectRatio),
            imageSize: DEFAULT_GENERATE_DRAFT.nanoBananaPro.imageSize,
        }),
        isSaved: typeof draft.isSaved === 'boolean' ? draft.isSaved : DEFAULT_GENERATE_DRAFT.isSaved,
    };
};

export function getActiveGenerateControls(draft: GenerateDraft) {
    if (draft.model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return {
            aspectRatio: draft.nanoBananaPro.aspectRatio,
            imageSize: draft.nanoBananaPro.imageSize,
            quality: DEFAULT_GENERATE_DRAFT.gptImage2.quality,
            background: DEFAULT_GENERATE_DRAFT.gptImage2.background,
        };
    }

    return {
        aspectRatio: draft.gptImage2.size,
        imageSize: undefined,
        quality: draft.gptImage2.quality,
        background: draft.gptImage2.background,
    };
}

export function getImageModelDraftKey(model: ImageModelSlug) {
    return model === NANO_BANANA_PRO_IMAGE_MODEL ? 'nanoBananaPro' : 'gptImage2';
}

function sanitizeGptImage2Controls(value: unknown, fallback: GptImage2DraftControls): GptImage2DraftControls {
    const record = value && typeof value === 'object' ? value as Partial<GptImage2DraftControls> : {};
    return {
        quality: isQuality(record.quality) ? record.quality : fallback.quality,
        size: isOpenAiSize(record.size) ? record.size : fallback.size,
        background: isBackground(record.background) ? record.background : fallback.background,
    };
}

function sanitizeNanoBananaProControls(value: unknown, fallback: NanoBananaProDraftControls): NanoBananaProDraftControls {
    const record = value && typeof value === 'object' ? value as Partial<NanoBananaProDraftControls> : {};
    return {
        aspectRatio: isNanoAspectRatio(record.aspectRatio) ? record.aspectRatio : fallback.aspectRatio,
        imageSize: isNanoImageSize(record.imageSize) ? record.imageSize : fallback.imageSize,
    };
}

const coerceQuality = (quality: unknown): ImageQuality => {
    return isQuality(quality)
        ? quality
        : DEFAULT_GENERATE_DRAFT.gptImage2.quality;
};

const coerceBackground = (background: unknown): ImageBackground => {
    return isBackground(background)
        ? background
        : DEFAULT_GENERATE_DRAFT.gptImage2.background;
};

const coerceOpenAiSize = (size: unknown): string => {
    return isOpenAiSize(size)
        ? size
        : DEFAULT_GENERATE_DRAFT.gptImage2.size;
};

const coerceNanoAspectRatio = (aspectRatio: unknown): NanoBananaAspectRatio => {
    if (aspectRatio === '1024x1024' || aspectRatio === 'auto') return '1:1';
    if (aspectRatio === '1536x1024') return '3:2';
    if (aspectRatio === '1024x1536') return '2:3';

    return isNanoAspectRatio(aspectRatio)
        ? aspectRatio
        : DEFAULT_GENERATE_DRAFT.nanoBananaPro.aspectRatio;
};

const coerceNanoImageSize = (imageSize: unknown): NanoBananaImageSize => {
    return isNanoImageSize(imageSize)
        ? imageSize
        : DEFAULT_GENERATE_DRAFT.nanoBananaPro.imageSize;
};

function isQuality(value: unknown): value is ImageQuality {
    return value === 'low' || value === 'medium' || value === 'high';
}

function isBackground(value: unknown): value is ImageBackground {
    return value === 'auto' || value === 'opaque' || value === 'transparent';
}

function isOpenAiSize(value: unknown): value is string {
    return typeof value === 'string' && VALID_OPENAI_SIZES.has(value);
}

function isNanoAspectRatio(value: unknown): value is NanoBananaAspectRatio {
    return typeof value === 'string' && VALID_NANO_ASPECT_RATIOS.has(value);
}

function isNanoImageSize(value: unknown): value is NanoBananaImageSize {
    return typeof value === 'string' && VALID_NANO_IMAGE_SIZES.has(value);
}
