import cron from 'node-cron';
import { RDClient } from './rd-client.js';
import { createClient, Client } from '@libsql/client';

export class Scheduler {
    private rd: RDClient;
    private db: Client;

    constructor() {
        this.rd = new RDClient();
        this.db = createClient({
            url: process.env.TURSO_DATABASE_URL || '',
            authToken: process.env.TURSO_AUTH_TOKEN || '',
        });
    }

    async initSchema() {
        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS rd_cache (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id   TEXT NOT NULL,
        campaign_name TEXT NOT NULL,
        sent_at       TEXT,
        sent          INTEGER,
        delivered     INTEGER,
        opened        INTEGER,
        clicked       INTEGER,
        bounced       INTEGER,
        open_rate     REAL,
        click_rate    REAL,
        status        TEXT,
        email_type    TEXT,
        leads_count   INTEGER,
        rd_created_at TEXT,
        rd_updated_at TEXT,
        cached_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(campaign_id)
      )
    `);
        await this.db.execute("CREATE INDEX IF NOT EXISTS idx_rd_cache_campaign ON rd_cache(campaign_id)");
        await this.ensureRDCacheColumns();

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS rd_events (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        event_type  TEXT NOT NULL,
        lead_email  TEXT,
        campaign_id INTEGER,
        campaign_name TEXT,
        occurred_at TEXT NOT NULL,
        raw_payload TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
        await this.db.execute("CREATE INDEX IF NOT EXISTS idx_rd_events_campaign ON rd_events(campaign_id)");
        await this.db.execute("CREATE INDEX IF NOT EXISTS idx_rd_events_type ON rd_events(event_type)");

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS leads (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        event      TEXT NOT NULL,
        src        TEXT NOT NULL DEFAULT 'direct',
        name       TEXT,
        email      TEXT,
        company    TEXT,
        phone      TEXT,
        message    TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
        await this.db.execute("CREATE INDEX IF NOT EXISTS idx_leads_event ON leads(event)");

        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS rd_tokens (
        id            INTEGER PRIMARY KEY DEFAULT 1,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        updated_at    TEXT NOT NULL
      )
    `);
    }

    async syncMetrics() {
        console.log('[Scheduler] Starting RD Station sync...');
        try {
            const end = new Date().toISOString().split('T')[0];
            const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const [emails, analytics] = await Promise.all([
                this.rd.fetchEmails(100, 10),
                this.rd.fetchEmailAnalytics(start, end)
            ]);

            const usefulEmails = emails.filter((email) => {
                const hasSendDate = Boolean(email.send_at);
                const hasLeads = Number(email.leads_count || 0) > 0;
                const status = String(email.status || '').toLowerCase();
                const looksSent = status.includes('sent') || status.includes('enviado');
                return hasSendDate || hasLeads || looksSent;
            });

            const byId = new Map<string, any>();

            for (const email of usefulEmails) {
                byId.set(String(email.id), {
                    id: String(email.id),
                    name: email.name || `email-${email.id}`,
                    sent_at: email.send_at || null,
                    sent: Number(email.leads_count || 0),
                    delivered: 0,
                    opened: 0,
                    clicked: 0,
                    bounced: 0,
                    open_rate: 0,
                    click_rate: 0,
                    status: email.status || null,
                    type: email.type || null,
                    leads_count: Number(email.leads_count || 0),
                    created_at: email.created_at || null,
                    updated_at: email.updated_at || null
                });
            }

            for (const raw of analytics) {
                const id = this.pickCampaignId(raw);
                const existing = byId.get(id) || {
                    id,
                    name: this.pickCampaignName(raw, id),
                    sent_at: raw.sent_at || null,
                    sent: 0,
                    delivered: 0,
                    opened: 0,
                    clicked: 0,
                    bounced: 0,
                    open_rate: 0,
                    click_rate: 0,
                    status: null,
                    type: null,
                    leads_count: 0,
                    created_at: null,
                    updated_at: null
                };

                const sent = Number(raw.sent ?? existing.sent ?? 0);
                const opened = Number(raw.opened ?? existing.opened ?? 0);
                const clicked = Number(raw.clicked ?? existing.clicked ?? 0);
                const delivered = Number(raw.delivered ?? existing.delivered ?? 0);

                byId.set(id, {
                    ...existing,
                    name: this.pickCampaignName(raw, existing.name || id),
                    sent_at: raw.sent_at || existing.sent_at || null,
                    sent,
                    delivered,
                    opened,
                    clicked,
                    bounced: Number(raw.bounced ?? existing.bounced ?? 0),
                    open_rate: Number(raw.open_rate ?? (sent ? (opened / sent) * 100 : 0)),
                    click_rate: Number(raw.click_rate ?? (sent ? (clicked / sent) * 100 : 0))
                });
            }

            const campaigns = Array.from(byId.values());

            for (const campaign of campaigns) {
                await this.db.execute({
                    sql: `INSERT OR REPLACE INTO rd_cache 
                (campaign_id, campaign_name, sent_at, sent, delivered, opened, clicked, bounced, open_rate, click_rate, status, email_type, leads_count, rd_created_at, rd_updated_at, cached_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    args: [
                        String(campaign.id),
                        campaign.name,
                        campaign.sent_at || null,
                        Number(campaign.sent || 0),
                        Number(campaign.delivered || 0),
                        Number(campaign.opened || 0),
                        Number(campaign.clicked || 0),
                        Number(campaign.bounced || 0),
                        Number(campaign.open_rate || 0),
                        Number(campaign.click_rate || 0),
                        campaign.status || null,
                        campaign.type || null,
                        Number(campaign.leads_count || 0),
                        campaign.created_at || null,
                        campaign.updated_at || null
                    ]
                });
            }
            console.log(`[Scheduler] Sync complete. Processed ${campaigns.length} campaigns (emails=${usefulEmails.length}/${emails.length}, analytics=${analytics.length}).`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);

            if (message.includes('No valid RD Station token found')) {
                console.warn('[Scheduler] RD sync skipped: token not configured yet. Authenticate at /api/rd/auth.');
                return;
            }

            console.error('[Scheduler] Sync failed:', err);
        }
    }

    private async ensureRDCacheColumns(): Promise<void> {
        const tableInfo = await this.db.execute("PRAGMA table_info(rd_cache)");
        const columns = new Set(tableInfo.rows.map((row: any) => String(row.name)));

        const missingColumns: Array<{ name: string; sqlType: string }> = [
            { name: 'status', sqlType: 'TEXT' },
            { name: 'email_type', sqlType: 'TEXT' },
            { name: 'leads_count', sqlType: 'INTEGER' },
            { name: 'rd_created_at', sqlType: 'TEXT' },
            { name: 'rd_updated_at', sqlType: 'TEXT' }
        ].filter(col => !columns.has(col.name));

        for (const column of missingColumns) {
            await this.db.execute(`ALTER TABLE rd_cache ADD COLUMN ${column.name} ${column.sqlType}`);
        }
    }

    private pickCampaignId(raw: any): string {
        const id = raw?.id ?? raw?.campaign_id ?? raw?.campaign?.id;
        if (id !== undefined && id !== null && String(id).trim() !== '') {
            return String(id);
        }

        const name = this.pickCampaignName(raw, 'sem-nome');
        const normalized = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return `name:${normalized || 'sem-nome'}`;
    }

    private pickCampaignName(raw: any, fallback: string): string {
        return String(raw?.name || raw?.campaign_name || raw?.campaign?.name || fallback);
    }

    start() {
        // Run immediately on start
        this.syncMetrics();

        // Run every hour
        cron.schedule('0 * * * *', () => {
            this.syncMetrics();
        });
    }
}
