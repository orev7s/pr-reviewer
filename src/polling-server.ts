import { PullRequestReviewer, Config } from './core-reviewer';
import { authManager } from './auth-manager';
import { configManager } from './config-manager';
import { GitHubAppAuth } from './github-app-auth';
import * as cron from 'node-cron';
import * as dotenv from 'dotenv';
import express, { Request, Response, NextFunction } from 'express';

// Load environment variables
dotenv.config();

interface Repository {
  owner: string;
  repo: string;
}

interface ProcessedPR {
  id: string;
  updated_at: string;
  head_sha: string; // Track the commit SHA to detect actual code changes
}

class PollingPRReviewer {
  private reviewer?: PullRequestReviewer;
  private githubAuth?: GitHubAppAuth;
  private repositories: Repository[];
  private processedPRs: Map<string, ProcessedPR> = new Map();
  private config: any;

  constructor() {
    // Get config from config manager
    this.config = configManager.getConfig();

    // Check for required credentials
    const credentialCheck = configManager.hasValidCredentials();
    if (!credentialCheck.valid) {
      console.warn(`⚠️  Missing credentials: ${credentialCheck.missing.join(', ')}`);
      console.warn('You can set them via Discord bot commands or API endpoints');
    }

    // Initialize empty repositories array - will be loaded from GitHub App
    this.repositories = [];

    // Get GitHub App authentication
    this.githubAuth = configManager.getGitHubAuth();

    if (this.githubAuth && this.config.geminiApiKey) {
      this.reviewer = new PullRequestReviewer({
        githubAuth: this.githubAuth,
        geminiApiKey: this.config.geminiApiKey,
        model: this.config.model,
        maxFiles: this.config.maxFiles,
        maxLinesPerFile: this.config.maxLinesPerFile,
      });
    } else {
      console.log('⚠️  System starting with incomplete configuration');
    }

    console.log('🤖 GitHub App PR Reviewer initialized');
    console.log('✅ Authentication and user management enabled');
  }

  private reinitializeServices(): void {
    this.config = configManager.getConfig();
    
    // Get GitHub App authentication
    this.githubAuth = configManager.getGitHubAuth();
    
    // Initialize reviewer if both GitHub App and Gemini API key are available
    if (this.githubAuth && this.config.geminiApiKey) {
      this.reviewer = new PullRequestReviewer({
        githubAuth: this.githubAuth,
        geminiApiKey: this.config.geminiApiKey,
        model: this.config.model,
        maxFiles: this.config.maxFiles,
        maxLinesPerFile: this.config.maxLinesPerFile,
      });
      console.log('✅ PR Reviewer reinitialized with complete configuration');
    } else {
      const missing = [];
      if (!this.githubAuth) missing.push('GitHub App configuration');
      if (!this.config.geminiApiKey) missing.push('Gemini API key');
      console.log(`📝 Partial reinitialization - missing: ${missing.join(', ')}`);
    }
  }

  private async loadRepositories(): Promise<void> {
    if (!this.githubAuth) {
      console.warn('⚠️  GitHub App not configured, cannot load repositories');
      this.repositories = [];
      return;
    }

    try {
      // Get all repositories accessible by the GitHub App
      const allRepos = await this.githubAuth.listAllAccessibleRepositories();
      
      // Also get repositories from user management for backward compatibility
      const userRepos = await authManager.getAllRepositories();
      
      // Combine and deduplicate
      const combinedRepos = [...new Set([...allRepos, ...userRepos])];
      
      this.repositories = combinedRepos
        .filter(repo => repo.includes('/'))
        .map(repo => {
          const [owner, name] = repo.split('/');
          return { owner, repo: name };
        });
      
      console.log(`📂 Loaded ${this.repositories.length} repositories accessible by GitHub App`);
      if (this.repositories.length > 0) {
        console.log('📂 Watching repositories:', this.repositories.map(r => `${r.owner}/${r.repo}`).join(', '));
      }
    } catch (error) {
      console.error('❌ Failed to load repositories from GitHub App:', error);
      // Fallback to user management repositories
      const allRepos = await authManager.getAllRepositories();
      this.repositories = allRepos
        .filter(repo => repo.includes('/'))
        .map(repo => {
          const [owner, name] = repo.split('/');
          return { owner, repo: name };
        });
      
      console.log(`📂 Fallback: Loaded ${this.repositories.length} repositories from user management`);
    }
  }

  async start(): Promise<void> {
    console.log('🚀 Starting polling server...');
    
    // Load repositories from auth manager
    await this.loadRepositories();
    
    // Initial scan
    await this.scanAllRepositories();

    // Set up cron job to run every 2 minutes
    cron.schedule('*/2 * * * *', async () => {
      console.log('🔄 Scanning for new PRs...');
      await this.scanAllRepositories();
    });

    // Set up cron job for cleanup (every hour)
    cron.schedule('0 * * * *', () => {
      this.cleanupOldPRs();
    });

    console.log('✅ Polling server started! Checking for new PRs every 2 minutes.');
    console.log('📊 Status endpoint available at: http://localhost:3000/status');

    // Keep the process alive
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down gracefully...');
      process.exit(0);
    });
  }

  private async scanAllRepositories(): Promise<void> {
    // Reload repositories to pick up any new ones added by users
    await this.loadRepositories();
    
    if (this.repositories.length === 0) {
      console.log('📭 No repositories configured yet. Add repositories via Discord bot or API.');
      return;
    }

    for (const repo of this.repositories) {
      try {
        await this.scanRepository(repo.owner, repo.repo);
      } catch (error) {
        console.error(`❌ Error scanning ${repo.owner}/${repo.repo}:`, error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async scanRepository(owner: string, repo: string): Promise<void> {
    if (!this.githubAuth) {
      console.warn(`⚠️  Cannot scan ${owner}/${repo} - GitHub App not configured`);
      return;
    }
    
    if (!this.reviewer) {
      console.warn(`⚠️  Cannot review ${owner}/${repo} - AI reviewer not configured (missing Gemini API key)`);
      return;
    }

    try {
      // Get repository-specific Octokit instance
      const octokit = await this.githubAuth.getRepositoryOctokit(owner, repo);
      if (!octokit) {
        console.warn(`⚠️  Cannot access ${owner}/${repo} - GitHub App not installed for this repository`);
        return;
      }

      // Get open pull requests
      const { data: pullRequests } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'open',
        sort: 'updated',
        direction: 'desc',
        per_page: 50,
      });

      let newPRCount = 0;
      let updatedPRCount = 0;

      for (const pr of pullRequests) {
        const prKey = `${owner}/${repo}#${pr.number}`;
        const processedPR = this.processedPRs.get(prKey);

        // Check if this is a new PR or has new commits (actual code changes)
        const isNew = !processedPR;
        const hasNewCommits = processedPR && pr.head.sha !== processedPR.head_sha;

        if (isNew || hasNewCommits) {
          console.log(`${isNew ? '🆕' : '🔄'} ${isNew ? 'New' : 'Updated'} PR found: ${prKey} - "${pr.title}"`);
          
          if (hasNewCommits) {
            console.log(`📝 New commits detected in PR #${pr.number}: ${processedPR.head_sha.substring(0, 7)} → ${pr.head.sha.substring(0, 7)}`);
          }
          
          try {
            await this.reviewer.reviewPullRequest(owner, repo, pr.number);
            
            // Mark as processed with commit SHA
            this.processedPRs.set(prKey, {
              id: pr.id.toString(),
              updated_at: pr.updated_at,
              head_sha: pr.head.sha,
            });

            if (isNew) newPRCount++;
            else updatedPRCount++;

            // Add delay between reviews to avoid rate limiting
            await this.sleep(5000);

          } catch (error) {
            console.error(`❌ Failed to review ${prKey}:`, error instanceof Error ? error.message : String(error));
          }
        } else if (processedPR) {
          // PR exists and no new commits - skip review
          console.debug(`⏭️  Skipping PR #${pr.number} - already reviewed commit ${pr.head.sha.substring(0, 7)}`);
        }
      }

      if (newPRCount > 0 || updatedPRCount > 0) {
        console.log(`📊 ${owner}/${repo}: ${newPRCount} new, ${updatedPRCount} updated PRs processed`);
      }

    } catch (error) {
      console.error(`❌ Failed to scan repository ${owner}/${repo}:`, error instanceof Error ? error.message : String(error));
    }
  }

  private cleanupOldPRs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Remove PRs older than 7 days

    let cleanedCount = 0;
    for (const [key, pr] of this.processedPRs.entries()) {
      if (new Date(pr.updated_at) < cutoffDate) {
        this.processedPRs.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old PR records`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getStatus(): any {
    return {
      status: 'running',
      repositories: this.repositories.map(r => `${r.owner}/${r.repo}`),
      processedPRs: this.processedPRs.size,
      uptime: process.uptime(),
      lastScan: new Date().toISOString(),
      config: {
        model: this.config.model,
        maxFiles: this.config.maxFiles,
        maxLinesPerFile: this.config.maxLinesPerFile,
      }
    };
  }

  public reloadConfiguration(): void {
    this.reinitializeServices();
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  const server = new PollingPRReviewer();
  
  server.start().catch(error => {
    console.error('❌ Failed to start polling server:', error);
    process.exit(1);
  });

  // Setup Express API server
  const app = express();
  
  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  
  // Add CORS headers for local development
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Authentication middleware
  const requireAuth = async (req: any, res: any, next: any) => {
    const sessionId = req.headers.authorization?.replace('Bearer ', '');
    if (!sessionId) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const user = await authManager.validateSession(sessionId);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = user;
    next();
  };

  // Public endpoints
  app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'healthy', timestamp: new Date().toISOString() });
  });

  app.get('/status', async (req: Request, res: Response) => {
    try {
      const stats = await authManager.getStats();
      const serverStatus = server.getStatus();
      res.json({
        ...serverStatus,
        auth: {
          totalUsers: stats.totalUsers,
          totalRepositories: stats.totalRepositories,
          activeSessions: stats.activeSessions
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  // Authentication endpoints
  app.post('/auth/login', async (req: Request, res: Response) => {
    try {
      const { password, userId, username } = req.body;
      
      if (!password || !userId || !username) {
        return res.status(400).json({ error: 'Password, userId, and username are required' });
      }

      const sessionId = await authManager.authenticate(password, userId, username);
      if (!sessionId) {
        return res.status(401).json({ error: 'Invalid password' });
      }

      res.json({ sessionId, message: 'Authentication successful' });
    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  app.post('/auth/logout', requireAuth, async (req: any, res: Response) => {
    try {
      const sessionId = req.headers.authorization?.replace('Bearer ', '');
      if (sessionId) {
        await authManager.logout(sessionId);
      }
      res.json({ message: 'Logged out successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Logout failed' });
    }
  });

  app.get('/auth/me', requireAuth, (req: any, res: Response) => {
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        repositories: req.user.repositories,
        lastActivity: req.user.lastActivity
      }
    });
  });

  // Repository management endpoints
  app.get('/repositories', requireAuth, async (req: any, res: Response) => {
    try {
      const repositories = await authManager.getUserRepositories(req.user.id);
      res.json({ repositories });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get repositories' });
    }
  });

  app.post('/repositories', requireAuth, async (req: any, res: Response) => {
    try {
      const { repository } = req.body;
      
      if (!repository) {
        return res.status(400).json({ error: 'Repository is required' });
      }

      const success = await authManager.addRepository(req.user.id, repository);
      if (!success) {
        return res.status(400).json({ error: 'Invalid repository format or user not found' });
      }

      res.json({ message: 'Repository added successfully', repository });
    } catch (error) {
      res.status(500).json({ error: 'Failed to add repository' });
    }
  });

  app.delete('/repositories/:repository', requireAuth, async (req: any, res: Response) => {
    try {
      const repository = decodeURIComponent(req.params.repository);
      
      const success = await authManager.removeRepository(req.user.id, repository);
      if (!success) {
        return res.status(404).json({ error: 'Repository not found' });
      }

      res.json({ message: 'Repository removed successfully', repository });
    } catch (error) {
      res.status(500).json({ error: 'Failed to remove repository' });
    }
  });

  // Admin endpoints
  app.post('/admin/reset-password', requireAuth, async (req: any, res: Response) => {
    try {
      const newPassword = await authManager.resetPassword();
      res.json({ message: 'Password reset successfully', newPassword });
    } catch (error) {
      res.status(500).json({ error: 'Failed to reset password' });
    }
  });

  app.get('/admin/stats', requireAuth, async (req: any, res: Response) => {
    try {
      const stats = await authManager.getStats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });

  // Get admin password endpoint (for setup)
  app.get('/admin/password', (req: Request, res: Response) => {
    res.json({ password: authManager.getAdminPassword() });
  });

  // Configuration management endpoints
  app.get('/config', requireAuth, (req: Request, res: Response) => {
    try {
      const config = configManager.getConfig();
      const githubAppConfig = configManager.getGitHubAppConfig();
      // Don't expose sensitive data in full
      res.json({
        model: config.model,
        maxFiles: config.maxFiles,
        maxLinesPerFile: config.maxLinesPerFile,
        hasGitHubApp: !!githubAppConfig,
        githubApp: githubAppConfig ? {
          appId: githubAppConfig.appId,
          hasPrivateKey: !!githubAppConfig.privateKey,
          hasClientId: !!githubAppConfig.clientId,
          hasClientSecret: !!githubAppConfig.clientSecret,
          hasWebhookSecret: !!githubAppConfig.webhookSecret,
        } : null,
        hasGeminiApiKey: !!config.geminiApiKey
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get configuration' });
    }
  });

  app.post('/config/github-app', requireAuth, async (req: any, res: Response) => {
    try {
      const { appId, privateKey, clientId, clientSecret, webhookSecret } = req.body;
      
      if (!appId || !privateKey) {
        return res.status(400).json({ error: 'GitHub App ID and private key are required' });
      }

      const result = await configManager.updateGitHubApp({
        appId,
        privateKey,
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        webhookSecret: webhookSecret || '',
      });
      
      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      // Reinitialize services with new GitHub App
      server.reloadConfiguration();

      res.json({ 
        message: 'GitHub App updated successfully',
        appInfo: result.appInfo
      });
    } catch (error) {
      console.error('GitHub App update error:', error);
      res.status(500).json({ error: 'Failed to update GitHub App' });
    }
  });

  app.post('/config/validate-github-app', requireAuth, async (req: any, res: Response) => {
    try {
      const { appId, privateKey, clientId, clientSecret, webhookSecret } = req.body;
      
      if (!appId || !privateKey) {
        return res.status(400).json({ error: 'GitHub App ID and private key are required' });
      }

      const validation = await configManager.validateGitHubApp({
        appId,
        privateKey,
        clientId: clientId || '',
        clientSecret: clientSecret || '',
        webhookSecret: webhookSecret || '',
      });
      res.json(validation);
    } catch (error) {
      res.status(500).json({ error: 'Failed to validate GitHub App' });
    }
  });

  app.post('/config/gemini-key', requireAuth, async (req: any, res: Response) => {
    try {
      const { apiKey } = req.body;
      
      if (!apiKey) {
        return res.status(400).json({ error: 'Gemini API key is required' });
      }

      configManager.updateGeminiApiKey(apiKey);
      
      // Reinitialize services with new key
      server.reloadConfiguration();

      res.json({ message: 'Gemini API key updated successfully' });
    } catch (error) {
      res.status(500).json({ error: 'Failed to update Gemini API key' });
    }
  });

  app.get('/config/test', requireAuth, async (req: Request, res: Response) => {
    try {
      const testResults = await configManager.testConfiguration();
      res.json(testResults);
    } catch (error) {
      res.status(500).json({ error: 'Failed to test configuration' });
    }
  });

  // Error handling middleware
  app.use((error: any, req: Request, res: Response, next: NextFunction) => {
    console.error('API Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`📊 API server running on http://localhost:${port}`);
    console.log(`✅ Admin password: ${authManager.getAdminPassword()}`);
    console.log('🔗 Available endpoints:');
    console.log('  GET  /health - Health check');
    console.log('  GET  /status - Server status');
    console.log('  POST /auth/login - User authentication');
    console.log('  GET  /repositories - Get user repositories');
    console.log('  POST /repositories - Add repository');
    console.log('  DELETE /repositories/:repo - Remove repository');
    console.log('  POST /config/github-app - Configure GitHub App');
    console.log('  POST /config/validate-github-app - Validate GitHub App');
  });
}

export { PollingPRReviewer };
