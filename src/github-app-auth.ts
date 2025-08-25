import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';
import * as jwt from 'jsonwebtoken';

export interface GitHubAppConfig {
  appId: string;
  privateKey: string;
  clientId: string;
  clientSecret: string;
  webhookSecret: string;
}

export interface InstallationInfo {
  installationId: number;
  owner: string;
  repos?: string[];
}

export class GitHubAppAuth {
  private config: GitHubAppConfig;
  private appOctokit: Octokit;
  private installations: Map<string, InstallationInfo> = new Map();

  constructor(config: GitHubAppConfig) {
    this.config = config;
    
    // Validate private key format
    let privateKey = config.privateKey;
    if (!privateKey.includes('BEGIN') && !privateKey.includes('END')) {
      // If it's a base64 encoded key, decode it
      try {
        privateKey = Buffer.from(privateKey, 'base64').toString('utf8');
      } catch (error) {
        throw new Error('Invalid private key format. Expected PEM format or base64 encoded PEM.');
      }
    }

    const auth = createAppAuth({
      appId: config.appId,
      privateKey: privateKey,
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    });

    this.appOctokit = new Octokit({
      auth,
    });

    console.log(`✅ GitHub App authentication initialized for App ID: ${config.appId}`);
  }

  /**
   * Get an authenticated Octokit instance for a specific installation
   */
  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const auth = createAppAuth({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      installationId: installationId,
    });

    return new Octokit({ auth });
  }

  /**
   * Get an authenticated Octokit instance for a specific repository
   */
  async getRepositoryOctokit(owner: string, repo: string): Promise<Octokit | null> {
    const installationId = await this.getInstallationId(owner, repo);
    if (!installationId) {
      console.warn(`⚠️  No installation found for ${owner}/${repo}`);
      return null;
    }

    return this.getInstallationOctokit(installationId);
  }

  /**
   * Get installation ID for a specific repository
   */
  async getInstallationId(owner: string, repo?: string): Promise<number | null> {
    try {
      // Check cache first
      const cacheKey = repo ? `${owner}/${repo}` : owner;
      const cached = this.installations.get(cacheKey);
      if (cached) {
        return cached.installationId;
      }

      // Get all installations
      const { data: installations } = await this.appOctokit.rest.apps.listInstallations();

      for (const installation of installations) {
        if (installation.account?.login === owner) {
          // Check if it's an organization or user installation
          if (installation.target_type === 'Organization' || installation.target_type === 'User') {
            // For org/user installations, get the specific repo if needed
            if (repo) {
              try {
                const installationOctokit = await this.getInstallationOctokit(installation.id);
                const { data: repoData } = await installationOctokit.rest.apps.getRepoInstallation({
                  owner,
                  repo,
                });
                
                // Cache the installation
                this.installations.set(cacheKey, {
                  installationId: installation.id,
                  owner,
                  repos: [repo]
                });
                
                return installation.id;
              } catch (error) {
                // Repository not accessible by this installation
                continue;
              }
            } else {
              // Cache the installation
              this.installations.set(cacheKey, {
                installationId: installation.id,
                owner
              });
              
              return installation.id;
            }
          }
        }
      }

      console.warn(`⚠️  No installation found for ${owner}${repo ? `/${repo}` : ''}`);
      return null;
    } catch (error) {
      console.error(`❌ Failed to get installation ID for ${owner}${repo ? `/${repo}` : ''}:`, error);
      return null;
    }
  }

  /**
   * List all installations of the GitHub App
   */
  async listInstallations(): Promise<InstallationInfo[]> {
    try {
      const { data: installations } = await this.appOctokit.rest.apps.listInstallations();
      
      const installationInfos: InstallationInfo[] = [];
      
      for (const installation of installations) {
        if (installation.account?.login) {
          installationInfos.push({
            installationId: installation.id,
            owner: installation.account.login,
          });
        }
      }

      return installationInfos;
    } catch (error) {
      console.error('❌ Failed to list installations:', error);
      return [];
    }
  }

  /**
   * List all repositories accessible by the app for a specific installation
   */
  async listRepositoriesForInstallation(installationId: number): Promise<string[]> {
    try {
      const installationOctokit = await this.getInstallationOctokit(installationId);
      const { data } = await installationOctokit.rest.apps.listReposAccessibleToInstallation();
      
      return data.repositories.map(repo => `${repo.owner.login}/${repo.name}`);
    } catch (error) {
      console.error(`❌ Failed to list repositories for installation ${installationId}:`, error);
      return [];
    }
  }

  /**
   * List all repositories accessible by the app across all installations
   */
  async listAllAccessibleRepositories(): Promise<string[]> {
    try {
      const installations = await this.listInstallations();
      const allRepos: string[] = [];

      for (const installation of installations) {
        const repos = await this.listRepositoriesForInstallation(installation.installationId);
        allRepos.push(...repos);
      }

      return [...new Set(allRepos)]; // Remove duplicates
    } catch (error) {
      console.error('❌ Failed to list all accessible repositories:', error);
      return [];
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): boolean {
    if (!signature || !this.config.webhookSecret) {
      return false;
    }

    const expectedSignature = 'sha256=' + 
      require('crypto')
        .createHmac('sha256', this.config.webhookSecret)
        .update(payload)
        .digest('hex');

    return require('crypto').timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Generate a JWT token for the GitHub App (for API authentication)
   */
  generateAppJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60, // Issued at time, 60 seconds in the past to avoid clock drift
      exp: now + (10 * 60), // JWT expiration time (10 minutes maximum)
      iss: this.config.appId, // GitHub App's identifier
    };

    return jwt.sign(payload, this.config.privateKey, { algorithm: 'RS256' });
  }

  /**
   * Test the GitHub App configuration
   */
  async testConfiguration(): Promise<{
    valid: boolean;
    error?: string;
    appInfo?: {
      name: string;
      owner: string;
      description: string;
      installations: number;
    };
  }> {
    try {
      // Get app information
      const { data: appInfo } = await this.appOctokit.rest.apps.getAuthenticated();
      
      // Get installations count
      const installations = await this.listInstallations();

      return {
        valid: true,
        appInfo: {
          name: appInfo.name,
          owner: appInfo.owner?.login || 'N/A',
          description: appInfo.description || 'No description',
          installations: installations.length,
        }
      };
    } catch (error) {
      let errorMessage = 'Unknown error';
      
      if (error instanceof Error) {
        if (error.message.includes('401')) {
          errorMessage = 'Invalid GitHub App credentials (App ID or private key)';
        } else if (error.message.includes('403')) {
          errorMessage = 'GitHub App has insufficient permissions';
        } else if (error.message.includes('404')) {
          errorMessage = 'GitHub App not found (check App ID)';
        } else {
          errorMessage = error.message;
        }
      }

      return {
        valid: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get the app's configuration (without sensitive data)
   */
  getPublicConfig(): {
    appId: string;
    hasPrivateKey: boolean;
    hasClientId: boolean;
    hasClientSecret: boolean;
    hasWebhookSecret: boolean;
  } {
    return {
      appId: this.config.appId,
      hasPrivateKey: !!this.config.privateKey,
      hasClientId: !!this.config.clientId,
      hasClientSecret: !!this.config.clientSecret,
      hasWebhookSecret: !!this.config.webhookSecret,
    };
  }

  /**
   * Clear installation cache (useful when installations change)
   */
  clearInstallationCache(): void {
    this.installations.clear();
    console.log('🧹 Cleared installation cache');
  }
}

/**
 * Load GitHub App configuration from environment variables or files
 */
export function loadGitHubAppConfig(): GitHubAppConfig | null {
  try {
    const appId = process.env.GITHUB_APP_ID;
    let privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
    const privateKeyPath = process.env.GITHUB_APP_PRIVATE_KEY_PATH;
    const clientId = process.env.GITHUB_APP_CLIENT_ID;
    const clientSecret = process.env.GITHUB_APP_CLIENT_SECRET;
    const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET || '';

    if (!appId) {
      console.warn('⚠️  GITHUB_APP_ID not found in environment variables');
      return null;
    }

    if (!privateKey && privateKeyPath) {
      // Try to load private key from file
      try {
        if (fs.existsSync(privateKeyPath)) {
          privateKey = fs.readFileSync(privateKeyPath, 'utf8');
        } else {
          console.warn(`⚠️  Private key file not found: ${privateKeyPath}`);
          return null;
        }
      } catch (error) {
        console.error(`❌ Failed to read private key file: ${privateKeyPath}`, error);
        return null;
      }
    }

    if (!privateKey) {
      console.warn('⚠️  GITHUB_APP_PRIVATE_KEY or GITHUB_APP_PRIVATE_KEY_PATH not found');
      return null;
    }

    if (!clientId || !clientSecret) {
      console.warn('⚠️  GITHUB_APP_CLIENT_ID or GITHUB_APP_CLIENT_SECRET not found');
      // These are optional for some use cases, so we'll continue
    }

    return {
      appId,
      privateKey,
      clientId: clientId || '',
      clientSecret: clientSecret || '',
      webhookSecret,
    };
  } catch (error) {
    console.error('❌ Failed to load GitHub App configuration:', error);
    return null;
  }
}
