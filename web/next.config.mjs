import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Monorepo: repo root + web/ each have package-lock.json; pin tracing root explicitly
  outputFileTracingRoot: path.join(__dirname, '..'),
  // Allow browser to directly call the proxy API server
  async headers() {
    return [];
  },
};

export default nextConfig;
