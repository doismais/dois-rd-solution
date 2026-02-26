export default async function handler(req, res) {
    const { code } = req.query;

    if (!code) {
        return res.status(400).json({ error: "code not provided" });
    }

    try {
        const response = await fetch(
            "https://api.rd.services/auth/token",
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    client_id: process.env.RD_CLIENT_ID,
                    client_secret: process.env.RD_CLIENT_SECRET,
                    redirect_uri: process.env.RD_REDIRECT_URI,
                    code
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            return res.status(response.status).json({
                ok: false,
                error: data
            });
        }

        // Na primeira execução, mostre o JSON no browser para copiar os tokens
        res.json({
            ok: true,
            received: true,
            access_token: data.access_token,
            refresh_token: data.refresh_token,
            expires_in: data.expires_in
        });
    } catch (error) {
        res.status(500).json({ ok: false, error: error.message });
    }
}
