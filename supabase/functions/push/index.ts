/**
 * Edge Function `push` — рассылка FCM v1 по строке notifications.
 *
 * Вызывается триггером trg_call_push (pg_net) с body {id} на каждую вставку в
 * notifications. Берёт строку (только pushed=false), токены получателя из
 * device_tokens, шлёт FCM v1 и помечает pushed=true. Мёртвые токены удаляет.
 *
 * Секреты (Dashboard → Edge Functions → Secrets):
 *   FCM_SERVICE_ACCOUNT — содержимое JSON сервис-аккаунта Firebase (целиком).
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — заданы платформой автоматически.
 *
 * Деплой из дашборда: Edge Functions → Deploy new function → имя `push`,
 * вставить этот файл, ВЫКЛЮЧИТЬ «Verify JWT» (зовёт pg_net, не пользователь).
 */
import { createClient } from 'jsr:@supabase/supabase-js@2';

const PUSH_KEY = 'astra-push-7c41d9ae';   // должен совпадать с call_push() в schema.sql

// --- OAuth-токен Google из сервис-аккаунта (RS256 JWT через WebCrypto) -------
let cachedToken: { token: string; exp: number } | null = null;

function b64url(data: Uint8Array | string): string {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleToken(sa: { client_email: string; private_key: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.exp - 60 > now) return cachedToken.token;

  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  }));
  const unsigned = `${header}.${claims}`;

  const pem = sa.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key,
    new TextEncoder().encode(unsigned)));
  const jwt = `${unsigned}.${b64url(sig)}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  });
  if (!res.ok) throw new Error(`oauth ${res.status}: ${await res.text()}`);
  const j = await res.json();
  cachedToken = { token: j.access_token, exp: now + (j.expires_in ?? 3600) };
  return cachedToken.token;
}

// --- заголовок пуша по типу события -----------------------------------------
const TITLES: Record<string, string> = {
  reply_own: 'Ответ в твоей теме',
  reply_sub: 'Ответ в подписанной ветке',
  follow_activity: 'Новая публикация по подписке',
  like: 'Твою запись оценили ♥',
};

Deno.serve(async (req) => {
  if (req.headers.get('x-push-key') !== PUSH_KEY) {
    return new Response('forbidden', { status: 403 });
  }
  const { id } = await req.json().catch(() => ({ id: null }));
  if (!id) return new Response('no id', { status: 400 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // строка уведомления (только неотправленная — повторный вызов безвреден)
  const { data: n } = await admin.from('notifications')
    .select('*').eq('id', id).eq('pushed', false).maybeSingle();
  if (!n) return new Response('already pushed or missing', { status: 200 });

  const { data: tokens } = await admin.from('device_tokens')
    .select('token').eq('user_id', n.recipient_id);
  if (!tokens?.length) {
    await admin.from('notifications').update({ pushed: true }).eq('id', id);
    return new Response('no devices', { status: 200 });
  }

  // имя автора действия — в тело пуша
  let actor = '';
  if (n.actor_id) {
    const { data: p } = await admin.from('profiles')
      .select('display_name').eq('id', n.actor_id).maybeSingle();
    actor = p?.display_name ?? '';
  }

  const sa = JSON.parse(Deno.env.get('FCM_SERVICE_ACCOUNT') ?? '{}');
  const oauth = await googleToken(sa);
  const fcmUrl = `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`;

  const title = TITLES[n.kind] ?? 'Astra · сообщество';
  const body = [actor, n.body].filter(Boolean).join(': ').slice(0, 180) || 'Открой приложение';

  for (const { token } of tokens) {
    const res = await fetch(fcmUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${oauth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          data: {
            discussion_id: n.discussion_id ?? '',
            signature: n.aspect_signature ?? '',
            kind: n.kind,
          },
          android: { priority: 'HIGH', notification: { channel_id: 'care' } },
        },
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      // мёртвый/протухший токен — вычищаем, чтобы не долбить впустую
      if (res.status === 404 || res.status === 400 || t.includes('UNREGISTERED')) {
        await admin.from('device_tokens').delete().eq('token', token);
      } else {
        console.error('fcm', res.status, t.slice(0, 300));
      }
    }
  }

  await admin.from('notifications').update({ pushed: true }).eq('id', id);
  return new Response('ok', { status: 200 });
});
