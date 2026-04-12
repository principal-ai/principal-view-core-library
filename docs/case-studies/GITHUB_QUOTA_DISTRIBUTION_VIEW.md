# Case Study: GitHub Quota Distribution View

A visualization for understanding GitHub API quota consumption across users, identifying who's at risk of hitting limits, and diagnosing why.

## Overview

Web-ADE is a Next.js application that heavily uses the GitHub API for repository visualization, code exploration, and collaboration features. When users authenticate, API calls use **their personal token**, consuming **their rate limit quota** (5,000 requests/hour).

This case study explores how to monitor quota distribution across all users to:
- Identify users approaching rate limits
- Understand what's driving high consumption
- Diagnose caching failures
- Prevent degraded user experiences

## The Problem

### GitHub Rate Limits

| Token Type | Limit | Scope |
|------------|-------|-------|
| User's personal token | 5,000/hour | Per user |
| Server fallback token | 5,000/hour | Shared across unauthenticated |
| Search API | 30/minute | Per token |

### Token Flow in Web-ADE

```typescript
// getGitHubApiToken() - determines whose quota is used
export async function getGitHubApiToken(): Promise<string | null> {
  const userToken = await getGitHubToken();  // From cookie
  if (userToken) {
    return userToken;  // Uses USER's quota
  }
  return process.env.GITHUB_TOKEN ?? null;   // Uses SERVER's quota
}
```

**When a logged-in user makes a request → their token is used → their quota is consumed.**

### What Can Go Wrong

| Scenario | Impact |
|----------|--------|
| User hits rate limit | Their experience degrades, API calls fail |
| Cache miss storm | User rapidly consumes quota on cache failures |
| Heavy repo exploration | Browsing many repos burns through quota |
| Bug causes repeated calls | Same data fetched multiple times |

---

## What We Care About

### Distribution Questions
- How are users distributed by remaining quota?
- Who's in the danger zone (< 20% remaining)?
- What's the typical consumption pattern?

### Diagnostic Questions
- Why is a specific user consuming so much?
- Which operations are eating their quota?
- Which repos are they hitting repeatedly?
- Is caching working for them?

### Temporal Questions
- When did consumption spike?
- Is this a sudden burst or gradual drain?
- Does it correlate with specific actions?

---

## Visualization Design

### Quota Distribution View

```
┌─────────────────────────────────────────────────────────────────────────┐
│  GitHub Quota Distribution                              47 active users │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   USERS AT RISK                            QUOTA DISTRIBUTION           │
│   ┌─────────────────────────────────┐     ┌─────────────────────────┐  │
│   │ ⚠ alice     312 remaining (6%) │     │                    ▂▃▄▅ │  │
│   │ ⚠ bob       487 remaining (10%)│     │              ▂▃▄▅▆█████ │  │
│   │   charlie  2,341 remaining     │     │         ▂▃▄▅████████████ │  │
│   │   diana    4,891 remaining     │     │   0%              50%   100%│
│   └─────────────────────────────────┘     │   ◀── users by % remaining │
│                                           └─────────────────────────┘  │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  WHY IS ALICE AT 6%?                                          [expand] │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │  Calls this hour: 4,688                                             │
│  │                                                                     │
│  │  By operation:                      By repo:                        │
│  │  getTree       ████████████  3,201  vercel/next.js    ████████ 2,847│
│  │  search        ████          892    facebook/react    ███      601  │
│  │  getRepoInfo   ███           412    (12 others)       ██       340  │
│  │  getCommits    ██            183                                    │
│  │                                                                     │
│  │  Cache hit rate: 34%  ⚠ LOW (avg is 89%)                           │
│  │                                                                     │
│  │  Pattern: Repeated getTree on same repo without cache hits          │
│  │  Likely cause: Branch switching? Cache invalidation? Cold start?    │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  CONSUMPTION OVER TIME                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │  alice ━━  bob ━━  others ━━                                        │
│  │  ▁▁▂▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁█▇▆▅▄▃▂▂▂▂▂▂▂▂▂▂▁▁▁▁▁▁▁▁▁▁           │
│  │  ↑ alice's spike 47 min ago                                         │
│  │                                                                     │
│  │  12:00      12:15      12:30      12:45      13:00      now        │
│  └─────────────────────────────────────────────────────────────────────┘
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│  SERVER QUOTA (fallback for unauthenticated)                           │
│  ┌─────────────────────────────────────────────────────────────────────┐
│  │ ████████████░░░░░░░░  3,241 / 5,000     Resets in 38 min           │
│  └─────────────────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────────────────┘
```

### Visual Elements

#### 1. Users at Risk Panel
- List sorted by remaining quota (ascending)
- Warning icons for users < 20% remaining
- Click to drill down into specific user

#### 2. Distribution Histogram
- All users bucketed by % quota remaining
- Shows overall health at a glance
- Skewed left = healthy, skewed right = concerning

#### 3. User Drill-Down
- Expandable panel for investigating specific user
- Breakdown by operation type
- Breakdown by repository
- Cache hit rate comparison to average
- Pattern detection hints

#### 4. Time Series
- Consumption rate over time
- Per-user lines for at-risk users
- Helps identify when problems started

#### 5. Server Quota
- Fallback token status
- Important for unauthenticated users

---

## Telemetry Architecture

### Same Hybrid Pattern

```
┌─────────────────────────────────────────────────────────────────────────┐
│  WEB-ADE (instrumented GitHub calls)                                    │
│                                                                         │
│   getTree ────────▶ Cache Check ────────▶ GitHub API (if miss)         │
│       │                  │                      │                       │
│    span:              event:                 span:                      │
│    github.request    cache.hit/miss         github.api.call             │
└───────┼──────────────────┼──────────────────────┼───────────────────────┘
        │                  │                      │
        └──────────────────┴──────────────────────┘
                           │
          ┌────────────────┴────────────────┐
          ▼                                 ▼
   ┌─────────────┐                   ┌─────────────┐
   │ IPC/WS Emit │                   │ SQLite      │
   │ (real-time) │                   │ (storage)   │
   └──────┬──────┘                   └──────┬──────┘
          │                                 │
          ▼                                 ▼
   ┌─────────────┐                   ┌─────────────┐
   │ Live UI     │                   │ Replay +    │
   │ (dashboard) │                   │ Queries     │
   └─────────────┘                   └─────────────┘
```

### Instrumentation Points

#### On Every GitHub-Related Request

```typescript
async function trackedGitHubRequest(
  operation: string,
  endpoint: string,
  options: RequestInit
): Promise<Response> {
  const span = tracer.startSpan('github.request');

  const userId = await getGitHubUserId();
  const userLogin = await getGitHubUserLogin();
  const tokenType = (await getGitHubToken()) ? 'user' : 'server';

  span.setAttributes({
    'github.operation': operation,
    'github.endpoint': endpoint,
    'github.token.type': tokenType,
    'github.user.id': userId,
    'github.user.login': userLogin,
  });

  // Check caches first...
  const cached = await checkCaches(endpoint);
  if (cached) {
    span.setAttributes({
      'cache.hit': true,
      'cache.tier': cached.tier,
    });
    span.end();
    return cached.data;
  }

  // Cache miss - make API call
  span.setAttribute('cache.hit', false);

  const response = await fetch(`https://api.github.com${endpoint}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...options.headers },
  });

  // Capture rate limit headers
  const ratelimit = {
    remaining: parseInt(response.headers.get('x-ratelimit-remaining') || '0'),
    limit: parseInt(response.headers.get('x-ratelimit-limit') || '5000'),
    reset: parseInt(response.headers.get('x-ratelimit-reset') || '0'),
  };

  span.setAttributes({
    'github.ratelimit.remaining': ratelimit.remaining,
    'github.ratelimit.limit': ratelimit.limit,
    'github.ratelimit.reset': ratelimit.reset,
  });

  // Emit event for real-time tracking
  emitQuotaEvent({
    userId,
    userLogin,
    tokenType,
    operation,
    cacheHit: false,
    ratelimit,
  });

  span.end();
  return response;
}
```

#### Extracting Repo Context

```typescript
// Parse repo from endpoint
function parseRepoFromEndpoint(endpoint: string): { owner?: string; name?: string } {
  const match = endpoint.match(/\/repos\/([^\/]+)\/([^\/]+)/);
  if (match) {
    return { owner: match[1], name: match[2] };
  }
  return {};
}

span.setAttributes({
  'github.repo.owner': repo.owner,
  'github.repo.name': repo.name,
});
```

### Storage Schema

```sql
-- Main events table
CREATE TABLE github_quota_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp INTEGER NOT NULL,

  -- User context
  user_id INTEGER,                 -- NULL for server token
  user_login TEXT,
  token_type TEXT NOT NULL,        -- 'user' or 'server'

  -- Request details
  operation TEXT NOT NULL,         -- 'getTree', 'search', 'getRepoInfo', etc.
  repo_owner TEXT,
  repo_name TEXT,

  -- Cache result
  cache_hit INTEGER NOT NULL,      -- 0 or 1
  cache_tier TEXT,                 -- 'memory', 'redis', 's3', 'api'

  -- Rate limit state (only when cache_hit = 0)
  ratelimit_remaining INTEGER,
  ratelimit_limit INTEGER,
  ratelimit_reset INTEGER,

  -- OTEL correlation
  trace_id TEXT,
  span_id TEXT
);

-- Indexes for common queries
CREATE INDEX idx_quota_user_time ON github_quota_events(user_id, timestamp);
CREATE INDEX idx_quota_remaining ON github_quota_events(ratelimit_remaining)
  WHERE cache_hit = 0;
CREATE INDEX idx_quota_timestamp ON github_quota_events(timestamp);
CREATE INDEX idx_quota_token_type ON github_quota_events(token_type, timestamp);

-- Materialized view for quick "users at risk" query (refresh periodically)
CREATE TABLE github_quota_user_summary (
  user_id INTEGER PRIMARY KEY,
  user_login TEXT,
  last_seen INTEGER,
  last_remaining INTEGER,
  last_reset INTEGER,
  calls_this_hour INTEGER,
  cache_hits_this_hour INTEGER,
  cache_hit_rate REAL
);
```

### Example Data

```
timestamp     user_id  operation    repo              cache_hit  remaining
─────────────────────────────────────────────────────────────────────────────
1712345678001 123      getTree      vercel/next.js    0          4832
1712345678015 123      getTree      vercel/next.js    1          -
1712345678023 123      getRepoInfo  vercel/next.js    0          4831
1712345678045 456      getTree      facebook/react    1          -
1712345678089 123      search       -                 0          4830
1712345678102 NULL     getTree      microsoft/vscode  0          3241    (server token)
```

---

## Key Queries

### Users at Risk

```sql
-- Users with < 20% quota remaining
SELECT
  user_id,
  user_login,
  MIN(ratelimit_remaining) as remaining,
  MIN(ratelimit_remaining) * 100.0 / 5000 as percent_remaining
FROM github_quota_events
WHERE token_type = 'user'
  AND cache_hit = 0
  AND timestamp > strftime('%s', 'now') * 1000 - 3600000  -- last hour
GROUP BY user_id
HAVING remaining < 1000
ORDER BY remaining ASC;
```

### Distribution Histogram

```sql
-- Bucket users by remaining quota percentage
SELECT
  CASE
    WHEN percent_remaining < 10 THEN '0-10%'
    WHEN percent_remaining < 20 THEN '10-20%'
    WHEN percent_remaining < 40 THEN '20-40%'
    WHEN percent_remaining < 60 THEN '40-60%'
    WHEN percent_remaining < 80 THEN '60-80%'
    ELSE '80-100%'
  END as bucket,
  COUNT(*) as user_count
FROM (
  SELECT
    user_id,
    MIN(ratelimit_remaining) * 100.0 / 5000 as percent_remaining
  FROM github_quota_events
  WHERE token_type = 'user' AND cache_hit = 0
    AND timestamp > strftime('%s', 'now') * 1000 - 3600000
  GROUP BY user_id
)
GROUP BY bucket
ORDER BY bucket;
```

### User Drill-Down: By Operation

```sql
-- What operations is alice calling?
SELECT
  operation,
  COUNT(*) as total_calls,
  SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) as api_calls,
  SUM(cache_hit) * 100.0 / COUNT(*) as cache_hit_rate
FROM github_quota_events
WHERE user_id = 123
  AND timestamp > strftime('%s', 'now') * 1000 - 3600000
GROUP BY operation
ORDER BY api_calls DESC;
```

### User Drill-Down: By Repo

```sql
-- Which repos is alice hitting?
SELECT
  repo_owner || '/' || repo_name as repo,
  COUNT(*) as total_calls,
  SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) as api_calls
FROM github_quota_events
WHERE user_id = 123
  AND repo_owner IS NOT NULL
  AND timestamp > strftime('%s', 'now') * 1000 - 3600000
GROUP BY repo
ORDER BY api_calls DESC
LIMIT 10;
```

### Cache Hit Rate Comparison

```sql
-- Compare user's cache hit rate to average
WITH user_rate AS (
  SELECT SUM(cache_hit) * 100.0 / COUNT(*) as rate
  FROM github_quota_events
  WHERE user_id = 123
    AND timestamp > strftime('%s', 'now') * 1000 - 3600000
),
avg_rate AS (
  SELECT SUM(cache_hit) * 100.0 / COUNT(*) as rate
  FROM github_quota_events
  WHERE timestamp > strftime('%s', 'now') * 1000 - 3600000
)
SELECT
  user_rate.rate as user_cache_rate,
  avg_rate.rate as avg_cache_rate,
  user_rate.rate - avg_rate.rate as difference
FROM user_rate, avg_rate;
```

### Consumption Over Time

```sql
-- Per-user consumption rate over time (5-minute buckets)
SELECT
  (timestamp / 300000) * 300000 as bucket,  -- 5-min buckets
  user_id,
  COUNT(*) as calls,
  SUM(CASE WHEN cache_hit = 0 THEN 1 ELSE 0 END) as api_calls
FROM github_quota_events
WHERE timestamp > strftime('%s', 'now') * 1000 - 3600000
GROUP BY bucket, user_id
ORDER BY bucket, api_calls DESC;
```

---

## Replay Architecture

### Same EventSource Pattern

```typescript
interface QuotaEvent {
  timestamp: number;
  userId: number | null;
  userLogin: string | null;
  tokenType: 'user' | 'server';
  operation: string;
  repoOwner?: string;
  repoName?: string;
  cacheHit: boolean;
  cacheTier?: string;
  ratelimitRemaining?: number;
  ratelimitReset?: number;
}

interface EventSource {
  subscribe(handler: (event: QuotaEvent) => void): () => void;
}
```

### State Accumulator

```typescript
interface UserQuotaState {
  userId: number;
  userLogin: string;
  remaining: number;
  resetTime: number;
  callsThisHour: number;
  cacheHits: number;
  byOperation: Map<string, { total: number; apiCalls: number }>;
  byRepo: Map<string, { total: number; apiCalls: number }>;
}

interface QuotaDistributionState {
  users: Map<number, UserQuotaState>;
  serverRemaining: number;
  serverResetTime: number;
}

class QuotaStateAccumulator {
  private state: QuotaDistributionState = {
    users: new Map(),
    serverRemaining: 5000,
    serverResetTime: 0,
  };

  apply(event: QuotaEvent): QuotaDistributionState {
    if (event.tokenType === 'server') {
      this.updateServerQuota(event);
    } else if (event.userId) {
      this.updateUserQuota(event);
    }
    return this.getState();
  }

  private updateUserQuota(event: QuotaEvent) {
    let user = this.state.users.get(event.userId!);
    if (!user) {
      user = this.createUserState(event);
      this.state.users.set(event.userId!, user);
    }

    user.callsThisHour++;
    if (event.cacheHit) {
      user.cacheHits++;
    } else {
      // Update rate limit from API response
      if (event.ratelimitRemaining !== undefined) {
        user.remaining = event.ratelimitRemaining;
        user.resetTime = event.ratelimitReset || 0;
      }
    }

    // Track by operation
    const opStats = user.byOperation.get(event.operation) || { total: 0, apiCalls: 0 };
    opStats.total++;
    if (!event.cacheHit) opStats.apiCalls++;
    user.byOperation.set(event.operation, opStats);

    // Track by repo
    if (event.repoOwner && event.repoName) {
      const repoKey = `${event.repoOwner}/${event.repoName}`;
      const repoStats = user.byRepo.get(repoKey) || { total: 0, apiCalls: 0 };
      repoStats.total++;
      if (!event.cacheHit) repoStats.apiCalls++;
      user.byRepo.set(repoKey, repoStats);
    }
  }

  private updateServerQuota(event: QuotaEvent) {
    if (!event.cacheHit && event.ratelimitRemaining !== undefined) {
      this.state.serverRemaining = event.ratelimitRemaining;
      this.state.serverResetTime = event.ratelimitReset || 0;
    }
  }

  getUsersAtRisk(threshold: number = 0.2): UserQuotaState[] {
    return Array.from(this.state.users.values())
      .filter(u => u.remaining / 5000 < threshold)
      .sort((a, b) => a.remaining - b.remaining);
  }

  getDistribution(): Map<string, number> {
    const buckets = new Map<string, number>();
    for (const user of this.state.users.values()) {
      const percent = user.remaining / 5000;
      const bucket = percent < 0.1 ? '0-10%' :
                     percent < 0.2 ? '10-20%' :
                     percent < 0.4 ? '20-40%' :
                     percent < 0.6 ? '40-60%' :
                     percent < 0.8 ? '60-80%' : '80-100%';
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    }
    return buckets;
  }

  getState(): QuotaDistributionState {
    return { ...this.state };
  }
}
```

### Replay Use Cases

| Use Case | Description |
|----------|-------------|
| **Incident review** | "What happened when alice hit rate limit?" |
| **Pattern analysis** | Replay a week to find recurring quota issues |
| **Optimization validation** | Did cache improvements help? Compare before/after |
| **Capacity planning** | Understand peak usage patterns |

---

## Alerts & Thresholds

### Warning Conditions

| Condition | Threshold | Action |
|-----------|-----------|--------|
| User < 20% remaining | `remaining < 1000` | Show in "at risk" panel |
| User < 5% remaining | `remaining < 250` | Highlight red, consider throttling |
| Cache hit rate below average | `rate < avg - 20%` | Flag for investigation |
| Consumption spike | `rate > 3x baseline` | Alert ops |
| Server quota low | `remaining < 500` | Critical - affects all unauth users |

### Proactive Throttling (Optional)

```typescript
// Before making API call, check if user is at risk
async function shouldThrottle(userId: number): Promise<boolean> {
  const state = await getUserQuotaState(userId);
  if (state.remaining < 100) {
    // Critical - block non-essential calls
    return true;
  }
  if (state.remaining < 500 && state.cacheHitRate < 0.5) {
    // At risk with poor cache performance - throttle
    return true;
  }
  return false;
}
```

---

## Comparison: Three Case Studies

| Aspect | Pipeline View | Activity View | Quota View |
|--------|--------------|---------------|------------|
| **System** | Repo Monitoring | Traffic Controller | Web-ADE |
| **Focus** | Data flow stages | User counts | Resource distribution |
| **Key metric** | Latency per stage | Users per room | Remaining quota % |
| **Concern** | "Is data flowing?" | "How busy?" | "Who's at risk?" |
| **Aggregation** | By stage | By room | By user |
| **Alert on** | Stage stuck | Unusual activity | Low quota |
| **Drill-down** | Stage details | Room details | User consumption breakdown |

### Shared Patterns

All three case studies use:
1. **Hybrid real-time + storage** - IPC for live updates, SQLite for history
2. **EventSource abstraction** - UI agnostic to live vs replay
3. **State accumulator** - Reconstruct state from event stream
4. **Time-controlled replay** - Scrub through history

---

## Summary

The Quota Distribution View adds a new pattern: **distribution monitoring**. Instead of tracking a single pipeline or aggregate counts, we're tracking a **population of users** and their individual resource consumption.

Key capabilities:
- **Distribution awareness** - Histogram of all users' quota status
- **Risk identification** - Surface users approaching limits
- **Root cause analysis** - Drill down into why consumption is high
- **Comparative metrics** - Cache hit rate vs average
- **Temporal analysis** - When did problems start?

This pattern generalizes to any scenario where you have:
- Per-entity resource quotas
- Need to understand distribution across entities
- Want to identify outliers and diagnose causes

---

## Next Steps

1. Add instrumentation to GitHub API wrapper in Web-ADE
2. Capture user context and rate limit headers
3. Create SQLite storage for quota events
4. Build distribution visualization components
5. Implement replay with state accumulator
6. Add alerting for at-risk users

## Related Documents

- [REPOSITORY_MONITORING_PIPELINE_VIEW.md](./REPOSITORY_MONITORING_PIPELINE_VIEW.md) - Pipeline visualization
- [TRAFFIC_CONTROLLER_ACTIVITY_VIEW.md](./TRAFFIC_CONTROLLER_ACTIVITY_VIEW.md) - Activity monitoring
- [LOCAL_METRICS_STORAGE_DESIGN.md](../LOCAL_METRICS_STORAGE_DESIGN.md) - SQLite storage architecture
