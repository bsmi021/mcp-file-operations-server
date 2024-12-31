import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

interface RateLimit {
    maxRequests: number;  // Maximum requests allowed in the window
    windowMs: number;     // Time window in milliseconds
}

interface RequestTracker {
    count: number;
    resetTime: number;
}

/**
 * Service for rate limiting requests to protect against abuse
 */
export class RateLimiterService {
    private limits: Map<string, RateLimit>;
    private requests: Map<string, RequestTracker>;

    constructor() {
        // Define rate limits for different operations
        this.limits = new Map([
            ['tool', { maxRequests: 100, windowMs: 60 * 1000 }],      // 100 requests per minute for tools
            ['resource', { maxRequests: 200, windowMs: 60 * 1000 }],   // 200 requests per minute for resources
            ['watch', { maxRequests: 20, windowMs: 60 * 1000 }]        // 20 watch operations per minute
        ]);
        this.requests = new Map();
    }

    /**
     * Check if an operation should be rate limited
     * @param operationType Type of operation (tool, resource, watch)
     * @throws {McpError} If rate limit is exceeded
     */
    public checkRateLimit(operationType: string): void {
        const limit = this.limits.get(operationType);
        if (!limit) return; // No rate limit for this operation type

        const now = Date.now();
        const tracker = this.requests.get(operationType) || { count: 0, resetTime: now + limit.windowMs };

        // Reset counter if window has expired
        if (now >= tracker.resetTime) {
            tracker.count = 0;
            tracker.resetTime = now + limit.windowMs;
        }

        // Check if limit is exceeded
        if (tracker.count >= limit.maxRequests) {
            const waitMs = tracker.resetTime - now;
            throw new McpError(
                ErrorCode.InvalidRequest,
                `Rate limit exceeded for ${operationType} operations. Please wait ${Math.ceil(waitMs / 1000)} seconds.`
            );
        }

        // Update counter
        tracker.count++;
        this.requests.set(operationType, tracker);
    }

    /**
     * Get current rate limit status
     * @param operationType Type of operation
     * @returns Current count and reset time, or null if no limit exists
     */
    public getStatus(operationType: string): { current: number; limit: number; resetsIn: number } | null {
        const limit = this.limits.get(operationType);
        const tracker = this.requests.get(operationType);

        if (!limit || !tracker) return null;

        return {
            current: tracker.count,
            limit: limit.maxRequests,
            resetsIn: Math.max(0, tracker.resetTime - Date.now())
        };
    }
}
