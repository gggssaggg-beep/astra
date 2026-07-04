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
import { App as CapApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

// === КОНФИГ проекта Supabase (создан владелицей 2026-07-02; ключ publishable —
// НЕ секрет, данные защищает RLS на сервере) ===
export const SUPABASE_URL = 'https://vbaysgzdvdyljlwlnivq.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_rYe1PJ0juzDec87oK7QC6Q_iSufPThD';
// deep link возврата из Google-входа (intent-filter в AndroidManifest)
const NATIVE_REDIRECT = 'astra://auth';

export const configured = (): boolean => !!(SUPABASE_URL && SUPABASE_ANON_KEY);
const NATIVE = Capacitor.isNativePlatform();

// Админ сообщества (владелица) — по email. Совпадает с RLS-политикой удаления в
// supabase/schema.sql: админ может удалять любые темы/комментарии, автор — свои.
const ADMIN_EMAIL = 'ggg.ssa.ggg@gmail.com';
export const isAdmin = (session: Session | null): boolean =>
  !!session && (session.user.email ?? '').toLowerCase() === ADMIN_EMAIL;

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

let deepLinkReady = false;
/** Один раз подписаться на deep link `astra://auth?code=…` (возврат из Google). */
export function initCommunityAuth(onChange: (s: Session | null) => void): void {
  if (!configured()) return;
  sb().auth.onAuthStateChange((_e, session) => onChange(session));
  void sb().auth.getSession().then(({ data }) => onChange(data.session));
  if (NATIVE && !deepLinkReady) {
    deepLinkReady = true;
    void CapApp.addListener('appUrlOpen', async ({ url }) => {
      if (!url.startsWith(NATIVE_REDIRECT)) return;
      const code = new URL(url.replace('astra://', 'https://x/')).searchParams.get('code');
      if (code) await sb().auth.exchangeCodeForSession(code).catch(() => { /* покажет signed-out */ });
      try { await Browser.close(); } catch { /* уже закрыт */ }
    });
  }
}

export async function signInGoogle(): Promise<void> {
  if (NATIVE) {
    // WebView Google не пускает (disallowed_useragent) → системный браузер + deep link
    const { data, error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: NATIVE_REDIRECT, skipBrowserRedirect: true },
    });
    if (error) throw error;
    if (data.url) await Browser.open({ url: data.url });
  } else {
    const { error } = await sb().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
    if (error) throw error;
  }
}

/** Вход по ссылке на почту — БЕЗ Google (обход «Доступ заблокирован»,
 *  2026-07-03: redirect_uri_mismatch в Google-клиенте). Supabase шлёт письмо,
 *  тап по ссылке возвращает в приложение тем же deep link astra://auth
 *  (email-провайдер в проекте включён — проверено по /auth/v1/settings). */
export async function signInEmail(email: string): Promise<void> {
  const { error } = await sb().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: NATIVE ? NATIVE_REDIRECT : window.location.origin },
  });
  if (error) throw error;
}

export async function signOut(): Promise<void> { await sb().auth.signOut(); }

/** Профиль: завести/обновить своё имя (после первого входа — из Google). */
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

export async function listDiscussions(signature?: string | null, limit = 50): Promise<Discussion[]> {
  let q = sb().from('discussions')
    .select('*, profiles:author_id(display_name), comments(count)')
    .order('created_at', { ascending: false }).limit(limit);
  if (signature) q = q.eq('aspect_signature', signature);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Row[];
  const likes = await likesFor('discussion', rows.map((r) => r.id));
  return rows.map((r) => ({
    id: r.id, author_id: r.author_id, aspect_signature: r.aspect_signature,
    exact_at: r.exact_at, title: r.title, body: r.body, created_at: r.created_at,
    authorName: r.profiles?.display_name ?? '…',
    comments: r.comments?.[0]?.count ?? 0,
    likes: likes.get(r.id)?.n ?? 0, myLike: likes.get(r.id)?.my ?? false,
  }));
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
