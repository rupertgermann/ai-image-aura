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
}
