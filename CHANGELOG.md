# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - 2025-08-25

### 🔄 BREAKING CHANGES
- **Migrated from GitHub Personal Access Tokens to GitHub App authentication**
- Requires creating and installing a GitHub App instead of using PATs
- Configuration format changed (see `.env.example` for new format)

### ✨ Added
- **GitHub App Integration**: Complete migration to GitHub App authentication
- **Enhanced Security**: No more personal access tokens required
- **Enterprise Ready**: Suitable for organization-wide deployment
- **Auto-discovery**: Automatically discovers repositories where the app is installed
- **GitHub App Manifest**: Easy app creation via `github-app-manifest.json`
- **Comprehensive Setup Guide**: New `GITHUB-APP-SETUP.md` documentation
- **Interactive Setup**: Enhanced `npm run setup` with GitHub App configuration
- **Webhook Signature Verification**: Improved security for webhook endpoints
- **Multi-tenant Support**: Ready for hosting multiple organizations

### 🔧 Changed
- **Authentication System**: Complete rewrite using `@octokit/auth-app`
- **Configuration Management**: Updated to handle GitHub App credentials
- **Repository Discovery**: Now uses GitHub App installations instead of manual configuration
- **Webhook Handling**: Enhanced webhook processing with proper signature verification
- **Documentation**: Completely updated README.md and setup instructions

### 🔒 Security
- **Improved Authentication**: GitHub App authentication is more secure than PATs
- **Audit Trail**: All app activities are logged in GitHub's audit logs
- **Fine-grained Permissions**: Only requests minimum required permissions
- **Webhook Security**: Proper webhook signature verification implemented

### 📦 Dependencies
- Added `@octokit/auth-app@^6.0.1` for GitHub App authentication
- Added `@octokit/webhooks@^12.0.4` for enhanced webhook handling
- Added `jsonwebtoken@^9.0.2` for JWT token generation
- Added `@types/jsonwebtoken@^9.0.5` for TypeScript support

### 🗑️ Removed
- **GitHub PAT Support**: No longer supports personal access tokens
- **Manual Repository Configuration**: No longer need to manually specify repositories in environment variables

### 📖 Documentation
- New `GITHUB-APP-SETUP.md` with comprehensive setup instructions
- Updated `README.md` with GitHub App focus
- Added `.env.example` with all configuration options
- Updated setup scripts and documentation throughout

### 🔄 Migration Guide
To migrate from v1.x to v2.0:

1. **Create a GitHub App**:
   - Use the provided `github-app-manifest.json`
   - Or follow the manual setup guide in `GITHUB-APP-SETUP.md`

2. **Update Configuration**:
   - Replace `GITHUB_TOKEN` with GitHub App credentials
   - Update `.env` file following `.env.example`
   - Remove `REPOSITORIES` environment variable (auto-discovered now)

3. **Install the App**:
   - Install your GitHub App on target repositories
   - No need to manually configure repository access

4. **Update Deployment**:
   - Rebuild and redeploy with new configuration
   - Update webhook URLs if using webhook mode

## [1.0.0] - 2024-01-01

### ✨ Initial Release
- **AI-Powered Code Reviews**: Automated PR reviews using Google Gemini AI
- **Dual Operation Modes**: Polling and webhook-based operation
- **Security Analysis**: Detection of vulnerabilities, code smells, and performance issues
- **Self-hosted**: Complete control over your code review process
- **Discord Integration**: Optional Discord bot for repository management
- **Customizable**: Configurable review parameters and AI models
