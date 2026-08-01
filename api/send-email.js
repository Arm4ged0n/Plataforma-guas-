// api/send-email.js
// Envia o e-mail de alerta via Resend. Precisa da variável de ambiente
// RESEND_API_KEY configurada no painel da Vercel (Settings > Environment Variables).
//
// IMPORTANTE sobre o Resend: contas novas, sem domínio verificado, só conseguem
// enviar pro e-mail que você usou pra criar a conta Resend (modo "sandbox").
// Pra mandar pra qualquer e-mail, precisa verificar um domínio próprio depois.
// Pra teste agora, use o mesmo e-mail da sua conta Resend como destinatário.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Use POST' });
  }

  const { email, stationName, cota, status, max } = req.body || {};

  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'E-mail de destino inválido' });
  }

  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ ok: false, error: 'RESEND_API_KEY não configurada no servidor' });
  }

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev', // domínio de teste do Resend — funciona sem verificação
        to: [email],
        subject: `⚠️ ${status} — ${stationName}`,
        html: `
          <h2>Alerta: ${stationName}</h2>
          <p><strong>Status:</strong> ${status}</p>
          <p><strong>Cota atual:</strong> ${cota}m (máxima: ${max}m)</p>
          <p style="color:#888; font-size:12px;">Enviado pela Plataforma Interativa — Fluxo de Águas RS</p>
        `,
      }),
    });

    const resultado = await resp.json();

    if (!resp.ok) {
      // Devolve o erro real do Resend — não engole o erro
      return res.status(resp.status).json({ ok: false, error: resultado.message || 'Erro no Resend', detalhe: resultado });
    }

    return res.status(200).json({ ok: true, id: resultado.id });
  } catch (err) {
    return res.status(502).json({ ok: false, error: err.message });
  }
}
