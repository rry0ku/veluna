import net from 'node:net';
import { spawn } from 'node:child_process';

const s = net.createConnection(5183, '127.0.0.1');
s.on('connect', () => {
    console.log('[Veluna] Vite dev server is already running on http://127.0.0.1:5183');
    s.destroy();
    process.exit(0);
});
s.on('error', () => {
    const child = spawn('npm', ['--prefix', 'ui', 'run', 'dev'], { stdio: 'inherit' });
    child.on('exit', (code) => process.exit(code ?? 0));
});
