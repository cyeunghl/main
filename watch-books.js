#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const booksMdPath = path.join(__dirname, 'books.md');
let buildProcess = null;

function runBuild() {
  if (buildProcess) {
    buildProcess.kill();
  }
  
  console.log('📚 books.md changed, rebuilding...');
  buildProcess = spawn('node', ['build-books.js'], {
    stdio: 'inherit',
    shell: true
  });
  
  buildProcess.on('close', (code) => {
    if (code === 0) {
      console.log('✓ Build complete\n');
    } else {
      console.error(`✗ Build failed with code ${code}\n`);
    }
    buildProcess = null;
  });
}

// Initial build
runBuild();

// Watch for changes
fs.watchFile(booksMdPath, { interval: 500 }, (curr, prev) => {
  if (curr.mtime !== prev.mtime) {
    runBuild();
  }
});

console.log(`👀 Watching ${booksMdPath} for changes...`);
console.log('Press Ctrl+C to stop\n');

// Cleanup on exit
process.on('SIGINT', () => {
  if (buildProcess) {
    buildProcess.kill();
  }
  fs.unwatchFile(booksMdPath);
  process.exit(0);
});

