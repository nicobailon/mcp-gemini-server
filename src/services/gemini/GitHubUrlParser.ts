/**
 * Parser for GitHub URLs to extract repository, branch, PR, and issue information.
 * Supports various GitHub URL formats including repository, branch, PR, PR files, and issue URLs.
 */
export class GitHubUrlParser {
  /**
   * Repository URL format
   * Example: https://github.com/bsmi021/mcp-gemini-server
   */
  private static repoUrlPattern =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/;

  /**
   * Branch URL format
   * Example: https://github.com/bsmi021/mcp-gemini-server/tree/feature/add-reasoning-effort-option
   */
  private static branchUrlPattern =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+(?:\/[^/]+)*)\/?$/;

  /**
   * Pull request URL format
   * Example: https://github.com/bsmi021/mcp-gemini-server/pull/2
   */
  private static prUrlPattern =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/;

  /**
   * Pull request files URL format
   * Example: https://github.com/bsmi021/mcp-gemini-server/pull/2/files
   */
  private static prFilesUrlPattern =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/files\/?$/;

  /**
   * Issue URL format
   * Example: https://github.com/bsmi021/mcp-gemini-server/issues/5
   */
  private static issueUrlPattern =
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)\/?$/;

  /**
   * Parse a GitHub URL to extract repository, branch, PR, or issue information
   *
   * @param url GitHub URL to parse
   * @returns Object with parsed URL components or null if the URL is not a valid GitHub URL
   */
  public static parse(url: string): ParsedGitHubUrl | null {
    // Try matching repository URL
    let match = url.match(this.repoUrlPattern);
    if (match) {
      return {
        type: "repository",
        owner: match[1],
        repo: match[2],
      };
    }

    // Try matching branch URL
    match = url.match(this.branchUrlPattern);
    if (match) {
      return {
        type: "branch",
        owner: match[1],
        repo: match[2],
        branch: match[3],
      };
    }

    // Try matching PR files URL first (more specific)
    match = url.match(this.prFilesUrlPattern);
    if (match) {
      return {
        type: "pr_files",
        owner: match[1],
        repo: match[2],
        prNumber: match[3],
        filesView: true,
      };
    }

    // Try matching PR URL
    match = url.match(this.prUrlPattern);
    if (match) {
      return {
        type: "pull_request",
        owner: match[1],
        repo: match[2],
        prNumber: match[3],
      };
    }

    // Try matching issue URL
    match = url.match(this.issueUrlPattern);
    if (match) {
      return {
        type: "issue",
        owner: match[1],
        repo: match[2],
        issueNumber: match[3],
      };
    }

    // Not a recognized GitHub URL format
    return null;
  }

  /**
   * Validate if a URL is a recognized GitHub URL
   *
   * @param url URL to validate
   * @returns True if the URL is a valid GitHub URL, false otherwise
   */
  public static isValidGitHubUrl(url: string): boolean {
    return this.parse(url) !== null;
  }

  /**
   * Get the API endpoint for the GitHub URL
   *
   * @param url GitHub URL
   * @returns API endpoint for the URL or null if not a valid GitHub URL
   */
  public static getApiEndpoint(url: string): string | null {
    const parsed = this.parse(url);
    if (!parsed) {
      return null;
    }

    const { owner, repo } = parsed;

    switch (parsed.type) {
      case "repository":
        return `repos/${owner}/${repo}`;
      case "branch":
        return `repos/${owner}/${repo}/branches/${encodeURIComponent(parsed.branch!)}`;
      case "pull_request":
      case "pr_files":
        return `repos/${owner}/${repo}/pulls/${parsed.prNumber}`;
      case "issue":
        return `repos/${owner}/${repo}/issues/${parsed.issueNumber}`;
      default:
        return null;
    }
  }

  /**
   * Extract repository information from a GitHub URL
   *
   * @param url GitHub URL
   * @returns Object with owner and repo name or null if not a valid GitHub URL
   */
  public static getRepositoryInfo(
    url: string
  ): { owner: string; repo: string } | null {
    const parsed = this.parse(url);
    if (!parsed) {
      return null;
    }

    return {
      owner: parsed.owner,
      repo: parsed.repo,
    };
  }

  /**
   * Extract pull request information from a GitHub PR URL
   *
   * @param url GitHub PR URL
   * @returns Object with owner, repo, and PR number or null if not a valid GitHub PR URL
   */
  public static getPullRequestInfo(
    url: string
  ): { owner: string; repo: string; prNumber: number } | null {
    const parsed = this.parse(url);
    if (
      !parsed ||
      (parsed.type !== "pull_request" && parsed.type !== "pr_files")
    ) {
      return null;
    }

    const prNumber = parseInt(parsed.prNumber!, 10);
    if (isNaN(prNumber) || prNumber <= 0) {
      return null;
    }

    return {
      owner: parsed.owner,
      repo: parsed.repo,
      prNumber,
    };
  }
}

/**
 * Interface for parsed GitHub URL components
 */
export interface ParsedGitHubUrl {
  type: "repository" | "branch" | "pull_request" | "pr_files" | "issue";
  owner: string;
  repo: string;
  branch?: string;
  prNumber?: string;
  issueNumber?: string;
  filesView?: boolean;
}
