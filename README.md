# NFTY Implementación - Notificaciones Push para WhatsApp Bot

Implementación de notificaciones push usando **ntfy.sh** para un bot de WhatsApp que recibe mensajes vía Kapso webhook y envía notificaciones push al recibir mensajes.

## Arquitectura

```
WhatsApp → Kapso Webhook (POST /) → server.js
                                    ↓
                          Procesa mensaje entrante
                                    ↓
                          Envía respuesta por WhatsApp (Kapso API)
                                    ↓
                          Envía notificación push → ntfy.sh
                                    ↓
                          Push notification → App ntfy/Android
```

## Componentes Principales

### 1. server.js - Servidor HTTP + Webhook Handler
- Recibe webhooks de Kapso (payload v2 flat)
- Procesa mensajes entrantes de WhatsApp
- Envía respuesta automática via Kapso API
- Envía notificación push via ntfy.sh
- Deduplicación de messageIds para evitar bucles

### 2. kapso-client.js - Cliente Kapso API
- Envío de mensajes de texto
- markAsRead + typing indicator
- Compatible con Kapso API v24.0

### 3. ntfy.sh Integration
- **Topic**: `hermes_7f92k_agent_4x8p`
- **Endpoint**: `https://ntfy.sh/hermes_7f92k_agent_4x8p`
- **Formato**: Plain text (sin emojis/markdown en el body para evitar attachments)
- **Headers**: Title, Priority, Tags, Click, Icon

## Configuración

### Variables de Entorno (.env)
```bash
KAPSO_API_KEY=           # X-API-Key de Kapso (dashboard.kapso.ai)
PHONE_NUMBER_ID=         # Phone Number ID de Meta/Kapso
PORT=3001
```

**Nota**: No se requieren credenciales de Supabase para esta implementación simplificada.

### ntfy Topic
```
Topic: hermes_7f92k_agent_4x8p
URL: https://ntfy.sh/hermes_7f92k_agent_4x8p
```

## Implementación de Notificaciones ntfy

### Función Principal: `sendNtfyNotification()`

```javascript
async function sendNtfyNotification(title, message, options = {}) {
  var priority = options.priority || '3';
  var tags = options.tags || 'robot,whatsapp,check';
  var click = options.click || '';
  var extra = options.extra || {};

  // Mensaje simple sin emojis/markdown (evita que ntfy trate el body como attachment)
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
    req.write(formattedMessage);
    req.end();
  });
}
```

### Formato de Notificación (Plain Text)
```
WhatsApp Enviado

Mensaje de prueba entregado correctamente

-------------------------
Enviado por: WhatsApp (Kapso)
Bot: botTaller-test
Hora: 2/10/2026, 14:30:25
Telefono: 59162077532
Message ID: wamid.HBgLNTkxNjIwNzc1MzIVAgASGBYzRUIwMkU4NkQ4RkRBQ0U2ODgxNkZBAA==
```

### Puntos Clave de la Implementación:
1. **Plain text only** - Sin emojis/markdown en el body para evitar que ntfy lo trate como attachment
2. **Headers HTTP estándar** - Title, Priority, Tags, Click, Icon via headers HTTP
3. **Content-Type: text/plain; charset=utf-8** - Importante para encoding correcto
4. **No emojis/markdown en headers** - Solo ASCII en Title y Tags

## Uso

### 1. Configurar ngrok (puerto 3001)
```bash
ngrok http 3001 --url=hungerless-uncrystalled-andy.ngrok-free.dev
```

### 2. Configurar Webhook en Kapso
```bash
curl -X POST "https://api.kapso.ai/v1/webhooks" \
  -H "X-API-Key: TU_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://hungerless-uncrystalled-andy.ngrok-free.dev/","events":["message_received"]}'
```

### 3. Iniciar Bot
```bash
cd botTaller-main
start.bat
```

### 3. Probar
```bash
# Health check
curl http://localhost:3001/

# Test webhook
curl -X POST http://localhost:3001/test \
  -H 'Content-Type: application/json' \
  -d '{"from":"59162077532","text":"hola"}'

# Test ntfy directo
curl -X POST "https://ntfy.sh/hermes_7f92k_agent_4x8p" \
  -H "Title: Test" \
  -H "Priority: 4" \
  -H "Tags: robot,whatsapp" \
  -d "Test notificacion
Telefono: 59162077532"
```

## Flujo Completo

1. **Usuario** envía WhatsApp → número sandbox
2. **Kapso** → webhook a ngrok → bot local
3. **Bot** → `markAsRead` + `typing` → envía respuesta WhatsApp
4. **Bot** → `sendNtfyNotification()` → ntfy.sh
5. **ntfy** → Push notification a tu app Android

## Notas Importantes

- **Sin credenciales en repo** - `.env` está en `.gitignore`
- **Sin Supabase requerido** - Implementación simplificada sin base de datos
- **Solo ASCII en headers** - ntfy rechaza emojis en headers HTTP (Title, Tags)
- **Plain text body** - Sin markdown/emojis en body para evitar attachments
- **Sandbox mode** - Usa Phone Number ID de sandbox para testing sin verificación Meta

## Testing

```bash
# Health check
curl http://localhost:3001/

# Test webhook
curl -X POST http://localhost:3001/test   -H 'Content-Type: application/json' \
  -d '{"from":"59162077532","text":"hola"}'

# Verificar ntfy
curl https://ntfy.sh/hermes_7f92k_agent_4x8p
```
