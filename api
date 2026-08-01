import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido' });
    }

    const { email, stationName, cota, status, max } = req.body;

    try {
        const data = await resend.emails.send({
            from: 'Plataforma Águas <onboarding@resend.dev>',
            to: [email || 'sandrofagun@gmail.com'],
            subject: `⚠️ Alerta na Estação: ${stationName}`,
            html: `<h3>Alerta Crítico</h3><p>A estação <b>${stationName}</b> atingiu a cota ${cota}.</p>`
        });
        return res.status(200).json({ success: true, data });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
