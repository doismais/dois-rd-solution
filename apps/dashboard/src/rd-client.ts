import { createClient, Client } from '@libsql/client';

export interface RDToken {
    access_token: string;
    refresh_token: string;
    expires_at: number; // timestamp in seconds
}

export class RDClient {
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;
    public db: Client;

    constructor() {
        this.clientId = process.env.RD_CLIENT_ID || '';
        this.clientSecret = process.env.RD_CLIENT_SECRET || '';
        this.redirectUri = process.env.RD_REDIRECT_URI || '';
        this.db = createClient({
            url: process.env.TURSO_DATABASE_URL || '',
            authToken: process.env.TURSO_AUTH_TOKEN || '',
        });
    }

    async getAuthUrl(): Promise<string> {
        return `https://api.rd.services/auth/dialog?client_id=${this.clientId}&redirect_uri=${this.redirectUri}`;
    }

    async handleCallback(code: string): Promise<void> {
        const response = await fetch('https://api.rd.services/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
            }),
        });

        const data = await response.json() as any;
        if (!response.ok) throw new Error(`RD Token Error: ${JSON.stringify(data)}`);

        await this.saveTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        });
    }

    private async ensureTokenTableSchema(): Promise<void> {
        await this.db.execute(`
      CREATE TABLE IF NOT EXISTS rd_tokens (
        id            INTEGER PRIMARY KEY DEFAULT 1,
        access_token  TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        expires_at    INTEGER NOT NULL,
        updated_at    TEXT NOT NULL
      )
    `);

        const tableInfo = await this.db.execute("PRAGMA table_info(rd_tokens)");
        const columns = new Set(
            tableInfo.rows.map((row: any) => String(row.name))
        );

        if (!columns.has('expires_at')) {
            await this.db.execute("ALTER TABLE rd_tokens ADD COLUMN expires_at INTEGER");
            await this.db.execute("UPDATE rd_tokens SET expires_at = 0 WHERE expires_at IS NULL");
        }

        if (!columns.has('updated_at')) {
            await this.db.execute("ALTER TABLE rd_tokens ADD COLUMN updated_at TEXT");
            await this.db.execute("UPDATE rd_tokens SET updated_at = datetime('now') WHERE updated_at IS NULL OR updated_at = ''");
        }
    }

    private async saveTokens(tokens: RDToken): Promise<void> {
        await this.ensureTokenTableSchema();
        await this.db.execute({
            sql: "INSERT OR REPLACE INTO rd_tokens (id, access_token, refresh_token, expires_at, updated_at) VALUES (1, ?, ?, ?, datetime('now'))",
            args: [tokens.access_token, tokens.refresh_token, tokens.expires_at]
        });
    }

    async getValidToken(): Promise<string | null> {
        await this.ensureTokenTableSchema();
        const result = await this.db.execute("SELECT * FROM rd_tokens WHERE id = 1");
        if (result.rows.length === 0) return null;

        const token = result.rows[0] as any;
        const expiresAt = Number(token.expires_at || 0);
        const now = Math.floor(Date.now() / 1000);

        // Refresh if expiring in less than 5 minutes
        if (expiresAt - now < 300) {
            return this.refreshToken(token.refresh_token);
        }

        return token.access_token;
    }

    private async refreshToken(refreshToken: string): Promise<string> {
        const response = await fetch('https://api.rd.services/auth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
            }),
        });

        const data = await response.json() as any;
        if (!response.ok) throw new Error(`RD Refresh Error: ${JSON.stringify(data)}`);

        await this.saveTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        });

        return data.access_token;
    }

    async fetchEmailAnalytics(startDate: string, endDate: string): Promise<any[]> {
        const token = await this.getValidToken();
        if (!token) throw new Error('No valid RD Station token found. Please authenticate.');

        const response = await fetch(`https://api.rd.services/platform/analytics/emails?start_date=${startDate}&end_date=${endDate}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        const data = await response.json() as any;
        if (!response.ok) throw new Error(`RD Analytics Error: ${JSON.stringify(data)}`);

        return data.emails || [];
    }
}
