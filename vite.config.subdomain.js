// vite.config.subdomain.js
/**
 * Vite Server Configuration for Subdomain Development
 * 
 * For local development with subdomains, use:
 * npm run dev -- --config vite.config.subdomain.js
 * 
 * Then access:
 * - vendor.localhost:5173
 * - buyer.localhost:5173
 * - dir.localhost:5173
 * - man.localhost:5173
 * etc.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';

export default defineConfig({
  plugins: [react()],
  
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  server: {
    host: '::',  // Listen on all IPv6 addresses
    port: 5173,
    middlewareMode: false,
    
    // Custom middleware to handle subdomain requests
    middleware: [
      (req, res, next) => {
        // Extract subdomain from hostname
        const hostname = req.headers.host || '';
        const host = hostname.split(':')[0];
        const parts = host.split('.');
        
        const subdomain = parts.length > 1 && parts[0] !== 'localhost' ? parts[0] : null;

        // Log subdomain info
        if (process.env.DEBUG_SUBDOMAIN === 'true') {
          console.log(`[Vite] Host: ${hostname} → Subdomain: ${subdomain}`);
        }

        // Attach to request for later use
        req.subdomain = subdomain;
        next();
      },
    ],

    // Proxy API requests to Express backend
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
      '/health': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-libs': [
            'react',
            'react-dom',
            'react-router-dom',
            '@supabase/supabase-js',
          ],
        },
      },
    },
  },
});
