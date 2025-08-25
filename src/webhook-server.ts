import express from 'express';
import { PullRequestReviewer, Config } from './core-reviewer';
import { configManager } from './config-manager';
import { GitHubAppAuth } from './github-app-auth';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

interface WebhookPayload {
  action: string;
  pull_request: {
    number: number;
    state: string;
    draft: boolean;
    updated_at: string;
    head: {
      sha: string;
    };
  };
  repository: {
    owner: {
      login: string;
    };
    name: string;
  };
}

interface ProcessedPR {
  id: string;
  head_sha: string;
  reviewed_at: string;
}

class WebhookPRReviewer {
  private app: express.Application;
  private reviewer?: PullRequestReviewer;
  private githubAuth?: GitHubAppAuth;
  private config: any;
  private webhookSecret: string;
  private processedPRs: Map<string, ProcessedPR> = new Map();

  constructor() {
    // Get config from config manager
    this.config = configManager.getConfig();
    
    // Get GitHub App authentication
    this.githubAuth = configManager.getGitHubAuth();
    
    // Use GitHub App webhook secret if available
    this.webhookSecret = this.config.githubApp?.webhookSecret || process.env.GITHUB_APP_WEBHOOK_SECRET || '';

    if (!this.githubAuth || !this.config.geminiApiKey) {
      const missing = [];
      if (!this.githubAuth) missing.push('GitHub App configuration');
      if (!this.config.geminiApiKey) missing.push('GEMINI_API_KEY');
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    this.reviewer = new PullRequestReviewer({
      githubAuth: this.githubAuth,
      geminiApiKey: this.config.geminiApiKey,
      model: this.config.model,
      maxFiles: this.config.maxFiles,
      maxLinesPerFile: this.config.maxLinesPerFile,
    });
    
    this.app = express();

    this.setupMiddleware();
    this.setupRoutes();

    console.log('🤖 GitHub App PR Reviewer (Webhook Mode) initialized');
  }

  private setupMiddleware(): void {
    // Raw body parser for webhook signature verification
    this.app.use('/webhook', express.raw({ type: 'application/json' }));
    
    // JSON parser for other routes
    this.app.use(express.json());

    // Basic logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes(): void {
    // Main webhook endpoint
    this.app.post('/webhook', async (req, res) => {
      try {
        // Verify webhook signature if secret is provided
        if (this.webhookSecret && this.githubAuth && !this.githubAuth.verifyWebhookSignature(req.body, req.headers['x-hub-signature-256'] as string)) {
          console.warn('⚠️  Invalid webhook signature');
          return res.status(401).json({ error: 'Invalid signature' });
        }

        const payload: WebhookPayload = JSON.parse(req.body.toString());
        
        // Only process pull request events
        if (!payload.pull_request) {
          return res.status(200).json({ message: 'Not a pull request event' });
        }

        // Only process relevant actions
        const relevantActions = ['opened', 'synchronize', 'reopened'];
        if (!relevantActions.includes(payload.action)) {
          return res.status(200).json({ message: `Ignoring action: ${payload.action}` });
        }

        // Extract repository and PR information
        const owner = payload.repository.owner.login;
        const repo = payload.repository.name;
        const prNumber = payload.pull_request.number;

        console.log(`🔔 Webhook received: ${payload.action} PR #${prNumber} in ${owner}/${repo}`);

        // Check if we should review this PR (avoid duplicates for same commit)
        const prKey = `${owner}/${repo}#${prNumber}`;
        const processedPR = this.processedPRs.get(prKey);
        const headSha = payload.pull_request.head.sha;

        if (processedPR && processedPR.head_sha === headSha) {
          console.log(`⏭️  Skipping PR #${prNumber} - already reviewed commit ${headSha.substring(0, 7)}`);
          return res.status(200).json({ 
            message: 'PR already reviewed for this commit',
            pr: `${owner}/${repo}#${prNumber}`,
            commit: headSha.substring(0, 7)
          });
        }

        // Process the PR review asynchronously
        this.processPRReview(owner, repo, prNumber, payload.action, headSha);

        // Respond immediately to GitHub
        res.status(200).json({ 
          message: 'Webhook received, processing PR review',
          pr: `${owner}/${repo}#${prNumber}`,
          action: payload.action
        });

      } catch (error) {
        console.error('❌ Webhook processing error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });

    // Status endpoint
    this.app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        mode: 'webhook',
        uptime: process.uptime(),
        processedPRs: this.processedPRs.size,
        config: {
          model: this.config.model,
          maxFiles: this.config.maxFiles,
          maxLinesPerFile: this.config.maxLinesPerFile,
          webhookSecretConfigured: !!this.webhookSecret,
        }
      });
    });

    // Root endpoint
    this.app.get('/', (req, res) => {
      res.json({
        name: 'Self-hosted Gemini PR Reviewer',
        mode: 'webhook',
        endpoints: {
          webhook: '/webhook',
          health: '/health',
          status: '/status'
        }
      });
    });
  }



  private async processPRReview(owner: string, repo: string, prNumber: number, action: string, headSha: string): Promise<void> {
    try {
      console.log(`🤖 Starting AI review for ${action} PR #${prNumber} in ${owner}/${repo} (commit: ${headSha.substring(0, 7)})`);
      
      // Add a small delay to let GitHub process the PR changes
      if (action === 'synchronize') {
        await this.sleep(2000);
      }

      await this.reviewer.reviewPullRequest(owner, repo, prNumber);
      
      // Mark PR as reviewed for this commit
      const prKey = `${owner}/${repo}#${prNumber}`;
      this.processedPRs.set(prKey, {
        id: `${owner}/${repo}/${prNumber}`,
        head_sha: headSha,
        reviewed_at: new Date().toISOString()
      });
      
      console.log(`✅ Completed AI review for PR #${prNumber} in ${owner}/${repo} (commit: ${headSha.substring(0, 7)})`);
      
    } catch (error) {
      console.error(`❌ Failed to review PR #${prNumber} in ${owner}/${repo}:`, error instanceof Error ? error.message : String(error));
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private cleanupOldPRs(): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 7); // Remove PRs older than 7 days

    let cleanedCount = 0;
    for (const [key, pr] of this.processedPRs.entries()) {
      if (new Date(pr.reviewed_at) < cutoffDate) {
        this.processedPRs.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} old PR records`);
    }
  }

  public start(port: number = 3000): void {
    this.app.listen(port, () => {
      console.log(`🚀 Webhook server running on port ${port}`);
      console.log(`📥 Webhook URL: http://localhost:${port}/webhook`);
      console.log(`📊 Status URL: http://localhost:${port}/status`);
      console.log(`💚 Health URL: http://localhost:${port}/health`);
      
      if (!this.webhookSecret) {
        console.warn('⚠️  No WEBHOOK_SECRET configured - webhook signature verification disabled');
      }

      console.log('\n📝 Next steps:');
      console.log('1. Expose this server to the internet (using ngrok or similar)');
      console.log('2. Add the webhook URL to your GitHub repository settings');
      console.log('3. Set webhook to trigger on "Pull requests" events');

      // Set up cleanup interval (every hour)
      setInterval(() => {
        this.cleanupOldPRs();
      }, 60 * 60 * 1000);
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('\n🛑 Shutting down webhook server gracefully...');
      process.exit(0);
    });
  }
}

// Start the server if this file is run directly
if (require.main === module) {
  try {
    const server = new WebhookPRReviewer();
    const port = parseInt(process.env.PORT || '3000');
    server.start(port);
  } catch (error) {
    console.error('❌ Failed to start webhook server:', error);
    process.exit(1);
  }
}

export { WebhookPRReviewer };
