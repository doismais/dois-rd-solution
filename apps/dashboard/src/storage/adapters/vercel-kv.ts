import { StorageAdapter, PageView, Lead, CampaignMetrics } from '../types.js';

export class VercelKVAdapter implements StorageAdapter {
    private apiUrl: string;
    private apiToken: string;

    constructor() {
        this.apiUrl = process.env.VERCEL_KV_REST_API_URL || '';
        this.apiToken = process.env.VERCEL_KV_REST_API_TOKEN || '';
    }

    private async fetchKV(command: string, ...args: (string | number)[]) {
        if (!this.apiUrl || !this.apiToken) {
            console.warn('Vercel KV env vars missing');
            return null;
        }

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
        await this.fetchKV('INCR', `pv:${event}:${src}`);

        // Register pv:last:{event} with timestamp
        await this.fetchKV('SET', `pv:last:${event}`, timestamp);

        console.log(`[KV] Tracked PV: ${event} from ${src}`);
    }

    async saveLead(_data: Lead): Promise<void> {
        throw new Error('Use TursoAdapter for leads persistence');
    }

    async getPageViewsByEvent(event: string): Promise<number> {
        // Scan keys pv:{event}:*
        // For simplicity in REST API without complex scan, we'll need to know the sources or use a different strategy
        // In this specific implementation, we'll assume we know the sources or handle it via a better KV structure if needed
        // But for Fase 1, we follow the prompt's logic of summing counters
        const keysResult = await this.fetchKV('KEYS', `pv:${event}:*`);
        const keys = (keysResult as any)?.result || [];

        let total = 0;
        for (const key of keys) {
            const valResult = await this.fetchKV('GET', key);
            total += parseInt((valResult as any)?.result || '0', 10);
        }

        return total;
    }

    async getAllMetrics(): Promise<CampaignMetrics[]> {
        const events = ['hospitalar', 'autocom', 'showsafra', 'expo_otica'];
        const metrics: CampaignMetrics[] = [];

        for (const event of events) {
            const pageViews = await this.getPageViewsByEvent(event);
            const lastViewResult = await this.fetchKV('GET', `pv:last:${event}`);
            const lastView = (lastViewResult as any)?.result || undefined;

            metrics.push({
                event,
                pageViews,
                leads: 0, // Placeholder, Turso will fill this
                lastView
            });
        }

        return metrics;
    }
}
