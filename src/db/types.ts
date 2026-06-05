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
    references?: string[];
    style?: string;
    lighting?: string;
    palette?: string;
    layerStack?: ArchiveLayerStack;
}

export type ArchiveLayerKind = 'base' | 'uploaded' | 'ai-result';

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
    visible: boolean;
    locked: boolean;
}

export interface ArchiveLayerStack {
    canvasWidth: number;
    canvasHeight: number;
    layers: ArchiveLayer[];
}
