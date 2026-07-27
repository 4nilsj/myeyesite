import { createServer } from 'vite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const server = await createServer({
  root: __dirname,
  server: {
    host: '0.0.0.0',
    port: Number(process.env.PORT || 5173),
    strictPort: false,
  },
});

await server.listen();

console.log(`Vite dev server running at http://localhost:${server.config.server.port}`);
