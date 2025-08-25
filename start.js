#!/usr/bin/env node

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) {
    console.error('❌ .env file not found!');
    console.log('🔧 Run setup first: npm run setup');
    process.exit(1);
  }
}

function checkBuild() {
  const distPath = path.join(__dirname, 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('❌ Build files not found!');
    console.log('🔧 Run build first: npm run build');
    process.exit(1);
  }
}

function startServer(mode) {
  checkEnvFile();
  checkBuild();

  const scriptName = mode === 'webhook' ? 'webhook-server.js' : 'polling-server.js';
  const scriptPath = path.join(__dirname, 'dist', scriptName);

  console.log(`🚀 Starting ${mode} server...`);
  
  const child = spawn('node', [scriptPath], {
    stdio: 'inherit',
    env: { ...process.env }
  });

  child.on('error', (error) => {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  });

  child.on('exit', (code) => {
    console.log(`📴 Server exited with code ${code}`);
    process.exit(code);
  });

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down...');
    child.kill('SIGTERM');
  });
}

// Parse command line arguments
const args = process.argv.slice(2);
const mode = args[0];

if (mode === 'webhook' || mode === 'w') {
  startServer('webhook');
} else if (mode === 'polling' || mode === 'p' || !mode) {
  startServer('polling');
} else {
  console.log('🤖 Gemini PR Reviewer - Self-hosted');
  console.log('');
  console.log('Usage:');
  console.log('  node start.js [mode]');
  console.log('');
  console.log('Modes:');
  console.log('  polling, p    Start in polling mode (default)');
  console.log('  webhook, w    Start in webhook mode');
  console.log('');
  console.log('Examples:');
  console.log('  node start.js         # Start polling mode');
  console.log('  node start.js polling # Start polling mode');
  console.log('  node start.js webhook # Start webhook mode');
  console.log('');
  console.log('First time setup:');
  console.log('  npm run setup         # Interactive setup');
  process.exit(0);
}
