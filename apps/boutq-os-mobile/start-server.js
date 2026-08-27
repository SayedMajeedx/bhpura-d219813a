const { spawn } = require('child_process');
const path = require('path');

const expoCli = path.join(__dirname, 'node_modules', 'expo', 'bin', 'cli');
const child = spawn(process.execPath, [expoCli, 'start', '--port', '8081', '--go', '-c'], {
  stdio: ['pipe', 'inherit', 'inherit'],
  cwd: __dirname,
  env: { ...process.env },
});

// Keep stdin open indefinitely
setInterval(() => {}, 1000 * 60 * 60);

child.on('exit', (code) => {
  console.log(`Expo exited with code ${code}`);
  process.exit(code || 0);
});
