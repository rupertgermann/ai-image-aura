export interface ActualImageParameters {
    revisedPrompt?: string;
    size?: string;
    quality?: string;
    elapsedMs?: number;
}

export type ApiCostKind = 'image-generation' | 'image-edit' | 'reasoning';

export type ApiCostStatus = 'calculated' | 'unavailable';

export interface ApiCostPricingSnapshot {
    source: string;
    snapshotDate: string;
    unit: 'per_1m_tokens';
    ratesUsdPer1M: Record<string, number>;
    notes?: string[];
}

export interface ApiCostLineItem {
    id: string;
    kind: ApiCostKind;
    operation: string;
    provider: string;
    model: string;
    label: string;
    status: ApiCostStatus;
    currency: 'USD';
    amountUsd?: number;
    usage?: Record<string, number>;
    pricing?: ApiCostPricingSnapshot;
    note?: string;
}

export interface ApiCostLedger {
    version: 1;
    currency: 'USD';
    items: ApiCostLineItem[];
}

export interface ArchiveImage {
    id: string;
    url: string;
    prompt: string;
    quality: string;
    aspectRatio: string;
    background: string;
    timestamp: string;
    model?: string;
    width?: number;
    height?: number;
    favorite?: boolean;
    references?: string[];
    style?: string;
    lighting?: string;
    palette?: string;
    actualParameters?: ActualImageParameters;
    costLedger?: ApiCostLedger;
    layerStack?: ArchiveLayerStack;
}

export type ArchiveLayerKind = 'base' | 'uploaded' | 'ai-result';

export type ArchiveLayerBlendMode =
    | 'normal'
    | 'multiply'
    | 'screen'
    | 'overlay'
    | 'darken'
    | 'lighten'
    | 'soft-light'
    | 'difference';

export const ARCHIVE_LAYER_BLEND_MODES: ArchiveLayerBlendMode[] = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'darken',
    'lighten',
    'soft-light',
    'difference',
];

export function isLayerBlendMode(value: unknown): value is ArchiveLayerBlendMode {
    return ARCHIVE_LAYER_BLEND_MODES.includes(value as ArchiveLayerBlendMode);
}

export interface ArchiveLayer {
    id: string;
    name: string;
    kind: ArchiveLayerKind;
    assetUrl: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    opacity: number;
    blendMode: ArchiveLayerBlendMode;
    visible: boolean;
    locked: boolean;
}

export interface ArchiveLayerStack {
    canvasWidth: number;
    canvasHeight: number;
    layers: ArchiveLayer[];
}
