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
        // Simple secret check (Phase 4 requirement)
        const secret = request.headers['x-secret'];
        if (secret !== process.env.DASHBOARD_SECRET) {
            return reply.code(401).send({ error: 'Unauthorized' });
        }

        const metrics = await storage.getAllMetrics();

        // Fetch RD Cache data for these metrics
        const rdData = await rd.db.execute("SELECT * FROM rd_cache");
        const rdMap = new Map(rdData.rows.map(row => [row.campaign_id, row]));

        // Enhancement: Try to match RD Campaigns with Local Events
        // This is a simplified matching for the funnel
        const enhancedMetrics = metrics.map(m => {
            // Find a campaign that contains the event name (e.g., 'hospitalar')
            const campaign = rdData.rows.find(row =>
                (row.campaign_name as string).toLowerCase().includes(m.event.toLowerCase())
            );

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
            campaigns: enhancedMetrics
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

        // RD Station sends an array of events
        if (Array.isArray(payload)) {
            for (const event of payload) {
                const event_type = event.event_type;
                const lead = event.lead || {};
                const campaign = event.campaign || {};

                await rd.db.execute({
                    sql: `INSERT INTO rd_events (event_type, lead_email, campaign_id, campaign_name, occurred_at, raw_payload) 
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        event_type,
                        lead.email || null,
                        campaign.id || null,
                        campaign.name || null,
                        new Date().toISOString(),
                        JSON.stringify(event)
                    ]
                });
            }
        }

        return reply.code(200).send({ ok: true });
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

    // Serve Troia Landing Page
    await fastify.register(fastifyStatic, {
        root: path.resolve(__dirname, '../../troia'),
        prefix: '/',
        decorateReply: false
    });

    // Serve Dashboard (React App)
    await fastify.register(fastifyStatic, {
        root: path.join(__dirname, '../public'),
        prefix: '/dashboard',
        decorateReply: false
    });

    // SPA Fallback
    fastify.setNotFoundHandler(async (request, reply) => {
        if (request.url.startsWith('/dashboard')) {
            return reply.sendFile('index.html', path.join(__dirname, '../public'));
        }
        // Fallback for landing page or other routes to landing page index
        return reply.sendFile('index.html', path.resolve(__dirname, '../../troia'));
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
