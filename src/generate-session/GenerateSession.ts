import { useEffect, useState } from 'react';
import type { ArchiveImage } from '../db/types';
import {
    buildActiveImageModelControls,
    buildImageModelArchiveFields,
    getDefaultImageModelControls,
    getImageModelDraftKey as resolveImageModelDraftKey,
    sanitizeArchiveImageModelControls,
    sanitizeImageModelControls,
    type GptImage2Controls,
    type ImageModelArchiveFields,
    type NanoBananaProControls,
} from '../image-models/ImageModelControls';
import { storage, type StorageProvider } from '../services/StorageService';
import {
    DEFAULT_IMAGE_MODEL,
    NANO_BANANA_PRO_IMAGE_MODEL,
    OPENAI_IMAGE_MODEL,
    isImageModelSlug,
    type ImageModelSlug,
} from '../utils/openaiModels';

const GENERATE_DRAFT_KEY = 'aura_generate_draft';
const GENERATE_CURRENT_RESULT_KEY = 'generate_current_result';
const GENERATE_CURRENT_RESULT_REFERENCES_KEY = 'generate_current_result_references';
const GENERATE_CURRENT_BATCH_KEY = 'generate_current_batch';
const GENERATE_TRANSFERRED_REFERENCES_KEY = 'generate_transferred_references';
const GENERATE_LINEAGE_SOURCE_KEY = 'generate_lineage_source';

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

export type GptImage2DraftControls = GptImage2Controls;

export type NanoBananaProDraftControls = NanoBananaProControls;

export interface GenerateLineageSource {
    archiveImageId: string;
    stepId?: string | null;
}

export type GenerateResultSlot =
    | {
        slotIndex: number;
        status: 'success';
        imageUrl: string;
        isSaved: boolean;
        archiveImageId?: string;
    }
    | {
        slotIndex: number;
        status: 'failed';
        error: string;
    };

export interface GenerateBatchSnapshot {
    results: GenerateResultSlot[];
    references: string[] | null;
    draft: GenerateDraft | null;
    lineageSource: GenerateLineageSource | null;
}

export interface GenerateSessionStore {
    readDraft(): GenerateDraft;
    writeDraft(draft: GenerateDraft): void;
    transferFromArchive(image: ArchiveImage, lineageSource?: GenerateLineageSource | null, draftOverrides?: Partial<GenerateDraft>): Promise<void>;
    loadLineageSource(): GenerateLineageSource | null;
    saveLineageSource(source: GenerateLineageSource): void;
    clearLineageSource(): void;
    loadCurrentBatch(): Promise<GenerateBatchSnapshot | null>;
    saveCurrentBatch(batch: GenerateBatchSnapshot): Promise<void>;
    loadCurrentResult(): Promise<string | null>;
    loadCurrentResultReferences(): Promise<string[] | null>;
    saveCurrentResult(result: string, usedReferences?: string[] | null): Promise<void>;
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
    gptImage2: getDefaultImageModelControls(OPENAI_IMAGE_MODEL),
    nanoBananaPro: getDefaultImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL),
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
        const model = isImageModelSlug(image.model) ? image.model : DEFAULT_IMAGE_MODEL;

        this.writeDraft(sanitizeGenerateDraft({
            ...DEFAULT_GENERATE_DRAFT,
            prompt: image.prompt,
            model,
            style: image.style || 'none',
            lighting: image.lighting || 'none',
            palette: image.palette || 'none',
            gptImage2: sanitizeArchiveImageModelControls(OPENAI_IMAGE_MODEL, image),
            nanoBananaPro: sanitizeArchiveImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, image),
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

    async loadCurrentBatch(): Promise<GenerateBatchSnapshot | null> {
        const storedBatch = await this.blobStorage.load(GENERATE_CURRENT_BATCH_KEY);
        const batch = storedBatch ? parseGenerateBatchSnapshot(storedBatch) : null;

        if (batch) {
            return batch;
        }

        return this.loadLegacyCurrentBatch();
    }

    async saveCurrentBatch(batch: GenerateBatchSnapshot): Promise<void> {
        const snapshot = sanitizeGenerateBatchSnapshot(batch);

        if (!snapshot) {
            await this.clearCurrentResult();
            return;
        }

        await this.blobStorage.save(GENERATE_CURRENT_BATCH_KEY, JSON.stringify(snapshot));
        const firstSuccessfulResult = getFirstSuccessfulResultSlot(snapshot.results);

        if (firstSuccessfulResult) {
            await this.blobStorage.save(GENERATE_CURRENT_RESULT_KEY, firstSuccessfulResult.imageUrl);
            if (Array.isArray(snapshot.references)) {
                await this.blobStorage.save(GENERATE_CURRENT_RESULT_REFERENCES_KEY, JSON.stringify(snapshot.references));
                return;
            }

            await this.blobStorage.remove(GENERATE_CURRENT_RESULT_REFERENCES_KEY);
            return;
        }

        await Promise.all([
            this.blobStorage.remove(GENERATE_CURRENT_RESULT_KEY),
            this.blobStorage.remove(GENERATE_CURRENT_RESULT_REFERENCES_KEY),
        ]);
    }

    async loadCurrentResult(): Promise<string | null> {
        const batch = await this.loadCurrentBatch();
        return getFirstSuccessfulResultSlot(batch?.results ?? [])?.imageUrl ?? null;
    }

    async loadCurrentResultReferences(): Promise<string[] | null> {
        return (await this.loadCurrentBatch())?.references ?? null;
    }

    async saveCurrentResult(result: string, usedReferences: string[] | null = null): Promise<void> {
        await this.saveCurrentBatch({
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: result,
                isSaved: false,
            }],
            references: usedReferences,
            draft: null,
            lineageSource: null,
        });
    }

    async clearCurrentResult(): Promise<void> {
        await Promise.all([
            this.blobStorage.remove(GENERATE_CURRENT_BATCH_KEY),
            this.blobStorage.remove(GENERATE_CURRENT_RESULT_KEY),
            this.blobStorage.remove(GENERATE_CURRENT_RESULT_REFERENCES_KEY),
        ]);
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

    private async loadLegacyCurrentBatch(): Promise<GenerateBatchSnapshot | null> {
        const result = await this.blobStorage.load(GENERATE_CURRENT_RESULT_KEY);

        if (!result) {
            return null;
        }

        return {
            results: [{
                slotIndex: 0,
                status: 'success',
                imageUrl: result,
                isSaved: false,
            }],
            references: await this.loadLegacyCurrentResultReferences(),
            draft: null,
            lineageSource: this.loadLineageSource(),
        };
    }

    private async loadLegacyCurrentResultReferences(): Promise<string[] | null> {
        const value = await this.blobStorage.load(GENERATE_CURRENT_RESULT_REFERENCES_KEY);
        if (!value) {
            return null;
        }

        try {
            const references = JSON.parse(value) as unknown;
            return Array.isArray(references) && references.every((reference) => typeof reference === 'string')
                ? references
                : null;
        } catch {
            return null;
        }
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
    const legacyGptImage2Controls = sanitizeImageModelControls(OPENAI_IMAGE_MODEL, {
        quality: draft.quality,
        size: draft.aspectRatio,
        background: draft.background,
    });
    const legacyNanoBananaProControls = sanitizeImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, {
        aspectRatio: draft.aspectRatio,
        imageSize: draft.quality,
    });

    return {
        model: isImageModelSlug(draft.model) ? draft.model : DEFAULT_GENERATE_DRAFT.model,
        prompt: typeof draft.prompt === 'string' ? draft.prompt : DEFAULT_GENERATE_DRAFT.prompt,
        style: typeof draft.style === 'string' ? draft.style : DEFAULT_GENERATE_DRAFT.style,
        lighting: typeof draft.lighting === 'string' ? draft.lighting : DEFAULT_GENERATE_DRAFT.lighting,
        palette: typeof draft.palette === 'string' ? draft.palette : DEFAULT_GENERATE_DRAFT.palette,
        gptImage2: sanitizeImageModelControls(OPENAI_IMAGE_MODEL, draft.gptImage2, legacyGptImage2Controls),
        nanoBananaPro: sanitizeImageModelControls(NANO_BANANA_PRO_IMAGE_MODEL, draft.nanoBananaPro, legacyNanoBananaProControls),
        isSaved: typeof draft.isSaved === 'boolean' ? draft.isSaved : DEFAULT_GENERATE_DRAFT.isSaved,
    };
};

export function getActiveGenerateControls(draft: GenerateDraft) {
    if (draft.model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return buildActiveImageModelControls(draft.model, draft.nanoBananaPro);
    }

    return buildActiveImageModelControls(draft.model, draft.gptImage2);
}

export function getActiveGenerateArchiveFields(draft: GenerateDraft): ImageModelArchiveFields {
    if (draft.model === NANO_BANANA_PRO_IMAGE_MODEL) {
        return buildImageModelArchiveFields(draft.model, draft.nanoBananaPro);
    }

    return buildImageModelArchiveFields(draft.model, draft.gptImage2);
}

export const getImageModelDraftKey = resolveImageModelDraftKey;

function parseGenerateBatchSnapshot(value: string): GenerateBatchSnapshot | null {
    try {
        return sanitizeGenerateBatchSnapshot(JSON.parse(value) as unknown);
    } catch {
        return null;
    }
}

function sanitizeGenerateBatchSnapshot(value: unknown): GenerateBatchSnapshot | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const results = Array.isArray(record.results)
        ? record.results.map(sanitizeGenerateResultSlot).filter((result): result is GenerateResultSlot => result !== null)
        : [];

    if (results.length === 0) {
        return null;
    }

    return {
        results,
        references: sanitizeReferenceDataUrls(record.references),
        draft: record.draft ? sanitizeGenerateDraft(record.draft as DraftLike) : null,
        lineageSource: sanitizeGenerateLineageSource(record.lineageSource),
    };
}

function sanitizeGenerateResultSlot(value: unknown): GenerateResultSlot | null {
    const record = asRecord(value);
    if (!record) {
        return null;
    }

    const slotIndex = coerceSlotIndex(record.slotIndex);
    if (slotIndex === null) {
        return null;
    }

    if (record.status === 'success' && typeof record.imageUrl === 'string' && record.imageUrl.length > 0) {
        return {
            slotIndex,
            status: 'success',
            imageUrl: record.imageUrl,
            isSaved: record.isSaved === true,
            ...(typeof record.archiveImageId === 'string' && record.archiveImageId
                ? { archiveImageId: record.archiveImageId }
                : {}),
        };
    }

    if (record.status === 'failed' && typeof record.error === 'string' && record.error.length > 0) {
        return {
            slotIndex,
            status: 'failed',
            error: record.error,
        };
    }

    return null;
}

function sanitizeReferenceDataUrls(value: unknown): string[] | null {
    return Array.isArray(value) && value.every((reference) => typeof reference === 'string')
        ? value
        : null;
}

function sanitizeGenerateLineageSource(value: unknown): GenerateLineageSource | null {
    const record = asRecord(value);
    if (!record || typeof record.archiveImageId !== 'string' || !record.archiveImageId) {
        return null;
    }

    return {
        archiveImageId: record.archiveImageId,
        stepId: typeof record.stepId === 'string' ? record.stepId : null,
    };
}

function getFirstSuccessfulResultSlot(results: GenerateResultSlot[]) {
    return results.find((result): result is Extract<GenerateResultSlot, { status: 'success' }> =>
        result.status === 'success',
    ) ?? null;
}

function coerceSlotIndex(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return null;
    }

    return value;
}

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
}
