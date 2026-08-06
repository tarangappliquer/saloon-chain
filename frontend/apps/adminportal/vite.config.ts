import { defineConfig } from 'vite';
import plugin from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [plugin(), tailwindcss()],
    server: {
        port: 58562,
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
                    if (id.includes('node_modules/lucide-react')) {
                        return 'icons';
                    }
                },
            },
        },
    },
});
