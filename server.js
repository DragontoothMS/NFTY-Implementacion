/**
 * server.js — Bot de WhatsApp simple (test)
 *
 * COMPORTAMIENTO:
 * - Responde a CUALQUIER mensaje con UN mensaje fijo de prueba
 * - Sin Supabase, sin estado, sin desactivación
 * - Solo markAsRead + typing + 1 mensaje de texto
 * - Notificación a ntfy.sh al enviar respuesta
 */
var http = require('http');
var https = require('https');
require('dotenv').config();

var kapso = require('./kapso-client');

var PORT = process.env.PORT || 3001;
var PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Mensaje fijo de prueba
var TEST_MESSAGE = '✅ Bot de prueba funcionando — mensaje único sin BD ni estado';

// Tópico ntfy para notificaciones
var NTFY_TOPIC = 'hermes_7f92k_agent_4x8p';

// Set para deduplicar messageIds (evita bucle por webhooks duplicados de Kapso)
var processedMessageIds = new Set();

// ──────────────────────────────────────────────────────────────
// UTILIDADES
// ──────────────────────────────────────────────────────────────

/** Extrae el número de teléfono del cliente del webhook de Kapso. */
function extractPhone(entry, rawBody) {
  try {
    // --- Formato REAL de Kapso v2 (flat) ---
    if (rawBody) {
      var payload = JSON.parse(rawBody);
      if (payload.message && payload.message.from) {
        return normalizeFrom(payload.message.from);
      }
      if (payload.conversation && payload.conversation.phone_number) {
        return normalizeFrom(payload.conversation.phone_number);
      }
    }

    // --- Formato legacy ---
    if (Array.isArray(entry) && entry.length > 0) {
      var value = entry[0].changes && entry[0].changes[0] && entry[0].changes[0].value;
      if (value) {
        var messages = value.messages || [];
        if (messages.length > 0 && messages[0].from) {
          return normalizeFrom(messages[0].from);
        }
        var contacts = value.contacts || [];
        if (contacts.length > 0 && contacts[0].wa_id) {
          return normalizeFrom(contacts[0].wa_id);
        }
      }
      for (var i = 0; i < entry.length; i++) {
        var changes = entry[i].changes || [];
        for (var j = 0; j < changes.length; j++) {
          var msg = changes[j].value && changes[j].value.messages && changes[j].value.messages[0];
          if (msg && msg.from) return normalizeFrom(msg.from);
        }
      }
    }
  } catch (e) {
    console.error('[server] extractPhone error:', e.message);
  }
  return '';
}

/** Normaliza el número: strip 'waid:', '+', espacios. */
function normalizeFrom(raw) {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    .toString()
    .replace(/^waid:/, '')
    .replace(/^[^0-9]/g, '')
    .replace(/[^\d]/g, '')
    .trim();
}

/** Extrae el message_id para marcar como leído. */
function extractMessageId(entry) {
  try {
    var messages = entry[0].changes && entry[0].changes[0] && entry[0].changes[0].value && entry[0].changes[0].value.messages || [];
    if (messages.length > 0) return messages[0].id || '';
  } catch (e) {}
  return '';
}

// ──────────────────────────────────────────────────────────────
// NTFY NOTIFICACIONES
// ──────────────────────────────────────────────────────────────

/**
 * Envía notificación a ntfy.sh con formato simple que funciona
 * @param {string} title - Título de la notificación
 * @param {string} message - Mensaje principal
 * @param {Object} options - Opciones adicionales
 * @param {string} options.priority - Prioridad (1-5, default 3)
 * @param {string} options.tags - Tags separados por comas
 * @param {string} options.click - URL al hacer click
 * @param {Object} options.extra - Campos extra para el body
 */
function sendNtfyNotification(title, message, options = {}) {
  var priority = options.priority || '3';
  var tags = options.tags || 'robot,whatsapp,white_check_mark';
  var click = options.click || '';
  var extra = options.extra || {};

  // Mensaje simple sin emojis/markdown que causan problemas con ntfy
  var formattedMessage = title + '\n\n' + message + '\n\n' +
    '-------------------------\n' +
    'Enviado por: WhatsApp (Kapso)\n' +
    'Bot: botTaller-test\n' +
    'Hora: ' + new Date().toLocaleString('es-BO', { timeZone: 'America/La_Paz' }) + '\n';

  if (extra.phone) {
    formattedMessage += 'Telefono: ' + extra.phone + '\n';
  }
  if (extra.messageId) {
    formattedMessage += 'Message ID: ' + extra.messageId + '\n';
  }
  if (extra.webhookEvent) {
    formattedMessage += 'Evento: ' + extra.webhookEvent + '\n';
  }

  var postData = formattedMessage;
  var ntfyUrl = 'https://ntfy.sh/' + NTFY_TOPIC;

  return new Promise(function (resolve, reject) {
    var req = https.request({
      hostname: 'ntfy.sh',
      path: '/' + NTFY_TOPIC,
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Title': title,
        'Priority': String(priority),
        'Tags': tags,
        'Click': click,
        'Icon': 'https://cdn.jsdelivr.net/gh/twitter/twemoji@14.0.2/assets/72x72/1f4e1.png'
      }
    }, function (res) {
      var data = '';
      res.on('data', function (chunk) { data += chunk; });
      res.on('end', function () {
        console.log('[ntfy] Notificación enviada, status:', res.statusCode);
        resolve(res.statusCode);
      });
    });
    req.on('error', function (e) {
      console.error('[ntfy] Error enviando notificación:', e.message);
      reject(e);
    });
    req.write(postData);
    req.end();
  });
}

// ──────────────────────────────────────────────────────────────
// LÓGICA DEL BOT — SIMPLE
// ──────────────────────────────────────────────────────────────

async function sendTestMessage(to, messageId) {
  console.log('[server] Enviando mensaje de prueba a:', to);

  // 1. Mark as read + typing
  if (messageId) {
    try {
      await kapso.markAsRead(messageId);
      console.log('[server] markAsRead OK');
    } catch (e) {
      console.error('[server] markAsRead falló:', e.message);
    }
  }

  // 2. Enviar mensaje único
  try {
    var res = await kapso.sendMessage(to, TEST_MESSAGE);
    console.log('[server] Mensaje enviado, status:', res.status);

    // 3. Enviar notificación a ntfy
        await sendNtfyNotification(
          'WhatsApp Enviado',
          'Mensaje de prueba entregado correctamente',
          {
            priority: '4',
            tags: 'robot,whatsapp,check,rocket',
            click: 'https://ntfy.sh/hermes_7f92k_agent_4x8p',
            extra: {
              phone: to,
              messageId: messageId
            }
          }
        );
  } catch (e) {
    console.error('[server] Error enviando mensaje:', e.message);
  }
}

// ──────────────────────────────────────────────────────────────
// MANEJO DE WEBHOOK
// ──────────────────────────────────────────────────────────────

async function handleIncomingMessage(from, messageId) {
  if (!from) {
    console.warn('[server] Mensaje sin número de teléfono, ignorado.');
    return;
  }
  console.log('[webhook] Mensaje entrante de:', from, '| id:', messageId);
  await sendTestMessage(from, messageId);
}

// ──────────────────────────────────────────────────────────────
// SERVIDOR HTTP
// ──────────────────────────────────────────────────────────────

var server = http.createServer(function (req, res) {
  // Health check
  if (req.method === 'GET' && (req.url === '/' || req.url === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      bot: 'botTaller-test',
      description: 'Bot simple: 1 mensaje fijo de prueba, sin BD, sin estado'
    }));
    return;
  }

  // Webhook de Kapso: POST /
  if (req.method === 'POST' && (req.url === '/' || req.url === '/webhook')) {
    var body = '';
    req.on('data', function (chunk) { body += chunk; });
    req.on('end', function () {
      // Responder rápido 200 a Kapso
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: true }));

      // Procesar asíncronamente
      try {
        var webhookEvent = req.headers['x-webhook-event'] || '';
        var skipEvents = [
          'whatsapp.message.sent',
          'whatsapp.message.delivered',
          'whatsapp.message.read',
          'whatsapp.conversation.created',
          'whatsapp.conversation.ended',
          'whatsapp.conversation.inactive',
          'whatsapp.contact.identity_changed',
          'whatsapp.contact.marketing_preference_changed',
        ];
        if (webhookEvent && skipEvents.indexOf(webhookEvent) !== -1) {
          console.log('[webhook] Evento ignorado:', webhookEvent);
          return;
        }

        var payload = JSON.parse(body);
        var from = extractPhone(payload.entry || [], body);
        var messageId = '';
        if (payload.message && payload.message.id) {
          messageId = payload.message.id;
        } else {
          messageId = extractMessageId(payload.entry || []);
        }

        // Deduplicación: ignorar messageIds ya procesados
        if (messageId && processedMessageIds.has(messageId)) {
          console.log('[webhook] Duplicado ignorado:', messageId);
          return;
        }
        if (messageId) {
          processedMessageIds.add(messageId);
        }

        console.log('[webhook] Mensaje entrante de:', from, '| id:', messageId);
        handleIncomingMessage(from, messageId);
      } catch (e) {
        console.error('[webhook] Error procesando payload:', e.message);
        console.error('[webhook] Body:', body.substring(0, 200));
      }
    });
    return;
  }

  // Endpoint test local
  if (req.method === 'POST' && req.url === '/test') {
    var body3 = '';
    req.on('data', function (chunk) { body3 += chunk; });
    req.on('end', async function () {
      try {
        var parsed = JSON.parse(body3);
        var from = parsed.from;
        var fakePayload = {
          message: {
            id: 'test-msg-' + Date.now(),
            from: from,
            type: 'text',
            text: { body: parsed.text || 'hola' },
          },
          conversation: {
            phone_number: from,
            phone_number_id: PHONE_NUMBER_ID || '123456789',
          },
          is_new_conversation: true,
          phone_number_id: PHONE_NUMBER_ID || '123456789',
        };
        var phone = extractPhone([], JSON.stringify(fakePayload));
        var msgId = fakePayload.message.id;
        await handleIncomingMessage(phone, msgId);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          processed: true,
          from: phone,
          bubbles_sent: 1,
          types: ['text']
        }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, function () {
  console.log('=========================================');
  console.log('  botTaller — Bot SIMPLE (test)');
  console.log('  Puerto: ' + PORT);
  console.log('  Kapso Phone ID: ' + PHONE_NUMBER_ID);
  console.log('  Mensaje: ' + TEST_MESSAGE);
  console.log('  ntfy Topic: ' + NTFY_TOPIC);
  console.log('=========================================');
  console.log('');
  console.log('Rutas:');
  console.log('  GET  /           → health check');
  console.log('  POST /           → webhook de Kapso');
  console.log('  POST /webhook    → webhook de Kapso (alias)');
  console.log('  POST /test       → simular webhook (debug)');
  console.log('');
  console.log('Estado de variables de entorno:');
  console.log('  KAPSO_API_KEY:', process.env.KAPSO_API_KEY ? 'configurada' : 'FALTA');
  console.log('  PHONE_NUMBER_ID:', PHONE_NUMBER_ID ? 'configurado' : 'FALTA');
  console.log('');
});
