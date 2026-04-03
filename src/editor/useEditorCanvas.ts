import { useCallback, useEffect, useRef } from 'react';

export function useEditorCanvas(currentImageUrl: string | null, canvasFilter: string) {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!currentImageUrl) {
            return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }

        const context = canvas.getContext('2d');
        if (!context) {
            return;
        }

        let cancelled = false;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.src = currentImageUrl;
        image.onload = () => {
            if (cancelled) {
                return;
            }

            canvas.width = image.width;
            canvas.height = image.height;
            context.filter = canvasFilter;
            context.clearRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0);
        };

        return () => {
            cancelled = true;
        };
    }, [canvasFilter, currentImageUrl]);

    const exportDataUrl = useCallback(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            throw new Error('Canvas not ready');
        }

        return canvas.toDataURL('image/png');
    }, []);

    const exportBlob = useCallback(async () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            throw new Error('Canvas not ready');
        }

        return new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                    return;
                }

                reject(new Error('Canvas conversion failed'));
            }, 'image/png');
        });
    }, []);

    return {
        canvasRef,
        exportDataUrl,
        exportBlob,
    };
}
