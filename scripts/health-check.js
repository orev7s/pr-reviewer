#!/usr/bin/env node

/**
 * Health Check Script for Gemini PR Reviewer GitHub App
 * 
 * This script verifies that the application is properly configured
 * and can connect to required services.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('🏥 Health Check for Gemini PR Reviewer GitHub App\n');

// Color codes for output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, symbol, message) {
  console.log(`${colors[color]}${symbol} ${message}${colors.reset}`);
}

function success(message) {
  log('green', '✅', message);
}

function error(message) {
  log('red', '❌', message);
}

function warning(message) {
  log('yellow', '⚠️ ', message);
}

function info(message) {
  log('blue', 'ℹ️ ', message);
}

// Health check results
const results = {
  passed: 0,
  failed: 0,
  warnings: 0
};

// Check if file exists
function checkFile(filePath, required = true) {
  if (fs.existsSync(filePath)) {
    success(`Found: ${filePath}`);
    results.passed++;
    return true;
  } else {
    if (required) {
      error(`Missing required file: ${filePath}`);
      results.failed++;
    } else {
      warning(`Optional file not found: ${filePath}`);
      results.warnings++;
    }
    return false;
  }
}

// Check environment variables
function checkEnvFile() {
  info('Checking environment configuration...');
  
  if (!checkFile('.env', false)) {
    warning('No .env file found. Create one using .env.example as a template.');
    return;
  }

  // Load environment variables
  require('dotenv').config();

  const requiredVars = [
    'GITHUB_APP_ID',
    'GEMINI_API_KEY'
  ];

  const optionalVars = [
    'GITHUB_APP_PRIVATE_KEY',
    'GITHUB_APP_PRIVATE_KEY_PATH',
    'GITHUB_APP_CLIENT_ID',
    'GITHUB_APP_CLIENT_SECRET',
    'GITHUB_APP_WEBHOOK_SECRET'
  ];

  // Check required variables
  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      success(`Environment variable set: ${varName}`);
      results.passed++;
    } else {
      error(`Missing required environment variable: ${varName}`);
      results.failed++;
    }
  });

  // Check private key configuration
  const hasPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const hasPrivateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;

  if (!hasPrivateKey && !hasPrivateKeyPath) {
    error('Missing GitHub App private key configuration');
    error('Set either GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH');
    results.failed++;
  } else if (hasPrivateKeyPath) {
    if (checkFile(process.env.GITHUB_APP_PRIVATE_KEY_PATH)) {
      success('GitHub App private key file found');
    }
  } else if (hasPrivateKey) {
    success('GitHub App private key configured inline');
    results.passed++;
  }

  // Check optional variables
  optionalVars.forEach(varName => {
    if (process.env[varName]) {
      success(`Optional environment variable set: ${varName}`);
    } else {
      info(`Optional environment variable not set: ${varName}`);
    }
  });
}

// Check required files
function checkRequiredFiles() {
  info('Checking required files...');
  
  const requiredFiles = [
    'package.json',
    'tsconfig.json',
    'README.md',
    'GITHUB-APP-SETUP.md',
    'github-app-manifest.json',
    '.env.example',
    '.gitignore'
  ];

  const optionalFiles = [
    'CONTRIBUTING.md',
    'CHANGELOG.md',
    'LICENSE'
  ];

  requiredFiles.forEach(file => checkFile(file));
  optionalFiles.forEach(file => checkFile(file, false));
}

// Check source files
function checkSourceFiles() {
  info('Checking source files...');
  
  const sourceFiles = [
    'src/github-app-auth.ts',
    'src/config-manager.ts',
    'src/core-reviewer.ts',
    'src/polling-server.ts',
    'src/webhook-server.ts',
    'src/auth-manager.ts'
  ];

  sourceFiles.forEach(file => checkFile(file));
}

// Check build files
function checkBuildFiles() {
  info('Checking build files...');
  
  if (!checkFile('dist', false)) {
    warning('No dist directory found. Run "npm run build" to build the project.');
    return;
  }

  const buildFiles = [
    'dist/github-app-auth.js',
    'dist/config-manager.js',
    'dist/core-reviewer.js',
    'dist/polling-server.js',
    'dist/webhook-server.js'
  ];

  buildFiles.forEach(file => checkFile(file, false));
}

// Check dependencies
function checkDependencies() {
  info('Checking dependencies...');
  
  if (!checkFile('node_modules', false)) {
    warning('No node_modules directory found. Run "npm install" to install dependencies.');
    return;
  }

  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    const requiredDeps = [
      '@octokit/rest',
      '@octokit/auth-app',
      '@octokit/webhooks',
      'axios',
      'express',
      'dotenv',
      'jsonwebtoken'
    ];

    requiredDeps.forEach(dep => {
      if (packageJson.dependencies && packageJson.dependencies[dep]) {
        success(`Dependency found: ${dep}`);
        results.passed++;
      } else {
        error(`Missing dependency: ${dep}`);
        results.failed++;
      }
    });
  } catch (err) {
    error('Failed to parse package.json');
    results.failed++;
  }
}

// Test GitHub API connectivity
async function testGitHubAPI() {
  info('Testing GitHub API connectivity...');
  
  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'api.github.com',
      path: '/zen',
      method: 'GET',
      headers: {
        'User-Agent': 'Gemini-PR-Reviewer-Health-Check'
      },
      timeout: 5000
    }, (res) => {
      if (res.statusCode === 200) {
        success('GitHub API is reachable');
        results.passed++;
      } else {
        error(`GitHub API returned status: ${res.statusCode}`);
        results.failed++;
      }
      resolve();
    });

    req.on('error', (err) => {
      error(`Cannot reach GitHub API: ${err.message}`);
      results.failed++;
      resolve();
    });

    req.on('timeout', () => {
      error('GitHub API request timed out');
      results.failed++;
      resolve();
    });

    req.end();
  });
}

// Test Gemini API connectivity
async function testGeminiAPI() {
  info('Testing Gemini API connectivity...');
  
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    warning('Skipping Gemini API test - no API key configured');
    return;
  }

  return new Promise((resolve) => {
    const req = https.request({
      hostname: 'generativelanguage.googleapis.com',
      path: '/v1beta/models?key=' + apiKey,
      method: 'GET',
      timeout: 5000
    }, (res) => {
      if (res.statusCode === 200) {
        success('Gemini API is reachable and API key is valid');
        results.passed++;
      } else if (res.statusCode === 401) {
        error('Gemini API key is invalid');
        results.failed++;
      } else {
        error(`Gemini API returned status: ${res.statusCode}`);
        results.failed++;
      }
      resolve();
    });

    req.on('error', (err) => {
      error(`Cannot reach Gemini API: ${err.message}`);
      results.failed++;
      resolve();
    });

    req.on('timeout', () => {
      error('Gemini API request timed out');
      results.failed++;
      resolve();
    });

    req.end();
  });
}

// Main health check function
async function runHealthCheck() {
  console.log('Starting comprehensive health check...\n');

  checkRequiredFiles();
  console.log();
  
  checkSourceFiles();
  console.log();
  
  checkBuildFiles();
  console.log();
  
  checkDependencies();
  console.log();
  
  checkEnvFile();
  console.log();
  
  await testGitHubAPI();
  console.log();
  
  await testGeminiAPI();
  console.log();

  // Summary
  console.log('📊 Health Check Summary:');
  console.log('========================');
  
  if (results.failed === 0) {
    if (results.warnings === 0) {
      success(`All checks passed! (${results.passed} passed)`);
    } else {
      success(`${results.passed} checks passed, ${results.warnings} warnings`);
      warning('Some optional components are missing or not configured');
    }
  } else {
    error(`${results.failed} checks failed, ${results.passed} passed, ${results.warnings} warnings`);
    console.log();
    error('Please fix the failed checks before deploying');
  }

  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('uncaughtException', (err) => {
  error(`Uncaught exception: ${err.message}`);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  error(`Unhandled rejection: ${err.message}`);
  process.exit(1);
});

// Run the health check
runHealthCheck().catch((err) => {
  error(`Health check failed: ${err.message}`);
  process.exit(1);
});
