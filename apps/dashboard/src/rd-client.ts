import { createClient, Client } from '@libsql/client';

export interface RDToken {
    access_token: string;
    refresh_token: string;
    expires_at: number; // timestamp in seconds
}

export interface RDEmail {
    id: string;
    name: string;
    created_at?: string | null;
    updated_at?: string | null;
    send_at?: string | null;
    leads_count?: number | null;
    status?: string | null;
    type?: string | null;
    is_predictive_sending?: boolean | null;
    sending_is_imminent?: boolean | null;
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
        console.log('[RDClient] Exchanging authorization code for tokens');
        const response = await fetch('https://api.rd.services/auth/token?token_by=code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
            }),
        });

        const data = await this.parseJsonSafe(response);
        if (!response.ok) throw new Error(`RD Token Error [${response.status}]: ${JSON.stringify(data)}`);

        await this.saveTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        });
        console.log('[RDClient] OAuth tokens saved');
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
        console.log('[RDClient] Refreshing RD access token');
        const response = await fetch('https://api.rd.services/auth/token?token_by=refresh_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                refresh_token: refreshToken,
            }),
        });

        const data = await this.parseJsonSafe(response);
        if (!response.ok) throw new Error(`RD Refresh Error [${response.status}]: ${JSON.stringify(data)}`);

        await this.saveTokens({
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600),
        });

        console.log('[RDClient] RD token refreshed and persisted');
        return data.access_token;
    }

    private async forceRefreshFromStorage(): Promise<string | null> {
        await this.ensureTokenTableSchema();
        const result = await this.db.execute("SELECT refresh_token FROM rd_tokens WHERE id = 1");
        if (result.rows.length === 0) return null;

        const refreshToken = String((result.rows[0] as any).refresh_token || '');
        if (!refreshToken) return null;

        return this.refreshToken(refreshToken);
    }

    private async fetchWithTokenValidation(url: string): Promise<Response> {
        const endpoint = this.toEndpointLabel(url);
        const accessToken = await this.getValidToken();
        if (!accessToken) {
            throw new Error('No valid RD Station token found. Please authenticate.');
        }

        console.log(`[RDClient] Requesting ${endpoint}`);
        let response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        console.log(`[RDClient] ${endpoint} status=${response.status}`);

        if (response.status !== 401) {
            return response;
        }

        console.warn(`[RDClient] ${endpoint} returned 401, trying refresh`);
        const refreshedToken = await this.forceRefreshFromStorage();
        if (!refreshedToken) {
            console.warn(`[RDClient] ${endpoint} refresh token unavailable`);
            return response;
        }

        response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${refreshedToken}` }
        });
        console.log(`[RDClient] ${endpoint} retry status=${response.status}`);

        return response;
    }

    async fetchEmailAnalytics(startDate: string, endDate: string): Promise<any[]> {
        const response = await this.fetchWithTokenValidation(
            `https://api.rd.services/platform/analytics/emails?start_date=${startDate}&end_date=${endDate}`
        );

        const data = await this.parseJsonSafe(response);
        if (!response.ok) throw new Error(`RD Analytics Error [${response.status}]: ${JSON.stringify(data)}`);

        const items = data.emails || [];
        console.log(`[RDClient] Analytics emails received=${Array.isArray(items) ? items.length : 0}`);
        return items;
    }

    async fetchEmails(perPage = 100, maxPages = 10): Promise<RDEmail[]> {
        const items: RDEmail[] = [];

        for (let page = 1; page <= maxPages; page++) {
            const response = await this.fetchWithTokenValidation(
                `https://api.rd.services/platform/emails?page=${page}&per_page=${perPage}`
            );

            const data = await this.parseJsonSafe(response);
            if (!response.ok) throw new Error(`RD Emails Error [${response.status}] page=${page}: ${JSON.stringify(data)}`);

            const pageItemsRaw = this.extractEmailItems(data);
            const pageItems = pageItemsRaw.map((item: any) => ({
                id: String(item.id),
                name: String(item.name || `email-${item.id}`),
                created_at: item.created_at || null,
                updated_at: item.updated_at || null,
                send_at: item.send_at || null,
                leads_count: item.leads_count ?? null,
                status: item.status || null,
                type: item.type || null,
                is_predictive_sending: item.is_predictive_sending ?? null,
                sending_is_imminent: item.sending_is_imminent ?? null,
            })) as RDEmail[];

            items.push(...pageItems);
            console.log(`[RDClient] Emails page=${page} items=${pageItems.length} accumulated=${items.length}`);

            const hasNext = this.hasNextEmailPage(data, page, pageItems.length, perPage);
            if (!hasNext) break;
        }

        console.log(`[RDClient] Emails total=${items.length}`);
        return items;
    }

    private extractEmailItems(data: any): any[] {
        if (Array.isArray(data)) return data;
        if (Array.isArray(data?.items)) return data.items;
        if (Array.isArray(data?.emails)) return data.emails;
        return [];
    }

    private hasNextEmailPage(data: any, page: number, itemCount: number, perPage: number): boolean {
        if (typeof data?.total_pages === 'number' && typeof data?.page === 'number') {
            return data.page < data.total_pages;
        }

        if (typeof data?.next_page === 'number') {
            return data.next_page > page;
        }

        if (data?.next_page) {
            return true;
        }

        if (data?.pagination?.next_page) {
            return true;
        }

        return itemCount === perPage;
    }

    private async parseJsonSafe(response: Response): Promise<any> {
        const text = await response.text();
        if (!text) return {};
        try {
            return JSON.parse(text);
        } catch {
            return { raw: text };
        }
    }

    private toEndpointLabel(url: string): string {
        try {
            const parsed = new URL(url);
            return `${parsed.pathname}${parsed.search}`;
        } catch {
            return url;
        }
    }
}
