import { StorageAdapter, PageView, Lead, CampaignMetrics } from '../types.js';

// Upstash Redis REST API adapter
// Substituiu vercel-kv.ts — Vercel KV foi descontinuado em 2025
// Docs: https://upstash.com/docs/redis/features/restapi
// Env vars: UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN

export class UpstashAdapter implements StorageAdapter {
    private apiUrl: string;
    private apiToken: string;

    constructor() {
        this.apiUrl = process.env.UPSTASH_REDIS_REST_URL || '';
        this.apiToken = process.env.UPSTASH_REDIS_REST_TOKEN || '';
    }

    private async fetchRedis(command: string, ...args: (string | number)[]) {
        if (!this.apiUrl || !this.apiToken) {
            console.warn('[Upstash] env vars missing: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN');
            return null;
        }

        // Upstash REST API: GET {base}/{command}/{arg1}/{arg2}/...
        const response = await fetch(`${this.apiUrl}/${command}/${args.join('/')}`, {
            headers: {
                Authorization: `Bearer ${this.apiToken}`,
            },
        });

        return response.json();
    }

    async trackPageView(data: PageView): Promise<void> {
        const { event, src, timestamp } = data;

        // Increment counter pv:{event}:{src}
        await this.fetchRedis('INCR', `pv:${event}:${src}`);

        // Register pv:last:{event} with timestamp
        await this.fetchRedis('SET', `pv:last:${event}`, timestamp);

        console.log(`[Upstash] Tracked PV: ${event} from ${src}`);
    }

    async saveLead(_data: Lead): Promise<void> {
        throw new Error('Use TursoAdapter for leads persistence');
    }

    async getPageViewsByEvent(event: string): Promise<number> {
        const keysResult = await this.fetchRedis('KEYS', `pv:${event}:*`);
        const keys = (keysResult as any)?.result || [];

        let total = 0;
        for (const key of keys) {
            const valResult = await this.fetchRedis('GET', key);
            total += parseInt((valResult as any)?.result || '0', 10);
        }

        return total;
    }

    async getAllMetrics(): Promise<CampaignMetrics[]> {
        const events = ['hospitalar', 'autocom', 'showsafra', 'expo_otica'];
        const metrics: CampaignMetrics[] = [];

        for (const event of events) {
            const pageViews = await this.getPageViewsByEvent(event);
            const lastViewResult = await this.fetchRedis('GET', `pv:last:${event}`);
            const lastView = (lastViewResult as any)?.result || undefined;

            metrics.push({
                event,
                pageViews,
                leads: 0, // Placeholder — Turso fills this via composition
                lastView
            });
        }

        return metrics;
    }
}
