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
}

export interface DatabaseAdapter {
    init(): Promise<void>;
    saveImage(image: ArchiveImage): Promise<void>;
    getImages(): Promise<ArchiveImage[]>;
    deleteImage(id: string): Promise<void>;
    clearAll(): Promise<void>;
}
