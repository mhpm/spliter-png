import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), tailwindcss()],
  resolve: {
    // Transformers.js already loads the ONNX engine from its versioned CDN URL.
    // Selecting the external-WASM export keeps the same runtime behavior without
    // copying an unused 26 MB binary into the deployment archive.
    conditions: ['onnxruntime-web-use-extern-wasm'],
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
