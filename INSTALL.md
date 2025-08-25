# 🚀 Quick Installation Guide

## Super Quick Start (2 minutes)

```bash
npm install
npm run quick-start
```

This will:
1. Run interactive setup
2. Build the project  
3. Start the reviewer in polling mode

## Manual Step-by-Step

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

**Option A: Interactive Setup (Recommended)**
```bash
npm run setup
```

**Option B: Manual Configuration**
```bash
cp .env.example .env
# Edit .env with your tokens and repositories
```

### 3. Build the Project

```bash
npm run build
```

### 4. Start the Reviewer

**Polling Mode (Recommended)**
```bash
npm start
```

**Webhook Mode (Advanced)**
```bash
npm start webhook
```

## 🔑 Required Information

You'll need:

1. **GitHub Personal Access Token**
   - Go to: https://github.com/settings/tokens
   - Generate with `repo` permissions

2. **Gemini API Key**
   - Go to: https://aistudio.google.com/app/apikey
   - Create new API key

3. **Repository to Monitor**
   - Format: `owner/repo`
   - Example: `orev7s/hi-im-a-repo`

## ✅ Verification

After starting, you should see:

```
🤖 Self-hosted Gemini PR Reviewer initialized
📂 Watching repositories: orev7s/hi-im-a-repo
🚀 Starting polling server...
✅ Polling server started! Checking for new PRs every 2 minutes.
```

## 🧪 Test It

1. Create a test PR in your repository
2. Add some code with issues
3. Wait 2 minutes
4. Check for AI comments on your PR!

## 🆘 Need Help?

- Check the full README.md for detailed documentation
- Verify your tokens are correct in `.env`
- Look for error messages in the terminal

---

**You're all set!** 🎉 Your AI reviewer is now monitoring your repository.
