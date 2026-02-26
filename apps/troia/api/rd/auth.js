export default function handler(req, res) {
    const params = new URLSearchParams({
        client_id: process.env.RD_CLIENT_ID,
        redirect_uri: process.env.RD_REDIRECT_URI,
        response_type: "code"
    });

    const url = `https://api.rd.services/auth/dialog?${params.toString()}`;
    res.writeHead(302, { Location: url });
    res.end();
}
