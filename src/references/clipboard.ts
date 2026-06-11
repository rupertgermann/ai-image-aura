interface ClipboardFileItem {
    kind: string;
    type: string;
    getAsFile: () => File | null;
}

interface ClipboardFileData {
    items?: ArrayLike<ClipboardFileItem>;
    files?: ArrayLike<File>;
}

interface ClipboardEventLike {
    clipboardData?: ClipboardFileData | null;
}

export function getImageFilesFromClipboard(event: ClipboardEventLike): File[] {
    const clipboardData = event.clipboardData;
    if (!clipboardData) {
        return [];
    }

    const items = clipboardData.items ? Array.from(clipboardData.items) : [];
    if (items.length > 0) {
        return items.flatMap((item) => {
            if (item.kind !== 'file') {
                return [];
            }

            const file = item.getAsFile();
            return file && isImageFile(file, item.type) ? [file] : [];
        });
    }

    return clipboardData.files ? Array.from(clipboardData.files).filter((file) => isImageFile(file)) : [];
}

function isImageFile(file: File, clipboardType = file.type) {
    return clipboardType.startsWith('image/') || file.type.startsWith('image/');
}
