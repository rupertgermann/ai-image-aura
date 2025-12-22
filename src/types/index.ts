export type AppView = 'generate' | 'archive' | 'editor' | 'settings';

export interface GeneratedImage {
  id: string;
  url: string; // Base64 or Blob URL
  prompt: string;
  model: string;
  createdAt: number;
  width: number;
  height: number;
  params: {
    quality?: string;
    aspect_ratio?: string;
    background?: 'transparent' | 'opaque';
  };
}

export interface AppState {
  apiKey: string | null;
  images: GeneratedImage[];
  currentView: AppView;
}
