# GitHub App Setup Guide

This guide will walk you through setting up the Gemini PR Reviewer as a GitHub App.

## Prerequisites

- A GitHub account with permission to create GitHub Apps
- Access to your server where the application will run
- A Google Gemini API key ([get here](https://aistudio.google.com/app/apikey))

## Step 1: Create the GitHub App

### Option A: Using the Manifest (Recommended)

1. Go to your GitHub settings: https://github.com/settings/apps
2. Click "New GitHub App"
3. Scroll down and click "Create a GitHub App from a manifest"
4. Upload the `github-app-manifest.json` file from this repository
5. Review and modify the settings as needed:
   - **Webhook URL**: Update to your server's webhook endpoint (e.g., `https://your-domain.com/webhook`)
   - **Redirect URL**: Update to your server's auth callback endpoint (e.g., `https://your-domain.com/auth/callback`)

### Option B: Manual Creation

1. Go to your GitHub settings: https://github.com/settings/apps
2. Click "New GitHub App"
3. Fill in the following information:

**Basic Information:**
- **GitHub App name**: `Gemini PR Reviewer` (or your preferred name)
- **Description**: `AI-powered pull request reviewer using Google's Gemini AI`
- **Homepage URL**: `https://github.com/your-username/gemini-pr-reviewer-github-app`

**Identifying and authorizing users:**
- **Callback URL**: `https://your-server.com/auth/callback` (optional)
- **Request user authorization (OAuth) during installation**: ✅ (optional)
- **Webhook URL**: `https://your-server.com/webhook`
- **Webhook secret**: Generate a secure random string and save it

**Permissions:**
- **Repository permissions:**
  - Contents: `Read`
  - Issues: `Read`
  - Metadata: `Read`
  - Pull requests: `Write`

**Subscribe to events:**
- ✅ `Pull request`
- ✅ `Pull request review`

**Where can this GitHub App be installed:**
- 🔘 `Only on this account` (recommended for personal use)
- 🔘 `Any account` (if you want to distribute publicly)

4. Click "Create GitHub App"

## Step 2: Generate Private Key

1. After creating the app, scroll down to the "Private keys" section
2. Click "Generate a private key"
3. Download the `.pem` file and save it securely
4. Note the **App ID** displayed at the top of the page

## Step 3: Install the App

1. In your GitHub App settings, click "Install App" in the left sidebar
2. Choose the account/organization where you want to install the app
3. Select repositories:
   - **All repositories** (for organization-wide installation)
   - **Selected repositories** (choose specific repositories to monitor)
4. Click "Install"

## Step 4: Configure the Application

### Environment Variables

Create a `.env` file in your project root with the following variables:

```bash
# GitHub App Configuration
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=./path/to/your/private-key.pem
# OR (alternative to file path)
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_CLIENT_ID=Iv1.your_client_id
GITHUB_APP_CLIENT_SECRET=your_client_secret
GITHUB_APP_WEBHOOK_SECRET=your_webhook_secret

# Gemini AI Configuration  
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

# Review Configuration
MAX_FILES=40
MAX_LINES_PER_FILE=1500

# Server Configuration
PORT=3000
```

### Setting up the Private Key

You have two options for providing the private key:

**Option 1: File Path (Recommended)**
```bash
GITHUB_APP_PRIVATE_KEY_PATH=./github-app-private-key.pem
```

**Option 2: Inline Key**
```bash
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEpAIBAAKCAQEA...\n-----END RSA PRIVATE KEY-----"
```

For Option 2, you can convert the .pem file to a single line:
```bash
# On Linux/Mac:
awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' github-app-private-key.pem

# Or use base64 encoding:
base64 -i github-app-private-key.pem
```

## Step 5: Run the Application

### Development Mode
```bash
npm install
npm run setup  # Interactive setup (optional)
npm run build
npm run start
```

### Webhook Mode (Real-time)
```bash
npm run start:webhook
```

### Production with PM2
```bash
npm install -g pm2
npm run build
pm2 start dist/polling-server.js --name "gemini-pr-reviewer"
pm2 startup
pm2 save
```

## Step 6: Expose Your Webhook (if using webhook mode)

Your server needs to be accessible from the internet for GitHub to send webhooks:

### Using ngrok (Development)
```bash
# Install ngrok
npm install -g ngrok

# Expose your local server
ngrok http 3000

# Update your GitHub App webhook URL with the ngrok URL
# e.g., https://abc123.ngrok.io/webhook
```

### Production Deployment
- Use a reverse proxy like nginx
- Ensure your server has a public domain/IP
- Update the webhook URL in your GitHub App settings

## Step 7: Test the Setup

1. Create a test pull request in a repository where the app is installed
2. Check your server logs for processing messages
3. Verify that AI-generated comments appear on the pull request

## Troubleshooting

### Common Issues

**"No GitHub App installation found"**
- Ensure the app is installed on the repository/organization
- Check that the App ID and private key are correct
- Verify the repository permissions

**"Invalid webhook signature"**
- Ensure the webhook secret matches between GitHub App settings and your `.env` file
- Check that the webhook URL is correct and accessible

**"Missing permissions"**
- Review the GitHub App permissions in your app settings
- Ensure the app has `Pull requests: Write` permission

**"Gemini API errors"**
- Verify your Gemini API key is valid and active
- Check your API quotas and rate limits

### Debug Mode

Enable debug logging:
```bash
DEBUG=true npm start
```

### Health Check

Check if your server is running:
```bash
curl http://localhost:3000/health
```

Check application status:
```bash
curl http://localhost:3000/status
```

## Security Considerations

1. **Keep your private key secure** - Never commit it to version control
2. **Use a strong webhook secret** - Generate a random string with sufficient entropy
3. **Limit app permissions** - Only grant the minimum required permissions
4. **Monitor logs** - Regularly check logs for suspicious activity
5. **Keep dependencies updated** - Regularly update npm packages

## Next Steps

- Monitor the application logs for any issues
- Customize the AI review prompts if needed
- Set up monitoring and alerting for production use
- Consider implementing rate limiting for production deployments

## Support

If you encounter issues:
1. Check the application logs
2. Review the GitHub App event deliveries in your app settings
3. Ensure all environment variables are correctly set
4. Verify network connectivity and firewall settings
