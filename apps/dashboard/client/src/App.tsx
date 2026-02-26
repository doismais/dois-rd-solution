import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, MousePointer2, Send, Activity, RefreshCw } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';

// --- Types ---
interface Campaign {
    event: string;
    rdName?: string;
    sent?: number;
    delivered?: number;
    opened?: number;
    clicked?: number;
    pageViews: number;
    leads: number;
}

// --- Components ---

const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className="card">
        <div className="flex justify-between items-start">
            <div>
                <p className="card-title">{title}</p>
                <h2 style={{ fontSize: '2rem', marginTop: '0.5rem' }}>{value}</h2>
            </div>
            <div style={{ background: `${color}20`, padding: '0.5rem', borderRadius: '10px' }}>
                <Icon size={20} color={color} />
            </div>
        </div>
    </div>
);

const FunnelCard = ({ campaign }: { campaign: Campaign }) => {
    const data = [
        { name: 'Enviados', value: campaign.sent || 0, color: '#8E8E93' },
        { name: 'Abertos', value: campaign.opened || 0, color: '#FFD600' },
        { name: 'Clicados', value: campaign.clicked || 0, color: '#FF007A' },
        { name: 'Visitas', value: campaign.pageViews, color: '#00D1FF' },
        { name: 'Leads', value: campaign.leads, color: '#00FF94' },
    ];

    return (
        <div className="card" style={{ gridColumn: 'span 6' }}>
            <div className="card-header">
                <div>
                    <h3 style={{ fontSize: '1.2rem' }}>{campaign.rdName || campaign.event.toUpperCase()}</h3>
                    <p className="card-title" style={{ fontSize: '0.7rem' }}>{campaign.event}</p>
                </div>
                <Activity size={18} color="var(--primary)" />
            </div>

            <div style={{ height: '300px', marginTop: '1rem' }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" stroke="#8E8E93" fontSize={12} width={80} />
                        <Tooltip
                            contentStyle={{ background: '#1C1C1E', border: '1px solid #242427', borderRadius: '10px' }}
                            cursor={{ fill: 'transparent' }}
                        />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                            {data.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>

            <div className="flex justify-between mt-4" style={{ borderTop: '1px solid var(--card-border)', paddingTop: '1rem' }}>
                <div className="text-center">
                    <p className="card-title" style={{ fontSize: '0.6rem' }}>Conversão</p>
                    <p style={{ fontWeight: 700 }}>{campaign.pageViews > 0 ? ((campaign.leads / campaign.pageViews) * 100).toFixed(1) : 0}%</p>
                </div>
                <div className="text-center">
                    <p className="card-title" style={{ fontSize: '0.6rem' }}>CTR (RD)</p>
                    <p style={{ fontWeight: 700 }}>{campaign.sent && campaign.sent > 0 ? ((campaign.clicked || 0) / campaign.sent * 100).toFixed(1) : 0}%</p>
                </div>
            </div>
        </div>
    );
};

export default function App() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<{ campaigns: Campaign[], updatedAt: string } | null>(null);
    const [rdEvents, setRdEvents] = useState<any[]>([]);

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        localStorage.setItem('_dm_auth', password);
        fetchData(password);
    };

    const fetchData = async (token: string) => {
        try {
            const [metricsRes, eventsRes] = await Promise.all([
                fetch('/api/metrics', { headers: { 'x-secret': token } }),
                fetch('/api/rd/events', { headers: { 'x-secret': token } })
            ]);

            if (metricsRes.ok) {
                const json = await metricsRes.json();
                setData(json);
                setIsAuthenticated(true);
            }

            if (eventsRes.ok) {
                const events = await eventsRes.json();
                setRdEvents(events);
            }

            if (!metricsRes.ok && !eventsRes.ok) {
                alert('Acesso negado');
                setIsAuthenticated(false);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const saved = localStorage.getItem('_dm_auth');
        if (saved) {
            setPassword(saved);
            fetchData(saved);
        }

        const interval = setInterval(() => {
            const token = localStorage.getItem('_dm_auth');
            if (token) fetchData(token);
        }, 30000); // 30s auto-refresh

        return () => clearInterval(interval);
    }, []);

    if (!isAuthenticated) {
        return (
            <div className="flex items-center justify-center" style={{ minHeight: '100vh', padding: '1rem' }}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="card"
                    style={{ maxWidth: '400px', width: '100%', textAlign: 'center' }}
                >
                    <img src="/logo-rosa.png" alt="Dois Mais" style={{ height: '40px', marginBottom: '2rem' }} />
                    <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Acesso Restrito</h1>
                    <form onSubmit={handleLogin}>
                        <input
                            type="password"
                            placeholder="Digite sua senha"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            style={{ marginBottom: '1rem' }}
                        />
                        <button className="btn-primary" style={{ width: '100%' }} disabled={loading}>
                            {loading ? 'Entrando...' : 'Entrar'}
                        </button>
                    </form>
                </motion.div>
            </div>
        );
    }

    return (
        <div style={{ paddingBottom: '4rem' }}>
            {/* Header */}
            <header style={{ padding: '1.5rem', borderBottom: '1px solid var(--card-border)', background: '#0A0A0B' }}>
                <div className="flex justify-between items-center max-w-[1400px] margin-[0_auto]">
                    <div className="flex items-center gap-2">
                        <img src="/logo-rosa.png" alt="Dois Mais" style={{ height: '24px' }} />
                        <div style={{ width: '1px', height: '20px', background: 'var(--card-border)', margin: '0 10px' }}></div>
                        <p style={{ fontWeight: 600 }}>Troia Produções</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <p className="card-title" style={{ fontSize: '0.7rem' }}>
                            Atualizado: {data?.updatedAt ? new Date(data.updatedAt).toLocaleTimeString() : '--:--'}
                        </p>
                        <button
                            onClick={() => fetchData(password)}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                        >
                            <RefreshCw size={16} />
                        </button>
                    </div>
                </div>
            </header>

            {/* Grid */}
            <div className="bento-grid">
                {/* Sumário */}
                <div style={{ gridColumn: 'span 3' }}>
                    <StatCard title="Total Leads" value={data?.campaigns.reduce((acc, c) => acc + c.leads, 0) || 0} icon={Users} color="#00FF94" />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <StatCard title="Page Views" value={data?.campaigns.reduce((acc, c) => acc + c.pageViews, 0) || 0} icon={MousePointer2} color="#00D1FF" />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <StatCard title="Emails Enviados" value={data?.campaigns.reduce((acc, c) => acc + (c.sent || 0), 0) || 0} icon={Send} color="#FF007A" />
                </div>
                <div style={{ gridColumn: 'span 3' }}>
                    <StatCard title="Taxa Média Conv." value={(
                        ((data?.campaigns || []).reduce((acc, c) => acc + (c.pageViews > 0 ? (c.leads / c.pageViews) : 0), 0)
                            / (data?.campaigns?.length || 1)) * 100
                    ).toFixed(1) + '%'} icon={Activity} color="#FFD600" />
                </div>

                {/* Campanhas */}
                {data?.campaigns.map((c, i) => (
                    <FunnelCard key={i} campaign={c} />
                ))}

                {/* Placeholder para Tabela de Leads (Fase 4.3) */}
                <div className="card" style={{ gridColumn: 'span 12', marginTop: '1rem' }}>
                    <h3 style={{ marginBottom: '1.5rem' }}>Últimos Leads (Interações WhatsApp)</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--card-border)' }}>
                                    <th style={{ padding: '1rem 0' }} className="card-title">Data</th>
                                    <th style={{ padding: '1rem 0' }} className="card-title">Campanha</th>
                                    <th style={{ padding: '1rem 0' }} className="card-title">Origem</th>
                                    <th style={{ padding: '1rem 0' }} className="card-title">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {/* Tabela será populada via /api/leads na versão final */}
                                {rdEvents.length > 0 ? rdEvents.map((event: any, idx: number) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid #1C1C1E' }}>
                                        <td style={{ padding: '1rem 0' }}>{new Date(event.occurred_at || event.created_at).toLocaleString()}</td>
                                        <td style={{ padding: '1rem 0' }}>{event.campaign_name || '--'}</td>
                                        <td style={{ padding: '1rem 0' }}>{event.event_type}</td>
                                        <td style={{ padding: '1rem 0' }}>
                                            <span style={{ color: event.event_type.includes('click') ? '#00FF94' : '#FFD600' }}>
                                                ● {event.lead_email?.split('@')[0].slice(0, 3)}***
                                            </span>
                                        </td>
                                    </tr>
                                )) : (
                                    <tr style={{ borderBottom: '1px solid #1C1C1E' }}>
                                        <td style={{ padding: '1rem 0' }} colSpan={4}>Nenhuma atividade recente encontrada</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
