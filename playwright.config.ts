import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    workers: 1,
    use: {
        baseURL: 'http://127.0.0.1:5183',
        browserName: 'chromium',
        viewport: { width: 1440, height: 1000 },
        trace: 'on',
        serviceWorkers: 'block',
    },
    webServer: {
        command: 'npm run dev -- --host 127.0.0.1 --port 5183 --strictPort',
        url: 'http://127.0.0.1:5183',
        reuseExistingServer: false,
    },
});
