/**
 * «Сообщество» (план docs/SUPABASE_PLAN.md): обсуждения аспектов с лайками и
 * комментариями на Supabase. Оффлайн-первое ядро НЕ трогаем — это опциональный
 * сетевой слой: без конфига/сети/входа всё остальное приложение живёт как жило.
 *
 * Ключи НЕ секретные (anon key защищён RLS-политиками на сервере) — их можно
 * вшивать в код. Пока владелица не создала проект — пустые строки, UI покажет
 * «Сообщество ещё не подключено».
 */
import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

// === КОНФИГ своей базы (переезд 12.08.2026 с облачного Supabase в Лондоне на
// свой сервер в РФ: 152-ФЗ ст. 18 ч. 5 требует, чтобы данные граждан РФ писались
// в базу на территории России). Postgres + GoTrue + PostgREST на svcode.ru.
// API живёт на ТОМ ЖЕ хосте, что и приложение: /auth/v1 → вход, /rest/v1 →
// данные. Отсюда у веб-версии вообще нет CORS; в APK страница на https://localhost,
// там кросс-домен, и заголовки выдаёт nginx.
// Ключ anon публичен по устройству (это JWT с ролью anon) — данные защищает RLS. ===
export const SUPABASE_URL = 'https://astra.svcode.ru';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6ImFzdHJhIiwiaWF0IjoxNzg2NDcwMjYxLCJleHAiOjIxMDE4MzAyNjF9.OLFsqlwktXCD4uqUg39zSsfakLNIGvWET4IetmUhS8w';
export const configured = (): boolean => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const NATIVE = Capacitor.isNativePlatform();

// Роли выдаёт СЕРВЕР: они лежат в app_metadata пользователя и приезжают прямо в
// токене, поэтому и клиенту, и RLS-политикам (public.has_role в schema.sql)
// видны без единого лишнего запроса. Раньше здесь стояли живые почтовые адреса
// владелицы и астролога — репозиторий публичный, и адрес постороннего человека
// лежал в открытом коде и уезжал в бандл каждому. Сменить исполнителя роли —
// теперь операция на сервере, правка кода не нужна:
//   update auth.users set raw_app_meta_data = raw_app_meta_data
//     || '{"roles":["astrologer"]}'::jsonb where email = '…';
// Роль попадает в токен при входе: после смены человек должен перезайти.
const hasRole = (s: Session | null, role: string): boolean => {
  const roles = (s?.user.app_metadata as { roles?: unknown } | undefined)?.roles;
  return Array.isArray(roles) && roles.includes(role);
};

/** Админ сообщества: может удалять любые темы и комментарии (автор — свои). */
export const isAdmin = (session: Session | null): boolean => hasRole(session, 'admin');

/** Астролог: видит «Входящие» с картами клиентов. Модерации у неё нет. */
export const isAstrologer = (session: Session | null): boolean => hasRole(session, 'astrologer');

// сессия Supabase должна переживать перезапуск → Preferences (localStorage ненадёжен)
const prefStorage = {
  getItem: async (k: string) => (await Preferences.get({ key: k })).value,
  setItem: async (k: string, v: string) => { await Preferences.set({ key: k, value: v }); },
  removeItem: async (k: string) => { await Preferences.remove({ key: k }); },
};

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        storage: prefStorage,
        flowType: 'pkce',              // код в deep link → exchangeCodeForSession
        detectSessionInUrl: !NATIVE,   // на вебе сессию из redirect ловим сами
      },
    });
  }
  return client;
}

// --- Вход/выход -------------------------------------------------------------

/** Подписка на изменения auth. Возвращает cleanup-функцию: без снятия подписки
 *  слушатели копились при каждом открытии шторки Сообщества. */
export function initCommunityAuth(onChange: (s: Session | null) => void): (() => void) | undefined {
  if (!configured()) return undefined;
  const { data: sub } = sb().auth.onAuthStateChange((_e, session) => onChange(session));
  void sb().auth.getSession().then(({ data }) => onChange(data.session));
  return () => sub.subscription.unsubscribe();
}

/* === ВХОД: почта + пароль ===================================================
 * Google убран 2026-08-07 (сторонний вход при переезде на российский хостинг не
 * используем), вход по ссылке из письма убран 12.08.2026: у своего сервера почты
 * нет. Хостинг (reg.ru) закрывает исходящие 25/587/465, поэтому ни своего
 * почтовика, ни обычного релея поднять нельзя, а слать письма через зарубежный
 * сервис — тот самый трансграничный вывоз адресов, от которого мы и уезжали.
 * Пароль писем не требует вовсе: GOTRUE_MAILER_AUTOCONFIRM=true подтверждает
 * адрес сразу, и регистрация возвращает сессию тем же ответом.
 * Восстановление пароля («забыл») появится, когда будет ящик; пока адрес меняет
 * администратор. */

/** Войти существующим паролем. */
export async function signInPassword(email: string, password: string): Promise<void> {
  const { error } = await sb().auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/** Завести вход впервые. Сессия приходит сразу (адрес подтверждать нечем). */
export async function signUpPassword(email: string, password: string): Promise<void> {
  const { data, error } = await sb().auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  // если на сервере вдруг включат подтверждение почты — сессии не будет
  if (!data.session) throw new Error('Проверь почту — вход нужно подтвердить.');
}

/** Сменить свой пароль. Нужна, пока нет письма «забыл пароль»: первый пароль
 *  старым пользователям заводит администратор, дальше человек меняет его сам. */
export async function changePassword(password: string): Promise<void> {
  const { error } = await sb().auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut(): Promise<void> { await sb().auth.signOut(); }

/** Удалить аккаунт и ВСЕ свои данные на сервере (152-ФЗ ст. 14: обработка
 *  прекращается по требованию человека, а не по письму администратору).
 *  Серверная delete_my_account() удаляет строку в auth.users, а каскад уносит
 *  профиль, темы, комментарии, лайки, подписки, уведомления и токены устройств
 *  (см. supabase/schema.sql). Отменить нельзя.
 *  Данные на устройстве — журнал, карты, настройки — здесь ни при чём: они
 *  никогда не уезжали на сервер, их чистит «Данные» в настройках. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await sb().rpc('delete_my_account');
  if (error) throw new Error(error.message);
  await sb().auth.signOut();
}

/** Профиль: завести/обновить своё имя (при входе по почте — часть адреса до @;
 *  ник можно поменять вручную, он не затирается). */
export async function ensureProfile(session: Session): Promise<void> {
  const meta = session.user.user_metadata as Record<string, unknown>;
  const name = String(meta.full_name ?? meta.name ?? session.user.email?.split('@')[0] ?? 'астролог');
  await sb().from('profiles').upsert(
    { id: session.user.id, display_name: name, avatar_url: (meta.avatar_url as string) ?? null },
    { onConflict: 'id', ignoreDuplicates: true },   // ник, изменённый вручную, не затираем
  );
}

// --- Данные ------------------------------------------------------------------

export interface Discussion {
  id: string; author_id: string; aspect_signature: string | null; exact_at: string | null;
  title: string; body: string; created_at: string;
  authorName: string; comments: number; likes: number; myLike: boolean;
}
export interface CommunityComment {
  id: string; author_id: string; body: string; created_at: string;
  authorName: string; likes: number; myLike: boolean;
}

type Row = Record<string, any>;
const uidOf = async (): Promise<string | null> =>
  (await sb().auth.getSession()).data.session?.user.id ?? null;

/** Лайки пачкой для видимых id (полиморфная таблица без FK — считаем сами). */
async function likesFor(kind: 'discussion' | 'comment', ids: string[]):
  Promise<Map<string, { n: number; my: boolean }>> {
  const map = new Map<string, { n: number; my: boolean }>();
  if (!ids.length) return map;
  const me = await uidOf();
  const { data } = await sb().from('likes')
    .select('target_id,user_id').eq('target_kind', kind).in('target_id', ids);
  for (const r of (data ?? []) as Row[]) {
    const e = map.get(r.target_id) ?? { n: 0, my: false };
    e.n++; if (r.user_id === me) e.my = true;
    map.set(r.target_id, e);
  }
  return map;
}

// общий маппинг строк обсуждений (+ лайки пачкой) — для ленты и страницы автора
async function decorate(rows: Row[]): Promise<Discussion[]> {
  const likes = await likesFor('discussion', rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, author_id: r.author_id, aspect_signature: r.aspect_signature,
    exact_at: r.exact_at, title: r.title, body: r.body, created_at: r.created_at,
    authorName: r.profiles?.display_name ?? '…',
    comments: r.comments?.[0]?.count ?? 0,
    likes: likes.get(r.id)?.n ?? 0, myLike: likes.get(r.id)?.my ?? false,
  }));
}

/** Сколько обсуждений у каждой сигнатуры аспекта (для метки «есть обсуждение»
 *  на карточках). Тихо возвращает пусто без входа/сети — оффлайн-ядро не страдает. */
export async function discussionCounts(signatures: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const uniq = [...new Set(signatures.filter(Boolean))];
  if (!uniq.length || !configured()) return map;
  try {
    if (!(await uidOf())) return map;                 // RLS: только вошедшим
    const { data } = await sb().from('discussions')
      .select('aspect_signature').in('aspect_signature', uniq);
    for (const r of (data ?? []) as Row[]) {
      const s = r.aspect_signature; if (!s) continue;
      map.set(s, (map.get(s) ?? 0) + 1);
    }
  } catch { /* нет сети/входа — без меток */ }
  return map;
}

export async function listDiscussions(signature?: string | null, limit = 50): Promise<Discussion[]> {
  let q = sb().from('discussions')
    .select('*, profiles:author_id(display_name), comments(count)')
    .order('created_at', { ascending: false }).limit(limit);
  if (signature) q = q.eq('aspect_signature', signature);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return decorate((data ?? []) as Row[]);
}

/** Одно обсуждение по id — для перехода из уведомления в тред. */
export async function getDiscussion(id: string): Promise<Discussion | null> {
  const { data, error } = await sb().from('discussions')
    .select('*, profiles:author_id(display_name), comments(count)').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return (await decorate([data as Row]))[0] ?? null;
}

/** Темы конкретного автора — для страницы пользователя. */
export async function listByAuthor(userId: string, limit = 30): Promise<Discussion[]> {
  const { data, error } = await sb().from('discussions')
    .select('*, profiles:author_id(display_name), comments(count)')
    .eq('author_id', userId)
    .order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return decorate((data ?? []) as Row[]);
}

export async function listComments(discussionId: string): Promise<CommunityComment[]> {
  const { data, error } = await sb().from('comments')
    .select('*, profiles:author_id(display_name)')
    .eq('discussion_id', discussionId).order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const likes = await likesFor('comment', rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, author_id: r.author_id, body: r.body, created_at: r.created_at,
    authorName: r.profiles?.display_name ?? '…',
    likes: likes.get(r.id)?.n ?? 0, myLike: likes.get(r.id)?.my ?? false,
  }));
}

export async function createDiscussion(p: {
  title: string; body: string; signature?: string | null; exactAt?: Date | null;
}): Promise<void> {
  const me = await uidOf(); if (!me) throw new Error('Нужно войти.');
  const { error } = await sb().from('discussions').insert({
    author_id: me, title: p.title, body: p.body,
    aspect_signature: p.signature ?? null, exact_at: p.exactAt?.toISOString() ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function addComment(discussionId: string, body: string): Promise<void> {
  const me = await uidOf(); if (!me) throw new Error('Нужно войти.');
  const { error } = await sb().from('comments').insert({ discussion_id: discussionId, author_id: me, body });
  if (error) throw new Error(error.message);
}

export async function toggleLike(kind: 'discussion' | 'comment', id: string, on: boolean): Promise<void> {
  const me = await uidOf(); if (!me) throw new Error('Нужно войти.');
  if (on) {
    const { error } = await sb().from('likes')
      .upsert({ user_id: me, target_kind: kind, target_id: id }, { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    await sb().from('likes').delete()
      .eq('user_id', me).eq('target_kind', kind).eq('target_id', id);
  }
}

export async function removeDiscussion(id: string): Promise<void> {
  await sb().from('discussions').delete().eq('id', id);   // RLS пустит только автора
}
export async function removeComment(id: string): Promise<void> {
  await sb().from('comments').delete().eq('id', id);
}

// --- Подписки на людей (follow) и на ветки -----------------------------------

export interface ProfileCard {
  id: string; name: string; avatar: string | null;
  followers: number; following: number; posts: number; iFollow: boolean; isMe: boolean;
}

export async function follow(followeeId: string, on: boolean): Promise<void> {
  const me = await uidOf(); if (!me) throw new Error('Нужно войти.');
  if (on) {
    const { error } = await sb().from('follows')
      .upsert({ follower_id: me, followee_id: followeeId }, { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    await sb().from('follows').delete().eq('follower_id', me).eq('followee_id', followeeId);
  }
}

/** id всех, на кого я подписана (для метки «подписка» в ленте). */
export async function followingIds(): Promise<Set<string>> {
  const me = await uidOf(); if (!me) return new Set();
  const { data } = await sb().from('follows').select('followee_id').eq('follower_id', me);
  return new Set((data ?? []).map((r: Row) => r.followee_id));
}

/** Карточка пользователя: имя, аватар, счётчики, подписана ли я. */
export async function getProfileCard(userId: string): Promise<ProfileCard> {
  const me = await uidOf();
  const cnt = (q: any) => q.select('*', { count: 'exact', head: true });
  const [prof, followers, following, posts, mine] = await Promise.all([
    sb().from('profiles').select('display_name,avatar_url').eq('id', userId).maybeSingle(),
    cnt(sb().from('follows')).eq('followee_id', userId),
    cnt(sb().from('follows')).eq('follower_id', userId),
    cnt(sb().from('discussions')).eq('author_id', userId),
    me ? sb().from('follows').select('follower_id').eq('follower_id', me).eq('followee_id', userId).maybeSingle()
       : Promise.resolve({ data: null }),
  ]);
  return {
    id: userId,
    name: (prof.data as Row)?.display_name ?? '…',
    avatar: (prof.data as Row)?.avatar_url ?? null,
    followers: followers.count ?? 0,
    following: following.count ?? 0,
    posts: posts.count ?? 0,
    iFollow: !!(mine as { data: unknown }).data,
    isMe: me === userId,
  };
}

export async function subscribeThread(discussionId: string, on: boolean): Promise<void> {
  const me = await uidOf(); if (!me) throw new Error('Нужно войти.');
  if (on) {
    const { error } = await sb().from('thread_subs')
      .upsert({ user_id: me, discussion_id: discussionId }, { ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  } else {
    await sb().from('thread_subs').delete().eq('user_id', me).eq('discussion_id', discussionId);
  }
}

export async function isSubscribed(discussionId: string): Promise<boolean> {
  const me = await uidOf(); if (!me) return false;
  const { data } = await sb().from('thread_subs').select('user_id')
    .eq('user_id', me).eq('discussion_id', discussionId).maybeSingle();
  return !!data;
}

// --- Уведомления сообщества (колокольчик, В ПРИЛОЖЕНИИ) -----------------------
// Строки в notifications создают триггеры БД (см. supabase/schema.sql). Пуш на
// закрытое приложение — отдельный слой FCM (docs/TASK_COMMUNITY_PUSH.md); здесь
// только чтение/пометка для внутриприложенческого списка.

export interface CommunityNotif {
  id: string; kind: string; actorName: string; body: string;
  discussion_id: string | null; aspect_signature: string | null;
  read: boolean; created_at: string;
}

export async function listNotifications(limit = 50): Promise<CommunityNotif[]> {
  const me = await uidOf(); if (!me) return [];
  const { data, error } = await sb().from('notifications')
    .select('*, actor:actor_id(display_name)')
    .eq('recipient_id', me).order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(error.message);
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, kind: r.kind, actorName: r.actor?.display_name ?? 'кто-то',
    body: r.body, discussion_id: r.discussion_id, aspect_signature: r.aspect_signature,
    read: r.read, created_at: r.created_at,
  }));
}

/** Сохранить FCM-токен устройства (слой 2 пушей). RLS: только своя строка. */
export async function saveDeviceToken(token: string): Promise<void> {
  const me = await uidOf(); if (!me) return;
  await sb().from('device_tokens')
    .upsert({ token, user_id: me, updated_at: new Date().toISOString() });
}

export async function unreadCount(): Promise<number> {
  const me = await uidOf(); if (!me) return 0;
  const { count } = await sb().from('notifications')
    .select('*', { count: 'exact', head: true }).eq('recipient_id', me).eq('read', false);
  return count ?? 0;
}

// --- Карты клиентов астрологу («написать астрологу», В ПРИЛОЖЕНИИ) -------------
// Клиент отправляет свою натальную карту астрологу. Запись — write-only для всех
// (в т.ч. без входа): RLS пускает INSERT, но SELECT/UPDATE/DELETE — только у
// астролога (ASTROLOGER_EMAIL). Дату отправки астролог видит в СВОЁМ поясе (UI).

export interface ClientChart {
  id: string; created_at: string; from_name: string; summary: string;
  contact: string | null; payload: string; read: boolean;
}

// Таблицы client_charts может ещё не быть (владелица не прогнала обновлённый
// schema.sql) — переводим сырую ошибку Postgres в понятную фразу.
function friendlyChartsErr(msg: string): string {
  return /client_charts|schema cache|does not exist|relation/i.test(msg)
    ? 'Приём карт ещё не настроен на сервере. Загляни позже — астролог включит это.'
    : msg;
}

/** Отправить свою карту астрологу. Вход не нужен — таблица только на запись. */
export async function sendClientChart(p: {
  fromName: string; summary: string; contact?: string | null; payload: string;
}): Promise<void> {
  if (!configured()) throw new Error('Сообщество не подключено — отправка недоступна.');
  const { error } = await sb().from('client_charts').insert({
    from_name: p.fromName, summary: p.summary, contact: p.contact ?? null, payload: p.payload,
  });
  if (error) throw new Error(friendlyChartsErr(error.message));
}

/** Входящие карты клиентов (видит только астролог; иначе RLS вернёт пусто). */
export async function listClientCharts(limit = 100): Promise<ClientChart[]> {
  if (!configured()) return [];
  const { data, error } = await sb().from('client_charts')
    .select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) throw new Error(friendlyChartsErr(error.message));
  return ((data ?? []) as Row[]).map((r) => ({
    id: r.id, created_at: r.created_at, from_name: r.from_name, summary: r.summary,
    contact: r.contact, payload: r.payload, read: r.read,
  }));
}

export async function markClientChartRead(id: string): Promise<void> {
  await sb().from('client_charts').update({ read: true }).eq('id', id);   // RLS: только астролог
}
export async function removeClientChart(id: string): Promise<void> {
  await sb().from('client_charts').delete().eq('id', id);
}

/** Сколько непрочитанных карт клиентов (для метки у астролога; иначе 0). */
export async function clientChartsUnread(): Promise<number> {
  if (!configured()) return 0;
  const s = (await sb().auth.getSession()).data.session;
  if (!isAstrologer(s)) return 0;
  const { count } = await sb().from('client_charts')
    .select('*', { count: 'exact', head: true }).eq('read', false);
  return count ?? 0;
}

export async function markNotificationsRead(): Promise<void> {
  const me = await uidOf(); if (!me) return;
  await sb().from('notifications').update({ read: true }).eq('recipient_id', me).eq('read', false);
}
