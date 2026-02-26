import './env.js';

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import { storage } from './storage/index.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';
import { RDClient } from './rd-client.js';
import { Scheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fastify: FastifyInstance = Fastify({
    logger: true
});

const rd = new RDClient();
const scheduler = new Scheduler();

const normalizeForMatch = (value: string): string => {
    return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
};

async function bootstrap() {
    await scheduler.initSchema();
    scheduler.start();

    await fastify.register(cors, {
        origin: true // In production, restrict this to the landing page domain
    });

    // RD Station Auth Flow
    fastify.get('/api/rd/auth', async (_, reply: FastifyReply) => {
        const url = await rd.getAuthUrl();
        return reply.redirect(url);
    });

    fastify.get('/api/rd/callback', async (request: FastifyRequest, reply: FastifyReply) => {
        const { code } = request.query as { code: string };
        if (!code) return reply.code(400).send({ error: 'Missing code' });

        await rd.handleCallback(code);
        return { ok: true, message: 'RD Station authenticated successfully. Tokens saved.' };
    });

    // Dashboard Metrics
    fastify.get('/api/metrics', async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const metrics = await storage.getAllMetrics();

        // Fetch RD Cache data for these metrics
        const rdData = await rd.db.execute("SELECT * FROM rd_cache ORDER BY cached_at DESC");

        // Enhancement: Try to match RD Campaigns with Local Events
        // This is a simplified matching for the funnel
        const enhancedMetrics = metrics.map(m => {
            const eventKey = normalizeForMatch(m.event);
            const campaign = rdData.rows.find(row => {
                const nameKey = normalizeForMatch(String(row.campaign_name || ''));
                return nameKey.includes(eventKey) || eventKey.includes(nameKey);
            });

            if (campaign) {
                return {
                    ...m,
                    rdName: campaign.campaign_name,
                    sent: campaign.sent,
                    delivered: campaign.delivered,
                    opened: campaign.opened,
                    clicked: campaign.clicked,
                    openRate: campaign.open_rate,
                    clickRate: campaign.click_rate
                };
            }
            return m;
        });

        return {
            updatedAt: new Date().toISOString(),
            campaigns: enhancedMetrics,
            rdCampaigns: rdData.rows
        };
    });

    // Leads List
    fastify.get('/api/leads', async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const result = await rd.db.execute("SELECT * FROM leads ORDER BY created_at DESC LIMIT 100");
        return result.rows;
    });

    // RD Station Webhook (Live Events)
    fastify.post('/api/rd/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
        const payload = request.body as any;
        const nowIso = new Date().toISOString();
        const events = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.events)
                ? payload.events
                : payload
                    ? [payload]
                    : [];

        for (const rawEvent of events) {
            const event = (rawEvent && typeof rawEvent === 'object') ? rawEvent : { raw: rawEvent };
            const lead = event.lead || event.contact || {};
            const campaign = event.campaign || {};
            const eventType = event.event_type || event.eventType || event.type || 'unknown';
            const campaignId = campaign.id ?? event.campaign_id ?? event.campaignId ?? null;
            const campaignName = campaign.name || event.campaign_name || event.campaignName || null;
            const occurredAtRaw = event.occurred_at || event.occurredAt || event.created_at || event.timestamp;
            const parsedOccurredAt = occurredAtRaw ? new Date(occurredAtRaw) : null;
            const occurredAt = parsedOccurredAt && !Number.isNaN(parsedOccurredAt.getTime())
                ? parsedOccurredAt.toISOString()
                : nowIso;

            await rd.db.execute({
                sql: `INSERT INTO rd_events (event_type, lead_email, campaign_id, campaign_name, occurred_at, raw_payload) 
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [
                    String(eventType),
                    lead.email || event.email || null,
                    campaignId,
                    campaignName,
                    occurredAt,
                    JSON.stringify(event)
                ]
            });
        }

        return reply.code(200).send({ ok: true, received: events.length });
    });

    // Live Feed (last 20 events)
    fastify.get('/api/rd/events', async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const result = await rd.db.execute("SELECT * FROM rd_events ORDER BY created_at DESC LIMIT 20");
        return result.rows;
    });

    fastify.post('/api/rd/sync', async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const result = await scheduler.syncMetrics();
        return { ok: result.status === 'success', sync: result };
    });

    fastify.get('/api/rd/diagnostics', async (request: FastifyRequest, reply: FastifyReply) => {
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const [tokenRows, cacheCountRows, eventsCountRows, leadsCountRows, recentSyncRows, recentCacheRows] = await Promise.all([
            rd.db.execute("SELECT updated_at, expires_at FROM rd_tokens WHERE id = 1"),
            rd.db.execute("SELECT COUNT(*) AS count FROM rd_cache"),
            rd.db.execute("SELECT COUNT(*) AS count FROM rd_events"),
            rd.db.execute("SELECT COUNT(*) AS count FROM leads"),
            rd.db.execute("SELECT run_id, started_at, finished_at, status, emails_total, emails_useful, analytics_total, upserts_total, error_message FROM rd_sync_runs ORDER BY started_at DESC LIMIT 10"),
            rd.db.execute("SELECT campaign_id, campaign_name, sent, opened, clicked, status, sent_at, cached_at FROM rd_cache ORDER BY cached_at DESC LIMIT 10"),
        ]);

        const tokenRow = tokenRows.rows[0] as any;
        const nowSec = Math.floor(Date.now() / 1000);
        const expiresAt = tokenRow ? Number(tokenRow.expires_at || 0) : 0;
        const secondsToExpire = expiresAt > 0 ? Math.max(0, expiresAt - nowSec) : null;

        return {
            generatedAt: new Date().toISOString(),
            token: tokenRow
                ? {
                    exists: true,
                    updatedAt: tokenRow.updated_at,
                    expiresAtEpoch: expiresAt,
                    secondsToExpire
                }
                : { exists: false },
            counts: {
                rdCache: Number((cacheCountRows.rows[0] as any)?.count || 0),
                rdEvents: Number((eventsCountRows.rows[0] as any)?.count || 0),
                leads: Number((leadsCountRows.rows[0] as any)?.count || 0)
            },
            recentSyncRuns: recentSyncRows.rows,
            recentRDCampaigns: recentCacheRows.rows
        };
    });

    // Health check
    fastify.get('/health', async () => {
        return { status: 'ok' };
    });

    // Track Page View
    fastify.post('/api/track', async (request: FastifyRequest, reply: FastifyReply) => {
        const { event, src } = request.body as { event: string; src: string };

        if (!event || !src) {
            return reply.code(400).send({ error: 'Missing event or src' });
        }

        // Fire and forget - don't await to not block
        storage.trackPageView({
            event,
            src,
            timestamp: new Date().toISOString(),
            userAgent: request.headers['user-agent']
        }).catch(err => console.error('Track error:', err));

        return { ok: true };
    });

    fastify.post('/api/leads', async (request: FastifyRequest, reply: FastifyReply) => {
        const { event, src } = request.body as { event: string; src: string };
        if (!event) return reply.code(400).send({ error: 'Missing event' });

        storage.saveLead({
            event,
            src: src || 'direct',
            timestamp: new Date().toISOString()
        }).catch(err => console.error('Lead error:', err));

        return { ok: true };
    });

    // Method check for track
    fastify.get('/api/track', async (_request, reply) => {
        return reply.code(405).send({ error: 'Method Not Allowed' });
    });

    // 1. Serve Dashboard Assets (React App)
    // We register this first with prefix /dashboard/ to handle assets correctly
    await fastify.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/dashboard/',
        decorateReply: true // Habilita sendFile
    });

    // 2. Serve Troia Landing Page
    // We register this for the root prefix
    await fastify.register(fastifyStatic, {
        root: path.resolve(__dirname, '../landing'),
        prefix: '/',
        decorateReply: false // Só um plugin pode decorar
    });

    // SPA Fallback
    fastify.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/dashboard')) {
            return reply.sendFile('index.html', path.join(__dirname, '../public'));
        }
        // Fallback for landing page or other routes to landing page index
        return reply.sendFile('index.html', path.resolve(__dirname, '../landing'));
    });

    const port = Number(process.env.PORT) || 3000;

    try {
        await fastify.listen({ port, host: '0.0.0.0' });
        console.log(`Dashboard Service running on port ${port}`);
    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
}

bootstrap();
