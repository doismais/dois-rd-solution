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
        cached_at     TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(campaign_id)
      )
    `);
        await this.db.execute("CREATE INDEX IF NOT EXISTS idx_rd_cache_campaign ON rd_cache(campaign_id)");

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
    }

    async syncMetrics() {
        console.log('[Scheduler] Starting RD Station sync...');
        try {
            const end = new Date().toISOString().split('T')[0];
            const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

            const campaigns = await this.rd.fetchEmailAnalytics(start, end);

            for (const campaign of campaigns) {
                await this.db.execute({
                    sql: `INSERT OR REPLACE INTO rd_cache 
                (campaign_id, campaign_name, sent_at, sent, delivered, opened, clicked, bounced, open_rate, click_rate, cached_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
                    args: [
                        campaign.id.toString(),
                        campaign.name,
                        campaign.sent_at,
                        campaign.sent || 0,
                        campaign.delivered || 0,
                        campaign.opened || 0,
                        campaign.clicked || 0,
                        campaign.bounced || 0,
                        campaign.open_rate || 0,
                        campaign.click_rate || 0
                    ]
                });
            }
            console.log(`[Scheduler] Sync complete. Processed ${campaigns.length} campaigns.`);
        } catch (err) {
            console.error('[Scheduler] Sync failed:', err);
        }
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
