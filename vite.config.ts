import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 1000,
    // Optimize build for production
    minify: 'esbuild',
    cssMinify: true,
    sourcemap: false, // Disable sourcemaps in production for faster builds
    reportCompressedSize: false, // Skip gzip size reporting for faster builds
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          // Core React dependencies
          if (id.includes('react-dom') || id.includes('react/jsx-runtime')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/react') && !id.includes('react-')) {
            return 'react-vendor';
          }
          
          // Heavy charting library - separate chunk
          if (id.includes('recharts')) {
            return 'charts-vendor';
          }
          
          // Calendar library - separate chunk
          if (id.includes('react-big-calendar')) {
            return 'calendar-vendor';
          }
          
          // Email editor - separate chunk
          if (id.includes('react-email-editor')) {
            return 'email-editor-vendor';
          }
          
          // Payment SDKs - separate chunk
          if (id.includes('square') || id.includes('helcim')) {
            return 'payment-vendor';
          }
          
          // UI components
          if (id.includes('@radix-ui')) {
            return 'ui-vendor';
          }
          
          // Form handling
          if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
            return 'form-vendor';
          }
          
          // Date utilities
          if (id.includes('date-fns') || id.includes('react-day-picker')) {
            return 'date-vendor';
          }
          
          // Data fetching
          if (id.includes('@tanstack/react-query')) {
            return 'query-vendor';
          }
          
          // Utilities
          if (id.includes('clsx') || id.includes('tailwind-merge') || id.includes('lucide-react')) {
            return 'utils-vendor';
          }
          
          // AWS SDK - separate chunk
          if (id.includes('@aws-sdk')) {
            return 'aws-vendor';
          }
          
          // Other large libraries
          if (id.includes('signature_pad')) {
            return 'signature-vendor';
          }
          if (id.includes('papaparse')) {
            return 'csv-vendor';
          }
          if (id.includes('qrcode')) {
            return 'qr-vendor';
          }
        },
        // Use content hash for better caching
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash].[ext]',
      },
      // Optimize treeshaking
      treeshake: {
        preset: 'recommended',
        manualPureFunctions: ['console.log', 'console.debug', 'console.trace'],
      },
    },
  },
  server: {
    port: 5174,  // Changed from 5173 to avoid conflict with your other app
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3002',  // Backend running on port 3002
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    include: ['react', 'react-dom'],
  },
});
