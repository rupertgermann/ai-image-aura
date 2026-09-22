import type { ImageProvider, ImageProviderRequest, ImageProviderResponse } from './ImageProvider';

const CLEAR_INIT_IMAGE = ' <sd_cpp_extra_args>{"init_image":null}</sd_cpp_extra_args>';

export type LocalServerConnectionResult =
    | { status: 'connected'; modelIds: string[] }
    | { status: 'http-error'; httpStatus: number }
    | { status: 'unreachable'; url: string };

export async function testLocalServerConnection(
    url: string,
    fetchImpl: typeof fetch = fetch,
): Promise<LocalServerConnectionResult> {
    const serverUrl = url.replace(/\/+$/, '');
    let response: Response;
    try {
        response = await fetchImpl(`${serverUrl}/v1/models`);
    } catch {
        return { status: 'unreachable', url: serverUrl };
    }

    if (!response.ok) {
        return { status: 'http-error', httpStatus: response.status };
    }

    const body: unknown = await response.json().catch(() => null);
    const data = body && typeof body === 'object' && 'data' in body ? body.data : null;
    return {
        status: 'connected',
        modelIds: Array.isArray(data)
            ? data.flatMap((item) => item && typeof item === 'object' && typeof item.id === 'string' ? [item.id] : [])
            : [],
    };
}

export function createLocalImageProvider(fetchImpl: typeof fetch = fetch): ImageProvider {
    async function requestImages(request: ImageProviderRequest, edit: boolean): Promise<ImageProviderResponse[]> {
        const serverUrl = request.credential.replace(/\/+$/, '');
        const images = request.referenceImages ?? [];
        const endpoint = edit || images.length > 0 ? request.model.endpoints.edit : request.model.endpoints.generate;
        const url = `${serverUrl}${endpoint}`;
        const prompt = endpoint === request.model.endpoints.edit ? `${request.prompt}${CLEAR_INIT_IMAGE}` : request.prompt;
        let init: RequestInit;

        if (endpoint === request.model.endpoints.edit) {
            const form = new FormData();
            form.append('model', request.model.apiModel);
            form.append('prompt', prompt);
            form.append('n', String(edit ? 1 : request.batchSize ?? 1));
            if (request.size) form.append('size', request.size);
            form.append('output_format', 'png');
            images.slice(0, 10).forEach((image) => form.append('image[]', image));
            init = { method: 'POST', body: form };
        } else {
            init = {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: request.model.apiModel,
                    prompt,
                    n: request.batchSize ?? 1,
                    size: request.size,
                    output_format: 'png',
                }),
            };
        }

        let response: Response;
        try {
            response = await fetchImpl(url, init);
        } catch {
            throw new Error(`Could not reach the local image server at ${serverUrl}.`);
        }

        if (!response.ok) {
            const body: unknown = await response.json().catch(() => null);
            const error = body && typeof body === 'object' && 'error' in body ? body.error : null;
            const message = typeof error === 'string'
                ? error
                : error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
                    ? error.message
                    : null;
            throw new Error(message || `Local image server error: ${response.status}`);
        }

        const body: unknown = await response.json().catch(() => null);
        const data = body && typeof body === 'object' && 'data' in body ? body.data : null;
        return Array.isArray(data)
            ? data.map((item) => ({
                b64_json: item && typeof item === 'object' && typeof item.b64_json === 'string'
                    ? item.b64_json
                    : undefined,
            }))
            : [];
    }

    return {
        generate: (request) => requestImages(request, false),
        async edit(request) {
            return (await requestImages(request, true))[0] ?? {};
        },
    };
}
