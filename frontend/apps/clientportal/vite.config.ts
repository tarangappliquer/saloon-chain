import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin(), tailwindcss()],
    server: {
        port: 58569,
    },
    optimizeDeps: {
        include: [
            '@uppy/core',
            '@uppy/react',
            '@uppy/tus',
            '@uppy/image-editor',
            '@uppy/dashboard',
            '@uppy/drag-drop',
            '@uppy/status-bar',
            '@uppy/progress-bar',
            '@uppy/file-input',
        ],
    },
    build: {
        target: 'es2022',
        cssCodeSplit: true,
        chunkSizeWarningLimit: 600,
        rollupOptions: {
            output: {
                manualChunks(id: string) {
                    if (id.includes('node_modules/react/') || id.includes('node_modules/react-dom/')) {
                        return 'react-vendor';
                    }
                    if (id.includes('node_modules/react-router')) {
                        return 'router';
                    }
                    if (id.includes('node_modules/@stripe')) {
                        return 'stripe';
                    }
                    if (id.includes('node_modules/lucide-react')) {
                        return 'icons';
                    }
                    // Heavy upload stack (dashboard + image-editor) pulled in via the
                    // @saloon/ui barrel; isolate it so it doesn't bloat the entry chunk.
                    if (id.includes('node_modules/@uppy')) {
                        return 'uppy';
                    }
                    if (id.includes('node_modules')) {
                        return 'vendor';
                    }
                },
            },
        },
    },
});
