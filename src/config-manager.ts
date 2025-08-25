import * as fs from 'fs';
import * as path from 'path';
import { GitHubAppAuth, GitHubAppConfig, loadGitHubAppConfig } from './github-app-auth';

interface SystemConfig {
  githubApp: GitHubAppConfig | null;
  geminiApiKey: string;
  model: string;
  maxFiles: number;
  maxLinesPerFile: number;
}

export class ConfigManager {
  private envPath: string;
  private config: SystemConfig;
  private githubAuth: GitHubAppAuth | null = null;

  constructor(envPath: string = '.env') {
    this.envPath = path.resolve(envPath);
    this.config = {
      githubApp: null,
      geminiApiKey: '',
      model: 'gemini-2.5-flash',
      maxFiles: 40,
      maxLinesPerFile: 1500,
    };
    this.loadConfig();
  }

  private loadConfig(): void {
    // Load GitHub App configuration
    const githubAppConfig = loadGitHubAppConfig();
    
    // Initialize GitHub App authentication if config is available
    if (githubAppConfig) {
      try {
        this.githubAuth = new GitHubAppAuth(githubAppConfig);
        console.log('✅ GitHub App authentication loaded');
      } catch (error) {
        console.error('❌ Failed to initialize GitHub App authentication:', error);
        this.githubAuth = null;
      }
    }

    // Load from environment variables (set by dotenv or manually)
    this.config = {
      githubApp: githubAppConfig,
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      maxFiles: parseInt(process.env.MAX_FILES || '40'),
      maxLinesPerFile: parseInt(process.env.MAX_LINES_PER_FILE || '1500'),
    };
  }

  private updateEnvFile(key: string, value: string): void {
    try {
      let envContent = '';
      
      // Read existing .env file
      if (fs.existsSync(this.envPath)) {
        envContent = fs.readFileSync(this.envPath, 'utf8');
      }

      // Update or add the key
      const lines = envContent.split('\n');
      let keyFound = false;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith(`${key}=`)) {
          lines[i] = `${key}=${value}`;
          keyFound = true;
          break;
        }
      }

      // If key not found, add it
      if (!keyFound) {
        lines.push(`${key}=${value}`);
      }

      // Write back to file
      fs.writeFileSync(this.envPath, lines.join('\n'));
      
      // Update process.env
      process.env[key] = value;
      
      console.log(`✅ Updated ${key} in environment`);
    } catch (error) {
      console.error(`❌ Failed to update ${key}:`, error);
      throw error;
    }
  }

  async updateGitHubApp(appConfig: GitHubAppConfig): Promise<{ success: boolean; error?: string; appInfo?: any }> {
    try {
      // Test the GitHub App configuration
      const githubAuth = new GitHubAppAuth(appConfig);
      const validation = await githubAuth.testConfiguration();
      
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // Update environment variables
      this.updateEnvFile('GITHUB_APP_ID', appConfig.appId);
      this.updateEnvFile('GITHUB_APP_PRIVATE_KEY', appConfig.privateKey);
      this.updateEnvFile('GITHUB_APP_CLIENT_ID', appConfig.clientId);
      this.updateEnvFile('GITHUB_APP_CLIENT_SECRET', appConfig.clientSecret);
      this.updateEnvFile('GITHUB_APP_WEBHOOK_SECRET', appConfig.webhookSecret);

      // Update config and auth instance
      this.config.githubApp = appConfig;
      this.githubAuth = githubAuth;

      return { 
        success: true,
        appInfo: validation.appInfo
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  }

  async validateGitHubApp(appConfig: GitHubAppConfig): Promise<{ valid: boolean; error?: string; appInfo?: any }> {
    try {
      const githubAuth = new GitHubAppAuth(appConfig);
      return await githubAuth.testConfiguration();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { valid: false, error: errorMessage };
    }
  }

  updateGeminiApiKey(newKey: string): void {
    this.updateEnvFile('GEMINI_API_KEY', newKey);
    this.config.geminiApiKey = newKey;
  }

  updateModel(newModel: string): void {
    this.updateEnvFile('GEMINI_MODEL', newModel);
    this.config.model = newModel;
  }

  updateMaxFiles(maxFiles: number): void {
    this.updateEnvFile('MAX_FILES', maxFiles.toString());
    this.config.maxFiles = maxFiles;
  }

  updateMaxLinesPerFile(maxLines: number): void {
    this.updateEnvFile('MAX_LINES_PER_FILE', maxLines.toString());
    this.config.maxLinesPerFile = maxLines;
  }

  getConfig(): SystemConfig {
    return { ...this.config };
  }

  getGitHubAuth(): GitHubAppAuth | null {
    return this.githubAuth;
  }

  getGitHubAppConfig(): GitHubAppConfig | null {
    return this.config.githubApp;
  }

  getGeminiApiKey(): string {
    return this.config.geminiApiKey;
  }

  hasValidCredentials(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    if (!this.config.githubApp) missing.push('GitHub App Configuration');
    if (!this.config.geminiApiKey) missing.push('GEMINI_API_KEY');
    
    return {
      valid: missing.length === 0,
      missing
    };
  }

  async testConfiguration(): Promise<{ 
    github: { valid: boolean; error?: string; appInfo?: any };
    gemini: { valid: boolean; error?: string };
  }> {
    const result: { 
      github: { valid: boolean; error?: string; appInfo?: any };
      gemini: { valid: boolean; error?: string };
    } = {
      github: { valid: false, error: 'Not tested' },
      gemini: { valid: false, error: 'Not tested' }
    };

    // Test GitHub App
    if (this.githubAuth) {
      const githubTest = await this.githubAuth.testConfiguration();
      result.github = {
        valid: githubTest.valid,
        error: githubTest.error,
        appInfo: githubTest.appInfo
      };
    } else {
      result.github = { valid: false, error: 'No GitHub App configured' };
    }

    // Test Gemini API key (simple check)
    if (this.config.geminiApiKey) {
      result.gemini = { valid: true };
    } else {
      result.gemini = { valid: false, error: 'No Gemini API key configured' };
    }

    return result;
  }
}

// Export singleton instance
export const configManager = new ConfigManager();
