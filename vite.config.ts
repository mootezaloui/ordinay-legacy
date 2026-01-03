import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  
  // Base path - use relative paths for Electron file:// protocol
  base: './',
  
  // Resolve aliases
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  
  // Build configuration
  build: {
    // Output directory
    outDir: 'dist',
    
    // Emit manifest for debugging
    manifest: false,
    
    // Source maps for production debugging
    sourcemap: false,
    
    // Rollup options
    rollupOptions: {
      output: {
        // Ensure consistent chunk naming
        manualChunks: undefined,
      },
    },
  },
  
  // Server configuration for development
  server: {
    port: 5173,
    strictPort: true,
  },
})
