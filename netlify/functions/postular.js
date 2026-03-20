// netlify/functions/postular.js
const https = require('https');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Metodo no permitido' };
  }

  const WEBHOOK = process.env.DISCORD_WEBHOOK;
  if (!WEBHOOK) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Webhook no configurado' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const { nombre, tel, email, ciudad, fotos } = body;

    if (!nombre || !tel || !email || !ciudad) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan campos obligatorios' }) };
    }

    // 1. Enviar embed con datos de la candidata
    const embed = {
      title: '🌹 Nueva Postulación — VELOUR',
      color: 7217710,
      fields: [
        { name: '👤 Nombre',    value: nombre, inline: true  },
        { name: '📞 Teléfono', value: tel,     inline: true  },
        { name: '📧 Correo',   value: email,   inline: false },
        { name: '📍 Ciudad',   value: ciudad,  inline: true  }
      ],
      footer: { text: 'VELOUR — Sistema de postulaciones' },
      timestamp: new Date().toISOString()
    };

    await sendJSON(WEBHOOK, {
      content: '**📋 Nueva candidata recibida**',
      embeds: [embed]
    });

    // 2. Enviar cada foto como archivo adjunto
    const poseLabels = ['01 — Frente', '02 — Lateral', '03 — Glúteos', '04 — Bustos'];
    const poseFnames = ['01_Frente', '02_Lateral', '03_Gluteos', '04_Bustos'];

    if (fotos && fotos.length > 0) {
      for (let i = 0; i < fotos.length; i++) {
        const foto = fotos[i];
        if (!foto || !foto.data) continue;

        const safe   = nombre.replace(/[^a-zA-Z0-9]/g, '_');
        const ext    = foto.ext || 'jpg';
        const fname  = `${poseFnames[i]}_${safe}.${ext}`;
        const label  = poseLabels[i];
        const buffer = Buffer.from(foto.data, 'base64');

        await sendFile(WEBHOOK, buffer, fname, `**${label}** — ${nombre}`, foto.tipo || 'image/jpeg');
      }
    }

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true })
    };

  } catch (e) {
    console.error('Error:', e);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: e.message })
    };
  }
};

// Enviar JSON puro a Discord
function sendJSON(url, payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    };
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(body);
        else reject(new Error(`Discord JSON error ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Enviar archivo a Discord via multipart
function sendFile(url, fileBuffer, filename, content, mimeType) {
  return new Promise((resolve, reject) => {
    const boundary = 'VelourBoundary' + Date.now();
    const payloadJson = JSON.stringify({ content });

    const partPayload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\n\r\n`),
      Buffer.from(payloadJson),
      Buffer.from('\r\n')
    ]);
    const partFile = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`),
      fileBuffer,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const body = Buffer.concat([partPayload, partFile]);

    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length
      }
    };
    const req = https.request(options, (res) => {
      let rb = '';
      res.on('data', chunk => rb += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(rb);
        else reject(new Error(`Discord file error ${res.statusCode}: ${rb}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}
