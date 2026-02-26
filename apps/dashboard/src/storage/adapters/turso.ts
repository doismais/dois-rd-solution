import { createClient, Client } from '@libsql/client';
import { StorageAdapter, PageView, Lead, CampaignMetrics } from '../types.js';
import { UpstashAdapter } from './upstash.js';

export class TursoAdapter implements StorageAdapter {
    private client: Client;
    private kv: UpstashAdapter;

    constructor() {
        this.client = createClient({
            url: process.env.TURSO_DATABASE_URL || '',
            authToken: process.env.TURSO_AUTH_TOKEN || '',
        });
        this.kv = new UpstashAdapter();
    }

    async trackPageView(data: PageView): Promise<void> {
        // Composition: Delegate PV tracking to Upstash Redis
        return this.kv.trackPageView(data);
    }

    async saveLead(data: Lead): Promise<void> {
        const { event, src, name, email, company, phone, message } = data;

        await this.client.execute({
            sql: `INSERT INTO leads (event, src, name, email, company, phone, message) 
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                event,
                src || 'direct',
                name || '',
                email || '',
                company || '',
                phone || '',
                message || ''
            ]
        });

        console.log(`[Turso] Lead saved: ${event} from ${src}`);
    }

    async getPageViewsByEvent(event: string): Promise<number> {
        return this.kv.getPageViewsByEvent(event);
    }

    async getAllMetrics(): Promise<CampaignMetrics[]> {
        // 1. Get PV metrics from KV
        const kvMetrics = await this.kv.getAllMetrics();

        // 2. Get Lead counts from Turso
        const result = await this.client.execute(
            "SELECT event, COUNT(*) as count FROM leads GROUP BY event"
        );

        const leadCounts = new Map(
            result.rows.map(row => [row.event as string, Number(row.count)])
        );

        // 3. Merge metrics
        return kvMetrics.map(m => ({
            ...m,
            leads: leadCounts.get(m.event) || 0
        }));
    }
}
