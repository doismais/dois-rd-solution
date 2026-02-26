import React, { useEffect, useMemo, useState } from 'react';
import {
    Activity,
    AlertTriangle,
    BarChart3,
    Database,
    Mail,
    MousePointer2,
    RefreshCw,
    Send,
    ShieldCheck,
    Target,
    Users
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion } from 'framer-motion';

interface Campaign {
    event: string;
    rdName?: string;
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
    openRate?: number;
    clickRate?: number;
    pageViews: number;
    leads: number;
}

interface MetricsResponse {
    campaigns: Campaign[];
    updatedAt: string;
}

interface RDEvent {
    event_type?: string;
    lead_email?: string;
    campaign_name?: string;
    campaign_id?: string | number;
    occurred_at?: string;
    created_at?: string;
}

interface LeadRow {
    event?: string;
    src?: string;
    name?: string;
    email?: string;
    phone?: string;
    created_at?: string;
}

interface KpiCardProps {
    priority: string;
    title: string;
    value: string;
    subtitle: string;
    tone: 'pink' | 'blue' | 'green' | 'yellow' | 'purple' | 'slate';
    icon: React.ComponentType<{ size?: number | string }>;
}

const toneClass: Record<KpiCardProps['tone'], string> = {
    pink: 'tone-pink',
    blue: 'tone-blue',
    green: 'tone-green',
    yellow: 'tone-yellow',
    purple: 'tone-purple',
    slate: 'tone-slate'
};

const safeNum = (value?: number): number => Number(value || 0);

const formatNumber = (value: number): string => new Intl.NumberFormat('pt-BR').format(value);

const formatPercent = (num: number, den: number): string => {
    if (!den) return '0.0%';
    return `${((num / den) * 100).toFixed(1)}%`;
};

const maskEmail = (email?: string): string => {
    if (!email || !email.includes('@')) return '--';
    const [local, domain] = email.split('@');
    const safeLocal = local.length > 3 ? `${local.slice(0, 3)}***` : `${local}***`;
    return `${safeLocal}@${domain}`;
};

const KpiCard = ({ priority, title, value, subtitle, tone, icon: Icon }: KpiCardProps) => (
    <motion.article
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className={`panel kpi-card ${toneClass[tone]}`}
    >
        <div className="kpi-topline">
            <span className="kpi-priority">Prioridade {priority}</span>
            <span className="kpi-icon-wrap">
                <Icon size={16} />
            </span>
        </div>
        <p className="kpi-label">{title}</p>
        <p className="kpi-value">{value}</p>
        <p className="kpi-subtitle">{subtitle}</p>
    </motion.article>
);

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [metrics, setMetrics] = useState<MetricsResponse | null>(null);
    const [rdEvents, setRdEvents] = useState<RDEvent[]>([]);
    const [leads, setLeads] = useState<LeadRow[]>([]);

    const fetchData = async (token: string) => {
        try {
            const headers = { 'x-secret': token };
            const [metricsRes, eventsRes, leadsRes] = await Promise.all([
                fetch('/api/metrics', { headers }),
                fetch('/api/rd/events', { headers }),
                fetch('/api/leads', { headers })
            ]);

            if (metricsRes.status === 401) {
                setIsAuthenticated(false);
                return;
            }

            if (metricsRes.ok) {
                const metricsJson = (await metricsRes.json()) as MetricsResponse;
                setMetrics(metricsJson);
                setIsAuthenticated(true);
            }

            if (eventsRes.ok) {
                const eventsJson = (await eventsRes.json()) as RDEvent[];
                setRdEvents(Array.isArray(eventsJson) ? eventsJson : []);
            }

            if (leadsRes.ok) {
                const leadsJson = (await leadsRes.json()) as LeadRow[];
                setLeads(Array.isArray(leadsJson) ? leadsJson : []);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleLogin = (event: React.FormEvent) => {
        event.preventDefault();
        setLoading(true);
        localStorage.setItem('_dm_auth', password);
        fetchData(password);
    };

    useEffect(() => {
        const saved = localStorage.getItem('_dm_auth');
        if (saved) {
            setPassword(saved);
            fetchData(saved);
        }

        const interval = window.setInterval(() => {
            const token = localStorage.getItem('_dm_auth');
            if (token) fetchData(token);
        }, 30000);

        return () => window.clearInterval(interval);
    }, []);

    const summary = useMemo(() => {
        const campaigns = metrics?.campaigns || [];
        const totalSent = campaigns.reduce((acc, item) => acc + safeNum(item.sent), 0);
        const totalOpened = campaigns.reduce((acc, item) => acc + safeNum(item.opened), 0);
        const totalClicked = campaigns.reduce((acc, item) => acc + safeNum(item.clicked), 0);
        const totalPageViews = campaigns.reduce((acc, item) => acc + safeNum(item.pageViews), 0);
        const totalLeads = campaigns.reduce((acc, item) => acc + safeNum(item.leads), 0);

        const opportunities = rdEvents.filter((item) =>
            String(item.event_type || '').toLowerCase().includes('opportunity')
        ).length;

        const eventsMissingCampaign = rdEvents.filter((item) => !item.campaign_name && !item.campaign_id).length;
        const eventsMissingLead = rdEvents.filter((item) => !item.lead_email).length;
        const leadsWithoutSrc = leads.filter((item) => !item.src).length;

        const sourceMap = new Map<string, number>();
        for (const lead of leads) {
            const key = (lead.src || 'direct').toLowerCase();
            sourceMap.set(key, (sourceMap.get(key) || 0) + 1);
        }

        const sources = Array.from(sourceMap.entries())
            .map(([src, count]) => ({ src, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        const campaignRows = campaigns
            .map((item) => {
                const sent = safeNum(item.sent);
                const opened = safeNum(item.opened);
                const clicked = safeNum(item.clicked);
                const pageViews = safeNum(item.pageViews);
                const leadsCount = safeNum(item.leads);

                return {
                    name: item.rdName || item.event,
                    event: item.event,
                    sent,
                    opened,
                    clicked,
                    pageViews,
                    leads: leadsCount,
                    ctr: formatPercent(clicked, sent),
                    leadRate: formatPercent(leadsCount, pageViews)
                };
            })
            .sort((a, b) => b.leads - a.leads);

        return {
            campaigns,
            totalSent,
            totalOpened,
            totalClicked,
            totalPageViews,
            totalLeads,
            opportunities,
            eventsMissingCampaign,
            eventsMissingLead,
            leadsWithoutSrc,
            sources,
            campaignRows,
            openRate: formatPercent(totalOpened, totalSent),
            ctr: formatPercent(totalClicked, totalSent),
            visitToLead: formatPercent(totalLeads, totalPageViews),
            clickToLead: formatPercent(totalLeads, totalClicked)
        };
    }, [metrics, rdEvents, leads]);

    const funnelData = useMemo(() => {
        return [
            { stage: 'Enviados', value: summary.totalSent, color: '#6f7f91' },
            { stage: 'Abertos', value: summary.totalOpened, color: '#f4b942' },
            { stage: 'Clicados', value: summary.totalClicked, color: '#ff4f8b' },
            { stage: 'Visitas', value: summary.totalPageViews, color: '#34c3ff' },
            { stage: 'Leads', value: summary.totalLeads, color: '#43dd98' },
            { stage: 'Oportunidades', value: summary.opportunities, color: '#9f7bff' }
        ];
    }, [summary]);

    if (!isAuthenticated) {
        return (
            <main className="auth-shell">
                <motion.section initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="auth-card panel">
                    <div className="auth-orb" />
                    <div className="auth-brand">
                        <img src="/dashboard/logo-rosa.png" alt="Dois Mais" className="auth-logo" />
                        <span className="auth-chip">Network: Dois Mais Core</span>
                    </div>
                    <h1 className="auth-title">Acesso Assinado de Sessão</h1>
                    <p className="auth-subtitle">Gateway operacional RD · Turso · Redis</p>
                    <div className="auth-signal-grid">
                        <div className="auth-signal">
                            <ShieldCheck size={14} />
                            <span>Canal protegido</span>
                        </div>
                        <div className="auth-signal">
                            <Database size={14} />
                            <span>Dados auditáveis</span>
                        </div>
                        <div className="auth-signal">
                            <Activity size={14} />
                            <span>Fluxo em tempo real</span>
                        </div>
                    </div>
                    <form onSubmit={handleLogin} className="auth-form">
                        <input
                            type="password"
                            placeholder="Assinatura privada da sessão"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                        />
                        <button className="btn-primary" type="submit" disabled={loading}>
                            {loading ? 'Validando assinatura...' : 'Assinar e Entrar'}
                        </button>
                    </form>
                </motion.section>
            </main>
        );
    }

    return (
        <main className="app-shell">
            <header className="app-header panel">
                <div className="brand-block">
                    <img src="/dashboard/logo-rosa.png" alt="Dois Mais" className="brand-logo" />
                    <div>
                        <p className="brand-title">Dois Mais · Radar Operacional</p>
                        <p className="brand-subtitle">Cliente: Troia Produções</p>
                    </div>
                </div>
                <div className="header-actions">
                    <span className="last-update">
                        Atualizado: {metrics?.updatedAt ? new Date(metrics.updatedAt).toLocaleTimeString() : '--:--'}
                    </span>
                    <button className="ghost-btn" onClick={() => fetchData(password)}>
                        <RefreshCw size={16} />
                        <span>Atualizar</span>
                    </button>
                </div>
            </header>

            <section className="dashboard-grid">
                <div className="span-2"><KpiCard priority="1" title="Leads" value={formatNumber(summary.totalLeads)} subtitle="Turso · captação final" tone="green" icon={Users} /></div>
                <div className="span-2"><KpiCard priority="2" title="Oportunidades" value={formatNumber(summary.opportunities)} subtitle="RD Webhook · oportunidade" tone="purple" icon={Target} /></div>
                <div className="span-2"><KpiCard priority="3" title="Visitas" value={formatNumber(summary.totalPageViews)} subtitle="Redis · tráfego rastreado" tone="blue" icon={MousePointer2} /></div>
                <div className="span-2"><KpiCard priority="4" title="Emails Enviados" value={formatNumber(summary.totalSent)} subtitle="RD Campaign Analytics" tone="pink" icon={Send} /></div>
                <div className="span-2"><KpiCard priority="5" title="CTR" value={summary.ctr} subtitle="Clicados / Enviados" tone="yellow" icon={Mail} /></div>
                <div className="span-2"><KpiCard priority="6" title="Visita para Lead" value={summary.visitToLead} subtitle="Leads / Visitas" tone="slate" icon={Activity} /></div>

                <article className="panel span-8">
                    <div className="panel-headline">
                        <h2>Fluxo Consolidado do Funil</h2>
                        <p>Ordem de uso para reporte executivo</p>
                    </div>
                    <div className="chart-wrap">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={funnelData} layout="vertical" margin={{ top: 0, right: 24, left: 12, bottom: 0 }}>
                                <XAxis type="number" hide />
                                <YAxis dataKey="stage" type="category" width={110} tick={{ fill: '#9fb0bc', fontSize: 12 }} />
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                                    contentStyle={{
                                        background: 'rgba(10, 16, 22, 0.95)',
                                        border: '1px solid rgba(255,255,255,0.12)',
                                        borderRadius: 12,
                                        color: '#dce7ef'
                                    }}
                                />
                                <Bar dataKey="value" radius={[0, 12, 12, 0]} barSize={24}>
                                    {funnelData.map((item) => (
                                        <Cell key={item.stage} fill={item.color} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="metric-strip">
                        <div>
                            <span>Open Rate</span>
                            <strong>{summary.openRate}</strong>
                        </div>
                        <div>
                            <span>Click para Lead</span>
                            <strong>{summary.clickToLead}</strong>
                        </div>
                        <div>
                            <span>Campanhas Ativas</span>
                            <strong>{formatNumber(summary.campaigns.length)}</strong>
                        </div>
                    </div>
                </article>

                <article className="panel span-4">
                    <div className="panel-headline">
                        <h2>Fontes de Dados</h2>
                        <p>RD, Turso e Redis</p>
                    </div>
                    <ul className="source-list">
                        <li>
                            <span className="source-tag source-rd">RD</span>
                            <div>
                                <p>Email e automação</p>
                                <small>{formatNumber(summary.totalSent)} enviados · {summary.ctr} CTR</small>
                            </div>
                        </li>
                        <li>
                            <span className="source-tag source-redis">REDIS</span>
                            <div>
                                <p>Page views por evento</p>
                                <small>{formatNumber(summary.totalPageViews)} visitas rastreadas</small>
                            </div>
                        </li>
                        <li>
                            <span className="source-tag source-turso">TURSO</span>
                            <div>
                                <p>Leads e eventos persistidos</p>
                                <small>{formatNumber(leads.length)} linhas operacionais</small>
                            </div>
                        </li>
                    </ul>
                    <div className="quality-box">
                        <p><AlertTriangle size={14} /> Qualidade de dados</p>
                        <small>Sem campanha: {formatNumber(summary.eventsMissingCampaign)}</small>
                        <small>Sem contato: {formatNumber(summary.eventsMissingLead)}</small>
                        <small>Lead sem origem: {formatNumber(summary.leadsWithoutSrc)}</small>
                    </div>
                </article>

                <article className="panel span-12">
                    <div className="panel-headline">
                        <h2>Campanhas por Prioridade de Resultado</h2>
                        <p>Organizado por Leads, com taxas de execução</p>
                    </div>
                    <div className="table-wrap">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Campanha</th>
                                    <th>Enviados</th>
                                    <th>Abertos</th>
                                    <th>Clicados</th>
                                    <th>Visitas</th>
                                    <th>Leads</th>
                                    <th>CTR</th>
                                    <th>Conv. Visita</th>
                                </tr>
                            </thead>
                            <tbody>
                                {summary.campaignRows.map((row) => (
                                    <tr key={row.event}>
                                        <td>
                                            <strong>{row.name}</strong>
                                            <span>{row.event}</span>
                                        </td>
                                        <td>{formatNumber(row.sent)}</td>
                                        <td>{formatNumber(row.opened)}</td>
                                        <td>{formatNumber(row.clicked)}</td>
                                        <td>{formatNumber(row.pageViews)}</td>
                                        <td>{formatNumber(row.leads)}</td>
                                        <td>{row.ctr}</td>
                                        <td>{row.leadRate}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="panel span-4">
                    <div className="panel-headline">
                        <h2>Rastro por Origem</h2>
                        <p>Top fontes de entrada</p>
                    </div>
                    <ul className="source-ranking">
                        {summary.sources.map((item) => (
                            <li key={item.src}>
                                <span>{item.src}</span>
                                <strong>{formatNumber(item.count)}</strong>
                            </li>
                        ))}
                        {summary.sources.length === 0 && <li><span>Sem dados</span><strong>0</strong></li>}
                    </ul>
                </article>

                <article className="panel span-8">
                    <div className="panel-headline">
                        <h2>Eventos RD em Tempo Quase Real</h2>
                        <p>Webhook e rastros recentes</p>
                    </div>
                    <div className="table-wrap compact">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Quando</th>
                                    <th>Evento</th>
                                    <th>Campanha</th>
                                    <th>Contato</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rdEvents.slice(0, 12).map((item, index) => (
                                    <tr key={`${item.event_type || 'evt'}-${index}`}>
                                        <td>{new Date(item.occurred_at || item.created_at || Date.now()).toLocaleString()}</td>
                                        <td>{item.event_type || 'unknown'}</td>
                                        <td>{item.campaign_name || '--'}</td>
                                        <td>{maskEmail(item.lead_email)}</td>
                                    </tr>
                                ))}
                                {rdEvents.length === 0 && (
                                    <tr>
                                        <td colSpan={4}>Nenhum evento recente.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>

                <article className="panel span-12">
                    <div className="panel-headline">
                        <h2>Leads Operacionais (Turso)</h2>
                        <p>Base para reporte comercial e execução</p>
                    </div>
                    <div className="table-wrap compact">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Quando</th>
                                    <th>Evento</th>
                                    <th>Origem</th>
                                    <th>Contato</th>
                                    <th>Nome</th>
                                </tr>
                            </thead>
                            <tbody>
                                {leads.slice(0, 16).map((lead, index) => (
                                    <tr key={`${lead.email || lead.phone || 'lead'}-${index}`}>
                                        <td>{new Date(lead.created_at || Date.now()).toLocaleString()}</td>
                                        <td>{lead.event || '--'}</td>
                                        <td>{lead.src || 'direct'}</td>
                                        <td>{lead.email || lead.phone || '--'}</td>
                                        <td>{lead.name || '--'}</td>
                                    </tr>
                                ))}
                                {leads.length === 0 && (
                                    <tr>
                                        <td colSpan={5}>Nenhum lead capturado ainda.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </article>
            </section>

            <footer className="panel dashboard-footer">
                <div>
                    <ShieldCheck size={14} />
                    <span>Painel unificado de reporte: RD + Turso + Redis</span>
                </div>
                <div>
                    <Database size={14} />
                    <span>Sincronização automática a cada 30s</span>
                </div>
                <div>
                    <BarChart3 size={14} />
                    <span>Pronto para report comercial</span>
                </div>
            </footer>
        </main>
    );
}
