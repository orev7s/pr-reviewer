const fs = require('fs');
const readline = require('readline');
const path = require('path');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setup() {
  console.log('🚀 Welcome to Gemini PR Reviewer GitHub App Setup!\n');

  // Check if .env already exists
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }

  console.log('This setup will help you configure the GitHub App integration.\n');
  console.log('📖 First, create your GitHub App using the provided manifest:');
  console.log('   1. Go to https://github.com/settings/apps');
  console.log('   2. Click "New GitHub App"');
  console.log('   3. Click "Create a GitHub App from a manifest"');
  console.log('   4. Upload the github-app-manifest.json file');
  console.log('   5. Update the webhook URL to match your server\n');

  console.log('Please provide the following GitHub App information:\n');

  // GitHub App ID
  const appId = await question('🔑 GitHub App ID: ');
  if (!appId || isNaN(appId)) {
    console.log('⚠️  Warning: App ID should be a number');
  }

  // Private Key
  console.log('\n📝 Private Key Options:');
  console.log('1. Provide file path to private key (.pem file)');
  console.log('2. Paste private key content directly');
  const keyOption = await question('Choose option (1 or 2): ');
  
  let privateKey = '';
  if (keyOption === '1') {
    const keyPath = await question('📁 Private key file path (./github-app-private-key.pem): ') || './github-app-private-key.pem';
    if (fs.existsSync(keyPath)) {
      privateKey = `PRIVATE_KEY_PATH=${keyPath}`;
    } else {
      console.log('⚠️  File not found, you can add it manually later');
      privateKey = `PRIVATE_KEY_PATH=${keyPath}`;
    }
  } else {
    console.log('📋 Paste your private key (press Enter twice when done):');
    const keyContent = await question('Private key: ');
    privateKey = `PRIVATE_KEY=${keyContent.replace(/\n/g, '\\n')}`;
  }

  // Client ID and Secret (optional)
  const clientId = await question('🔑 GitHub App Client ID (optional): ') || '';
  const clientSecret = await question('🔑 GitHub App Client Secret (optional): ') || '';
  
  // Webhook Secret
  const webhookSecret = await question('🔐 Webhook Secret (recommended): ') || '';

  // Gemini API Key
  const geminiApiKey = await question('🤖 Gemini API Key: ');

  // Mode selection
  console.log('\n📡 Server Mode:');
  console.log('1. Polling (simpler setup, checks every 2 minutes)');
  console.log('2. Webhook (real-time, receives immediate notifications)');
  const mode = await question('Choose mode (1 or 2): ');

  let port = '3000';
  if (mode === '2') {
    port = await question('🌐 Port (default 3000): ') || '3000';
  }

  // Create .env file
  const envContent = `# GitHub App Configuration
GITHUB_APP_ID=${appId}
${privateKey.startsWith('PRIVATE_KEY_PATH=') ? 
  `GITHUB_APP_PRIVATE_KEY_PATH=${privateKey.split('=')[1]}` : 
  `GITHUB_APP_PRIVATE_KEY="${privateKey.split('=')[1]}"`}
${clientId ? `GITHUB_APP_CLIENT_ID=${clientId}` : '# GITHUB_APP_CLIENT_ID='}
${clientSecret ? `GITHUB_APP_CLIENT_SECRET=${clientSecret}` : '# GITHUB_APP_CLIENT_SECRET='}
${webhookSecret ? `GITHUB_APP_WEBHOOK_SECRET=${webhookSecret}` : '# GITHUB_APP_WEBHOOK_SECRET='}

# Gemini AI Configuration  
GEMINI_API_KEY=${geminiApiKey}
GEMINI_MODEL=gemini-2.5-flash

# Review Configuration
MAX_FILES=40
MAX_LINES_PER_FILE=1500

# Server Configuration
PORT=${port}

# Polling Configuration (polling mode)
POLL_INTERVAL=2
`;

  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Configuration saved to .env');
  console.log('\n🏗️  Next steps:');
  console.log('1. Install the GitHub App on your repositories:');
  console.log('   - Go to your GitHub App settings');
  console.log('   - Click "Install App"');
  console.log('   - Choose repositories to monitor');
  console.log('2. Run: npm install');
  console.log('3. Run: npm run build');
  
  if (mode === '2') {
    console.log('4. Run: npm run start:webhook');
    console.log('5. Expose your server to the internet:');
    console.log('   - Development: ngrok http ' + port);
    console.log('   - Production: Configure reverse proxy/domain');
    console.log('6. Update webhook URL in GitHub App settings');
  } else {
    console.log('4. Run: npm start');
  }

  console.log('\n📖 See GITHUB-APP-SETUP.md for detailed setup instructions.');
  console.log('📖 See README.md for usage and configuration details.');
  
  rl.close();
}

setup().catch(console.error);
