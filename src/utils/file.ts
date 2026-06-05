export const fileToDataURL = (file: File | Blob): Promise<string> => {
    return file.arrayBuffer().then((arrayBuffer) => {
        let binary = '';
        const bytes = new Uint8Array(arrayBuffer);
        bytes.forEach((byte) => {
            binary += String.fromCharCode(byte);
        });
        return `data:${file.type || 'application/octet-stream'};base64,${btoa(binary)}`;
    });
};

export const dataURLtoFile = (dataurl: string, filename: string): File => {
    const match = dataurl.match(/^data:(.+);base64,(.+)$/);

    if (!match) {
        throw new Error('Invalid data URL: expected format data:[mime];base64,[data]');
    }

    const [, mimeDescriptor, rawEncoded] = match;
    const [mime] = mimeDescriptor.split(';');
    const encoded = rawEncoded.replace(/\s+/g, '');
    let bstr: string;

    try {
        bstr = atob(encoded);
    } catch (error) {
        throw new Error('Invalid data URL: malformed base64 payload');
    }

    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, { type: mime });
};
