# Discord Integration Guide

The auto reviewer system now includes Discord bot integration for easy repository management!

## ✅ What's New

**🔐 Shared Authentication System:**
- Single admin password for the entire system
- User sessions with 30-day expiration
- API-based authentication

**🤖 Discord Bot:**
- Connect to your auto reviewer via Discord commands
- Add/remove repositories easily
- Real-time status checking
- User-friendly interface (minimal emojis as requested)

**🌐 API Endpoints:**
- RESTful API for all operations
- Session-based authentication
- Multi-user repository management

## 🚀 Quick Start

### 1. Start the Main Auto Reviewer

```bash
# In the main project directory
npm install
npm run build
npm start
```

The system will:
- ✅ Generate an admin password (shown in console)
- ✅ Start API server on http://localhost:3000
- ✅ Begin monitoring repositories every 2 minutes

### 2. Setup Discord Bot

```bash
# In the discord-bot directory
cd discord-bot
node install.js
```

This will install dependencies, run setup, and build the bot.

### 3. Use Discord Commands

```
/get-password          # Get admin password
/login <password>      # Authenticate
/add-repo owner/repo   # Add repository
/list-repos           # View your repos
/status               # Check system status
```

## 🔗 How They Connect

```
Discord Bot  →  HTTP API  →  Main Auto Reviewer
    ↓              ↓              ↓
 User Auth    Session Mgmt    Repository Scanning
 Repo Mgmt    User Database   PR Reviews
```

**Before:**
- Repositories in `.env` file only
- No user management
- Manual configuration

**Now:**
- User-based repository management
- API-driven configuration
- Discord interface for easy management
- Automatic synchronization

## 📊 System Status

The main system provides these endpoints:

- `GET /health` - Health check
- `GET /status` - System status with user stats
- `GET /admin/password` - Get current admin password
- `POST /auth/login` - User authentication
- `GET /repositories` - Get user's repositories
- `POST /repositories` - Add repository
- `DELETE /repositories/:repo` - Remove repository

## 🔧 Configuration

**Main System (.env):**
```bash
GITHUB_TOKEN=your_github_token
GEMINI_API_KEY=your_gemini_key
# REPOSITORIES is now managed by users via Discord/API
```

**Discord Bot (.env):**
```bash
DISCORD_BOT_TOKEN=your_discord_bot_token
API_BASE_URL=http://localhost:3000
```

## ✅ Benefits

1. **Easy Management**: Add/remove repositories via Discord commands
2. **Multi-User**: Multiple people can manage their own repositories
3. **Real-Time**: Changes apply immediately to the auto reviewer
4. **Secure**: Password-protected with session management
5. **User-Friendly**: Clean Discord interface with minimal emojis
6. **API-First**: All operations available via HTTP API

## 🔄 Migration from Old System

If you have existing repositories in your `.env` file:

1. Start the new system (it will work with empty repository list)
2. Use Discord bot to add your repositories
3. Remove `REPOSITORIES` from `.env` (optional - it will be ignored)

The system automatically manages the repository list based on user configurations.

## 🎯 Next Steps

1. **Start the main system** - Get your admin password
2. **Setup Discord bot** - Connect to your server
3. **Authenticate users** - Share the admin password securely
4. **Add repositories** - Use `/add-repo` for each repository you want monitored

Your auto reviewer is now Discord-enabled! 🎉
