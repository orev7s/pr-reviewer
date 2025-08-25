import { Octokit } from '@octokit/rest';
import axios from 'axios';
import { GitHubAppAuth } from './github-app-auth';

interface ReviewComment {
  path: string;
  line: number;
  severity: 'info' | 'warning' | 'error';
  message: string;
  suggestion?: string;
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      parts: Array<{
        text: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    message: string;
    code: number;
  };
  promptFeedback?: {
    blockReason?: string;
  };
}

export interface Config {
  githubAuth: GitHubAppAuth;
  geminiApiKey: string;
  model: string;
  maxFiles: number;
  maxLinesPerFile: number;
}

export class PullRequestReviewer {
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  private async getOctokitForRepository(owner: string, repo: string): Promise<Octokit | null> {
    return await this.config.githubAuth.getRepositoryOctokit(owner, repo);
  }

  async reviewPullRequest(owner: string, repo: string, prNumber: number): Promise<void> {
    try {
      console.log(`🤖 Starting AI review for PR #${prNumber} in ${owner}/${repo}`);

      // Get authenticated Octokit instance for this repository
      const octokit = await this.getOctokitForRepository(owner, repo);
      if (!octokit) {
        console.error(`❌ No GitHub App installation found for ${owner}/${repo}`);
        return;
      }

      // Get PR details
      const { data: pullRequest } = await octokit.rest.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      // Check if PR is draft or already merged
      if (pullRequest.draft) {
        console.log(`⏸️  Skipping draft PR #${prNumber}`);
        return;
      }

      if (pullRequest.state !== 'open') {
        console.log(`⏸️  Skipping closed PR #${prNumber}`);
        return;
      }

      // Get changed files
      const { data: files } = await octokit.rest.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
      });

      if (files.length === 0) {
        console.log(`📝 No files changed in PR #${prNumber}`);
        return;
      }

      // Filter and limit files
      const reviewableFiles = files
        .filter(file => this.isReviewableFile(file))
        .slice(0, this.config.maxFiles);

      if (reviewableFiles.length === 0) {
        console.log(`📝 No reviewable files found in PR #${prNumber}`);
        return;
      }

      console.log(`📂 Reviewing ${reviewableFiles.length} files`);

      // Get existing review comments to avoid duplicates
      const existingComments = await this.getExistingComments(octokit, owner, repo, prNumber);

      // Review each file
      const allComments: ReviewComment[] = [];
      
      for (const file of reviewableFiles) {
        if (file.patch) {
          console.log(`🔍 Analyzing ${file.filename}...`);
          const comments = await this.reviewFile(file, pullRequest);
          allComments.push(...comments);
        }
      }

      // Filter out duplicate comments
      const newComments = this.filterDuplicateComments(allComments, existingComments);

      if (newComments.length === 0) {
        console.log(`✅ No new issues found in PR #${prNumber}`);
        return;
      }

      // Post review comments
      await this.postReviewComments(octokit, owner, repo, prNumber, newComments);

      console.log(`💬 Posted ${newComments.length} review comments for PR #${prNumber}`);

    } catch (error) {
      console.error(`❌ Failed to review PR #${prNumber}:`, error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private isReviewableFile(file: any): boolean {
    // Skip deleted files
    if (file.status === 'removed') return false;
    
    // Skip large files
    if (file.changes > this.config.maxLinesPerFile) return false;

    // Skip binary files and common non-code files
    const nonReviewableExtensions = [
      '.min.js', '.map', '.lock', '.svg', '.png', '.jpg', '.jpeg', '.gif', 
      '.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib'
    ];
    
    const filename = file.filename.toLowerCase();
    if (nonReviewableExtensions.some(ext => filename.endsWith(ext))) {
      return false;
    }

    return true;
  }

  private async reviewFile(file: any, pullRequest: any): Promise<ReviewComment[]> {
    try {
      // Check if file is very large and might need chunking
      const diffLength = file.patch?.length || 0;
      const maxSingleRequestLength = 3000; // Conservative limit for single request
      
      if (diffLength > maxSingleRequestLength && file.additions > 50) {
        console.log(`📄 Large file detected (${diffLength} chars), processing in chunks: ${file.filename}`);
        return await this.reviewLargeFile(file, pullRequest);
      } else {
        const prompt = this.buildPrompt(file, pullRequest);
        const response = await this.callGemini(prompt);
        return this.parseGeminiResponse(response, file.filename);
      }
    } catch (error) {
      console.warn(`⚠️  Failed to review file ${file.filename}:`, error);
      return [];
    }
  }

  private async reviewLargeFile(file: any, pullRequest: any): Promise<ReviewComment[]> {
    try {
      const allComments: ReviewComment[] = [];
      const diffLines = file.patch.split('\n');
      const hunks = this.splitIntoHunks(diffLines);
      
      console.log(`📄 Processing ${hunks.length} chunks for ${file.filename}`);
      
      for (let i = 0; i < hunks.length; i++) {
        const hunk = hunks[i];
        const hunkFile = {
          ...file,
          patch: hunk.content,
          additions: hunk.additions,
          deletions: hunk.deletions
        };
        
        try {
          const prompt = this.buildPrompt(hunkFile, pullRequest);
          const response = await this.callGemini(prompt);
          const comments = this.parseGeminiResponse(response, `${file.filename}[${i+1}/${hunks.length}]`);
          allComments.push(...comments);
          
          // Add delay between chunks to respect rate limits
          if (i < hunks.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (chunkError) {
          console.warn(`⚠️  Failed to review chunk ${i+1} of ${file.filename}:`, chunkError);
        }
      }
      
      console.log(`✅ Completed chunked review of ${file.filename}: ${allComments.length} issues found`);
      return allComments;
    } catch (error) {
      console.warn(`⚠️  Failed to review large file ${file.filename}:`, error);
      return [];
    }
  }

  private splitIntoHunks(diffLines: string[]): Array<{content: string, additions: number, deletions: number}> {
    const hunks = [];
    let currentHunk: string[] = [];
    let currentAdditions = 0;
    let currentDeletions = 0;
    let headerLines: string[] = [];
    
    // Capture file headers
    for (let i = 0; i < diffLines.length && i < 10; i++) {
      if (diffLines[i].startsWith('@@')) break;
      headerLines.push(diffLines[i]);
    }
    
    for (const line of diffLines) {
      if (line.startsWith('@@')) {
        // Start of new hunk - save previous if exists
        if (currentHunk.length > 0) {
          hunks.push({
            content: [...headerLines, ...currentHunk].join('\n'),
            additions: currentAdditions,
            deletions: currentDeletions
          });
        }
        
        // Reset for new hunk
        currentHunk = [line];
        currentAdditions = 0;
        currentDeletions = 0;
      } else {
        currentHunk.push(line);
        
        if (line.startsWith('+') && !line.startsWith('+++')) {
          currentAdditions++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          currentDeletions++;
        }
        
        // If hunk gets too large, split it
        if (currentHunk.length > 100) {
          hunks.push({
            content: [...headerLines, ...currentHunk].join('\n'),
            additions: currentAdditions,
            deletions: currentDeletions
          });
          currentHunk = [];
          currentAdditions = 0;
          currentDeletions = 0;
        }
      }
    }
    
    // Add final hunk if exists
    if (currentHunk.length > 0) {
      hunks.push({
        content: [...headerLines, ...currentHunk].join('\n'),
        additions: currentAdditions,
        deletions: currentDeletions
      });
    }
    
    return hunks.length > 0 ? hunks : [{
      content: diffLines.join('\n'),
      additions: 0,
      deletions: 0
    }];
  }

  private buildPrompt(file: any, pullRequest: any): string {
    const systemPrompt = `Code security reviewer. Find critical bugs, security vulnerabilities, performance issues. Return ONLY valid JSON array.

Format: [{"path":"file.ts","line":1,"severity":"error|warning|info","message":"brief issue","suggestion":"concise fix"}]

Focus on: SQL injection, XSS, hardcoded secrets, command injection, path traversal, prototype pollution, insecure crypto.
Rules: Only significant issues, prioritize security/errors over style, use + line numbers, return [] if clean.`;

    // Intelligently truncate the diff while preserving structure
    let diff = file.patch;
    const maxDiffLength = this.calculateMaxDiffLength(file);
    
    if (diff.length > maxDiffLength) {
      // Try to keep complete hunks rather than cutting mid-line
      const lines = diff.split('\n');
      let truncatedLines = [];
      let currentLength = 0;
      
      for (const line of lines) {
        if (currentLength + line.length > maxDiffLength) {
          truncatedLines.push('... (content truncated for brevity)');
          break;
        }
        truncatedLines.push(line);
        currentLength += line.length + 1; // +1 for newline
      }
      
      diff = truncatedLines.join('\n');
    }

    const userPrompt = `File: ${file.filename} (+${file.additions}/-${file.deletions})

${diff}

JSON only:`;

    return `${systemPrompt}\n\n${userPrompt}`;
  }

  private calculateMaxDiffLength(file: any): number {
    // Base length, but increase for larger files that might have more complex issues
    const baseLength = 1500;
    const additions = file.additions || 0;
    
    // Allow more content for files with many changes, but cap it
    const extraLength = Math.min(additions * 10, 1000);
    return baseLength + extraLength;
  }

  private async callGemini(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.config.model}:generateContent?key=${this.config.geminiApiKey}`;
    
    try {
      const response = await axios.post<GeminiResponse>(url, {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          topK: 1,
          topP: 1,
          maxOutputTokens: 8192, // Increased from 4096
        },
        safetySettings: [
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH", 
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_NONE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_NONE"
          }
        ]
      }, {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        }
      });

      // Debug logging
      console.debug('Gemini API Response:', JSON.stringify(response.data, null, 2));

      // Check for error response
      if (response.data.error) {
        throw new Error(`Gemini API Error: ${response.data.error.message || 'Unknown error'}`);
      }

      // Check for safety blocks
      if (response.data.promptFeedback?.blockReason) {
        throw new Error(`Gemini API Safety Block: ${response.data.promptFeedback.blockReason}`);
      }

      // Check for candidates
      if (!response.data.candidates || response.data.candidates.length === 0) {
        throw new Error('No candidates returned from Gemini API');
      }

      const candidate = response.data.candidates[0];
      
      // Check for finish reason
      if (candidate.finishReason && candidate.finishReason !== 'STOP') {
        console.warn(`Gemini API finish reason: ${candidate.finishReason}`);
        
        // If we hit token limits, log warning but continue to try parsing partial response
        if (candidate.finishReason === 'MAX_TOKENS') {
          console.warn('⚠️  Response was truncated due to token limit, attempting to parse partial results...');
        }
      }

      // Check for content
      if (!candidate.content?.parts || candidate.content.parts.length === 0) {
        throw new Error('No content parts returned from Gemini API');
      }

      const text = candidate.content.parts[0]?.text;
      if (!text) {
        throw new Error('No text content returned from Gemini API');
      }

      return text;

    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response) {
          console.error('Gemini API HTTP Error:', error.response.status, error.response.data);
          throw new Error(`Gemini API HTTP ${error.response.status}: ${JSON.stringify(error.response.data)}`);
        } else if (error.request) {
          throw new Error('Gemini API request failed - no response received');
        }
      }
      throw error;
    }
  }

  private parseGeminiResponse(response: string, filename: string): ReviewComment[] {
    try {
      console.debug(`Raw Gemini response for ${filename}:`, response);

      // Try to parse the entire response as JSON first
      let jsonData;
      try {
        jsonData = JSON.parse(response.trim());
        if (Array.isArray(jsonData)) {
          console.debug(`Successfully parsed JSON array for ${filename}`);
        } else {
          throw new Error('Response is not a JSON array');
        }
      } catch (parseError) {
        // If direct parsing fails, try to extract and repair JSON from the response
        console.debug(`Direct JSON parsing failed for ${filename}, trying to extract and repair JSON`);
        
        // Look for JSON array pattern (more flexible)
        let jsonMatch = response.match(/\[[\s\S]*\]/);
        
        if (!jsonMatch) {
          // Try to find incomplete JSON and repair it
          const arrayStart = response.indexOf('[');
          if (arrayStart !== -1) {
            let jsonString = response.substring(arrayStart);
            
            // Try to fix incomplete JSON by closing arrays/objects
            jsonString = this.repairIncompleteJson(jsonString);
            
            try {
              jsonData = JSON.parse(jsonString);
              console.debug(`Successfully repaired and parsed truncated JSON for ${filename}`);
            } catch (repairError) {
              console.warn(`Failed to repair JSON for ${filename}:`, repairError);
              return [];
            }
          } else {
            console.debug(`No JSON array found in Gemini response for ${filename}`);
            return [];
          }
        } else {
          try {
            jsonData = JSON.parse(jsonMatch[0]);
          } catch (extractError) {
            // Try to repair the extracted JSON
            const repairedJson = this.repairIncompleteJson(jsonMatch[0]);
            try {
              jsonData = JSON.parse(repairedJson);
              console.debug(`Successfully repaired extracted JSON for ${filename}`);
            } catch (finalError) {
              console.warn(`Failed to extract and parse JSON for ${filename}:`, finalError);
              return [];
            }
          }
        }
      }

      // Validate that we have an array
      if (!Array.isArray(jsonData)) {
        console.warn(`Response is not an array for ${filename}`);
        return [];
      }

      const comments = jsonData as ReviewComment[];
      
      // Validate and filter comments
      const validComments = comments.filter(comment => {
        if (!comment.path || !comment.message || !comment.line || !comment.severity) {
          console.warn(`Invalid comment structure for ${filename}:`, comment);
          return false;
        }
        
        // Validate severity
        if (!['error', 'warning', 'info'].includes(comment.severity)) {
          console.warn(`Invalid severity for ${filename}: ${comment.severity}`);
          return false;
        }
        
        // Validate line number
        if (typeof comment.line !== 'number' || comment.line <= 0) {
          console.warn(`Invalid line number for ${filename}: ${comment.line}`);
          return false;
        }
        
        return true;
      });

      console.debug(`Parsed ${validComments.length} valid comments for ${filename}`);
      return validComments;

    } catch (error) {
      console.warn(`Failed to parse Gemini response for ${filename}:`, error);
      return [];
    }
  }

  private repairIncompleteJson(jsonString: string): string {
    try {
      // Remove any trailing incomplete text after the last complete object
      let repairedJson = jsonString.trim();
      
      // Count brackets to balance them
      let openBrackets = 0;
      let openBraces = 0;
      let inString = false;
      let escaped = false;
      let lastCompleteObjectIndex = -1;
      
      for (let i = 0; i < repairedJson.length; i++) {
        const char = repairedJson[i];
        
        if (escaped) {
          escaped = false;
          continue;
        }
        
        if (char === '\\') {
          escaped = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '[') openBrackets++;
          else if (char === ']') openBrackets--;
          else if (char === '{') openBraces++;
          else if (char === '}') {
            openBraces--;
            // If we've closed an object and we're at the top level, mark this as a potential cut point
            if (openBraces === 0 && openBrackets === 1) {
              lastCompleteObjectIndex = i;
            }
          }
        }
      }
      
      // If we have unclosed objects and found a complete object boundary, cut there
      if ((openBraces > 0 || openBrackets > 1) && lastCompleteObjectIndex > -1) {
        repairedJson = repairedJson.substring(0, lastCompleteObjectIndex + 1);
        console.debug('Truncated to last complete object');
      }
      
      // Balance the brackets and braces
      while (openBraces > 0) {
        repairedJson += '}';
        openBraces--;
      }
      
      while (openBrackets > 0) {
        repairedJson += ']';
        openBrackets--;
      }
      
      return repairedJson;
    } catch (error) {
      console.warn('Failed to repair JSON:', error);
      return jsonString; // Return original if repair fails
    }
  }

  private async getExistingComments(octokit: Octokit, owner: string, repo: string, prNumber: number): Promise<Set<string>> {
    try {
      const { data: reviews } = await octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: prNumber,
      });

      const commentKeys = new Set<string>();

      for (const review of reviews) {
        if (review.body?.includes('🤖 AI CODE REVIEW 🤖') || review.body?.includes('Generated by Gemini AI')) {
          const { data: comments } = await octokit.rest.pulls.listCommentsForReview({
            owner,
            repo,
            pull_number: prNumber,
            review_id: review.id,
          });

          for (const comment of comments) {
            if (comment.path && comment.line) {
              commentKeys.add(`${comment.path}:${comment.line}`);
            }
          }
        }
      }

      return commentKeys;
    } catch (error) {
      console.warn(`Failed to get existing comments:`, error);
      return new Set();
    }
  }

  private filterDuplicateComments(comments: ReviewComment[], existing: Set<string>): ReviewComment[] {
    return comments.filter(comment => {
      const key = `${comment.path}:${comment.line}`;
      return !existing.has(key);
    });
  }

  private async postReviewComments(
    octokit: Octokit,
    owner: string,
    repo: string,
    prNumber: number,
    comments: ReviewComment[]
  ): Promise<void> {
    if (comments.length === 0) return;

    // Group comments by severity for summary
    const errorCount = comments.filter(c => c.severity === 'error').length;
    const warningCount = comments.filter(c => c.severity === 'warning').length;
    const infoCount = comments.filter(c => c.severity === 'info').length;

    // Create review with comments
    const reviewComments = comments.map(comment => ({
      path: comment.path,
      line: comment.line,
      body: this.formatCommentBody(comment),
    }));

    const reviewState = 'COMMENT'; // Always comment, never request changes
    
    const summaryBody = this.buildSummaryComment(errorCount, warningCount, infoCount);

    await octokit.rest.pulls.createReview({
      owner,
      repo,
      pull_number: prNumber,
      body: summaryBody,
      event: reviewState,
      comments: reviewComments,
    });
  }

  private formatCommentBody(comment: ReviewComment): string {
    const severityEmoji = {
      error: '🔴',
      warning: '🟡', 
      info: '🔵'
    };

    let body = `🤖 **AI CODE REVIEW** 🤖\n\n${severityEmoji[comment.severity]} **${comment.severity.toUpperCase()}**: ${comment.message}`;

    if (comment.suggestion) {
      body += '\n\n**🔧 AI Suggested fix:**\n```suggestion\n' + comment.suggestion + '\n```';
    }

    body += '\n\n---\n🤖 *This comment was automatically generated by Gemini AI* 🤖\n*Self-hosted PR Reviewer - Not a human review*';

    return body;
  }

  private buildSummaryComment(errors: number, warnings: number, info: number): string {
    const total = errors + warnings + info;
    
    if (total === 0) {
      return '🤖 **AI CODE REVIEW COMPLETE** 🤖\n\n✅ No issues found in this pull request.\n\n---\n🤖 *Automatically generated by Self-hosted Gemini AI Reviewer*';
    }

    let summary = '🤖 **AI CODE REVIEW SUMMARY** 🤖\n\n';
    
    if (errors > 0) {
      summary += `🔴 **${errors}** error(s) found\n`;
    }
    if (warnings > 0) {
      summary += `🟡 **${warnings}** warning(s) found\n`;
    }
    if (info > 0) {
      summary += `🔵 **${info}** info item(s) found\n`;
    }

    summary += '\nPlease review the inline AI-generated comments for detailed feedback.';
    
    if (errors > 0) {
      summary += '\n\n⚠️ **This PR has critical issues that should be addressed before merging.**';
    }

    summary += '\n\n---\n🤖 *Automatically generated by Self-hosted Gemini AI Reviewer*';

    return summary;
  }
}
