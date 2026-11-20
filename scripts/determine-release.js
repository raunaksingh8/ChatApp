import { execSync } from 'child_process';

/**
 * Analyzes a single commit message according to Conventional Commits:
 * - BREAKING CHANGE: or type! -> 'major'
 * - feat: -> 'minor'
 * - fix: -> 'patch'
 * - docs:, style:, refactor:, test:, chore:, etc. -> 'none'
 */
export function analyzeCommit(msg) {
  if (!msg || typeof msg !== 'string') return 'none';
  const trimmed = msg.trim();

  // 1. Check for explicit breaking changes:
  // - "BREAKING CHANGE:" or "BREAKING CHANGES:" anywhere in commit
  // - Type with '!' before colon: e.g. "feat!:", "fix(core)!:", "refactor!:"
  // - Explicit [release:major] flag
  if (
    /BREAKING[- ]CHANGE[S]?:/i.test(trimmed) ||
    /^[a-z]+(\([^\)]+\))?!:/i.test(trimmed) ||
    /\[release:major\]/i.test(trimmed)
  ) {
    return 'major';
  }

  // 2. Check for new features -> minor
  if (
    /^feat(\([^\)]+\))?:/i.test(trimmed) ||
    /\[release:minor\]/i.test(trimmed)
  ) {
    return 'minor';
  }

  // 3. Check for bug fixes -> patch
  if (
    /^fix(\([^\)]+\))?:/i.test(trimmed) ||
    /\[release:patch\]/i.test(trimmed)
  ) {
    return 'patch';
  }

  // 4. Other types (docs, style, refactor, perf, test, build, ci, chore) -> no release by default
  return 'none';
}

/**
 * Determines highest required bump type across an array of commit messages.
 * Priority: major > minor > patch > none
 */
export function determineBumpType(commitMessages = []) {
  const rank = { none: 0, patch: 1, minor: 2, major: 3 };
  let highest = 'none';

  for (const msg of commitMessages) {
    const type = analyzeCommit(msg);
    if (rank[type] > rank[highest]) {
      highest = type;
    }
  }

  return highest;
}

// When executed directly from CLI or GitHub Actions:
// Usage 1: node scripts/determine-release.js <before_sha> <after_sha>
// Usage 2: node scripts/determine-release.js "commit message string"
if (process.argv[1] && process.argv[1].endsWith('determine-release.js')) {
  const arg1 = process.argv[2];
  const arg2 = process.argv[3];
  let messages = [];

  if (arg1 && arg2 && !arg1.includes('\n')) {
    // Git range provided
    try {
      const gitLog = execSync(`git log ${arg1}..${arg2} --pretty=format:"%B---COMMIT_SPLIT---"`).toString();
      messages = gitLog.split('---COMMIT_SPLIT---').map((s) => s.trim()).filter(Boolean);
    } catch {
      messages = [];
    }
  } else if (arg1) {
    messages = [arg1];
  } else {
    // Default to last commit on current HEAD
    try {
      const lastCommit = execSync('git log -n 1 --pretty=format:"%B"').toString().trim();
      messages = [lastCommit];
    } catch {
      messages = [];
    }
  }

  const result = determineBumpType(messages);
  console.log(result);
}
