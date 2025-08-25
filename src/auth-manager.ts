import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface User {
  id: string;
  username: string;
  repositories: string[];
  createdAt: string;
  lastActivity: string;
}

interface AuthData {
  adminPassword: string;
  users: { [userId: string]: User };
  sessions: { [sessionId: string]: { userId: string; expiresAt: string } };
}

export class AuthManager {
  private authDataPath: string;
  private authData: AuthData = { adminPassword: '', users: {}, sessions: {} };

  constructor(dataPath: string = './auth-data.json') {
    this.authDataPath = path.resolve(dataPath);
    this.initializeAuthData();
  }

  private initializeAuthData(): void {
    try {
      if (fs.existsSync(this.authDataPath)) {
        const data = fs.readFileSync(this.authDataPath, 'utf8');
        this.authData = JSON.parse(data);
        console.log('✅ Loaded existing auth data');
      } else {
        // Generate new auth data on first run
        this.authData = {
          adminPassword: this.generatePassword(),
          users: {},
          sessions: {}
        };
        this.saveAuthData();
        console.log(`✅ Generated new admin password: ${this.authData.adminPassword}`);
        console.log('Share this password with users who need access.');
      }

      // Clean expired sessions on startup
      this.cleanExpiredSessions();
    } catch (error) {
      console.error('❌ Failed to initialize auth data:', error);
      throw error;
    }
  }

  private generatePassword(length: number = 12): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < length; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }

  private saveAuthData(): void {
    try {
      fs.writeFileSync(this.authDataPath, JSON.stringify(this.authData, null, 2));
    } catch (error) {
      console.error('❌ Failed to save auth data:', error);
      throw error;
    }
  }

  private cleanExpiredSessions(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [sessionId, session] of Object.entries(this.authData.sessions)) {
      if (new Date(session.expiresAt) < now) {
        delete this.authData.sessions[sessionId];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.saveAuthData();
      console.log(`🧹 Cleaned ${cleaned} expired sessions`);
    }
  }

  // Authentication methods
  async authenticate(password: string, userId: string, username: string): Promise<string | null> {
    if (password !== this.authData.adminPassword) {
      return null;
    }

    // Create or update user
    if (!this.authData.users[userId]) {
      this.authData.users[userId] = {
        id: userId,
        username,
        repositories: [],
        createdAt: new Date().toISOString(),
        lastActivity: new Date().toISOString()
      };
    } else {
      this.authData.users[userId].lastActivity = new Date().toISOString();
      this.authData.users[userId].username = username; // Update username if changed
    }

    // Create session (expires in 30 days)
    const sessionId = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    this.authData.sessions[sessionId] = {
      userId,
      expiresAt: expiresAt.toISOString()
    };

    this.saveAuthData();
    return sessionId;
  }

  async validateSession(sessionId: string): Promise<User | null> {
    const session = this.authData.sessions[sessionId];
    if (!session) {
      return null;
    }

    if (new Date(session.expiresAt) < new Date()) {
      delete this.authData.sessions[sessionId];
      this.saveAuthData();
      return null;
    }

    const user = this.authData.users[session.userId];
    if (user) {
      user.lastActivity = new Date().toISOString();
      this.saveAuthData();
    }

    return user || null;
  }

  async logout(sessionId: string): Promise<void> {
    if (this.authData.sessions[sessionId]) {
      delete this.authData.sessions[sessionId];
      this.saveAuthData();
    }
  }

  // User management methods
  async addRepository(userId: string, repository: string): Promise<boolean> {
    const user = this.authData.users[userId];
    if (!user) {
      return false;
    }

    if (!this.isValidRepositoryFormat(repository)) {
      return false;
    }

    if (!user.repositories.includes(repository)) {
      user.repositories.push(repository);
      user.lastActivity = new Date().toISOString();
      this.saveAuthData();
    }

    return true;
  }

  async removeRepository(userId: string, repository: string): Promise<boolean> {
    const user = this.authData.users[userId];
    if (!user) {
      return false;
    }

    const index = user.repositories.indexOf(repository);
    if (index !== -1) {
      user.repositories.splice(index, 1);
      user.lastActivity = new Date().toISOString();
      this.saveAuthData();
      return true;
    }

    return false;
  }

  async getUserRepositories(userId: string): Promise<string[]> {
    const user = this.authData.users[userId];
    return user ? [...user.repositories] : [];
  }

  async getAllRepositories(): Promise<string[]> {
    const allRepos = new Set<string>();
    
    for (const user of Object.values(this.authData.users)) {
      user.repositories.forEach(repo => allRepos.add(repo));
    }

    return Array.from(allRepos);
  }

  // Admin methods
  async resetPassword(): Promise<string> {
    this.authData.adminPassword = this.generatePassword();
    
    // Invalidate all sessions
    this.authData.sessions = {};
    
    this.saveAuthData();
    console.log(`✅ Password reset. New password: ${this.authData.adminPassword}`);
    
    return this.authData.adminPassword;
  }

  async getStats(): Promise<{
    totalUsers: number;
    totalRepositories: number;
    activeSessions: number;
    users: Array<{ username: string; repositories: number; lastActivity: string }>;
  }> {
    const activeSessions = Object.values(this.authData.sessions)
      .filter(session => new Date(session.expiresAt) > new Date()).length;

    const users = Object.values(this.authData.users).map(user => ({
      username: user.username,
      repositories: user.repositories.length,
      lastActivity: user.lastActivity
    }));

    return {
      totalUsers: Object.keys(this.authData.users).length,
      totalRepositories: await this.getAllRepositories().then(repos => repos.length),
      activeSessions,
      users
    };
  }

  getAdminPassword(): string {
    return this.authData.adminPassword;
  }

  private isValidRepositoryFormat(repo: string): boolean {
    return /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo);
  }
}

// Export singleton instance
export const authManager = new AuthManager();
