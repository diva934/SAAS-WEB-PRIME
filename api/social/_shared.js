import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { appOrigin, supabaseRequest } from "../_shared.js";

const STATE_TTL_MS = 10 * 60 * 1000;

function b64url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  const secret = process.env.SOCIAL_OAUTH_STATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "dev-secret";
  return createHmac("sha256", secret).update(value).digest("base64url");
}

export function createOauthState(payload) {
  const body = b64url(JSON.stringify({ ...payload, nonce: randomBytes(10).toString("hex"), exp: Date.now() + STATE_TTL_MS }));
  return `${body}.${sign(body)}`;
}

export function verifyOauthState(state) {
  const [body, mac] = String(state || "").split(".");
  if (!body || !mac) throw new Error("Etat OAuth invalide.");
  const expected = sign(body);
  if (mac.length !== expected.length || !timingSafeEqual(Buffer.from(mac), Buffer.from(expected))) {
    throw new Error("Signature OAuth invalide.");
  }
  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  if (!payload.exp || payload.exp < Date.now()) throw new Error("Session OAuth expiree.");
  return payload;
}

export function providerConfig(provider, req) {
  const key = String(provider || "").toLowerCase();
  const redirectUri = process.env.SOCIAL_OAUTH_REDIRECT_URL || `${appOrigin(req)}/api/social/callback`;
  if (key === "tiktok") {
    return {
      key,
      label: "TikTok",
      clientId: process.env.TIKTOK_CLIENT_KEY,
      clientSecret: process.env.TIKTOK_CLIENT_SECRET,
      redirectUri,
      authUrl: "https://www.tiktok.com/v2/auth/authorize/",
      tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
      scopes: ["user.info.basic", "user.info.profile", "user.info.stats", "video.list"],
    };
  }
  return {
    key: "instagram",
    label: "Instagram",
    clientId: process.env.META_APP_ID || process.env.INSTAGRAM_CLIENT_ID,
    clientSecret: process.env.META_APP_SECRET || process.env.INSTAGRAM_CLIENT_SECRET,
    redirectUri,
    authUrl: "https://www.facebook.com/v21.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v21.0/oauth/access_token",
    scopes: ["pages_show_list", "instagram_basic", "instagram_manage_insights"],
  };
}

export function assertProviderConfigured(config) {
  if (!config.clientId || !config.clientSecret) {
    const error = new Error(`${config.label} n'est pas configure.`);
    error.status = 503;
    throw error;
  }
}

export function oauthUrl(config, state) {
  const url = new URL(config.authUrl);
  const clientParam = config.key === "tiktok" ? "client_key" : "client_id";
  url.searchParams.set(clientParam, config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(config.key === "tiktok" ? "," : ","));
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(config, code) {
  if (config.key === "tiktok") {
    const body = new URLSearchParams({
      client_key: config.clientId,
      client_secret: config.clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: config.redirectUri,
    });
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error_description || data.message || "Connexion TikTok refusee.");
    return data;
  }

  const url = new URL(config.tokenUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || "Connexion Instagram refusee.");
  return data;
}

export async function saveConnection({ userId, provider, handle, token }) {
  const expiresAt = token.expires_in ? new Date(Date.now() + Number(token.expires_in) * 1000).toISOString() : null;
  await supabaseRequest("/rest/v1/social_connections?on_conflict=user_id,provider", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify([{
      user_id: userId,
      provider,
      handle,
      access_token: token.access_token,
      refresh_token: token.refresh_token || null,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }]),
  });
}

export async function readConnection(userId, provider) {
  const rows = await supabaseRequest(
    `/rest/v1/social_connections?select=provider,handle,access_token,refresh_token,expires_at&user_id=eq.${encodeURIComponent(userId)}&provider=eq.${encodeURIComponent(provider)}&limit=1`,
  );
  return Array.isArray(rows) ? rows[0] : null;
}

function hashtagsFrom(text) {
  return Array.from(new Set(String(text || "").match(/#[\p{L}\p{N}_]+/gu) || []));
}

export async function fetchConnectedSocialSnapshot(userId, provider, req) {
  const config = providerConfig(provider, req);
  const connection = await readConnection(userId, config.key);
  if (!connection?.access_token) {
    const error = new Error(`${config.label} doit etre connecte avant l'analyse.`);
    error.status = 409;
    throw error;
  }
  return config.key === "tiktok" ? fetchTikTokSnapshot(connection) : fetchInstagramSnapshot(connection);
}

async function fetchTikTokSnapshot(connection) {
  const fields = "open_id,avatar_url,display_name,bio_description,profile_deep_link,is_verified,username,follower_count,following_count,likes_count,video_count";
  const profileRes = await fetch(`https://open.tiktokapis.com/v2/user/info/?fields=${encodeURIComponent(fields)}`, {
    headers: { Authorization: `Bearer ${connection.access_token}` },
  });
  const profileData = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok || profileData.error?.code && profileData.error.code !== "ok") throw new Error(profileData.error?.message || "Impossible de lire le compte TikTok.");
  const user = profileData.data?.user || {};

  const videoRes = await fetch("https://open.tiktokapis.com/v2/video/list/?fields=id,title,embed_link,create_time", {
    method: "POST",
    headers: { Authorization: `Bearer ${connection.access_token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ max_count: 10 }),
  });
  const videoData = await videoRes.json().catch(() => ({}));
  const videos = videoRes.ok ? (videoData.data?.videos || []) : [];
  const posts = videos.map((video) => ({
    id: video.id,
    url: video.embed_link || "",
    caption: video.title || "",
    hashtags: hashtagsFrom(video.title),
    createdAt: video.create_time ? new Date(Number(video.create_time) * 1000).toISOString() : "",
  }));

  return {
    provider: "TikTok",
    handle: user.username || connection.handle || "",
    visibility: "Public si les videos sont accessibles via l'API",
    followers: user.follower_count ?? null,
    bio: user.bio_description || "",
    bioLink: user.profile_deep_link || "",
    posts,
  };
}

async function fetchInstagramSnapshot(connection) {
  const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,name,instagram_business_account&access_token=${encodeURIComponent(connection.access_token)}`);
  const pagesData = await pagesRes.json().catch(() => ({}));
  if (!pagesRes.ok || pagesData.error) throw new Error(pagesData.error?.message || "Impossible de lire les pages Instagram.");
  const igId = (pagesData.data || []).map((page) => page.instagram_business_account?.id).find(Boolean);
  if (!igId) throw new Error("Aucun compte Instagram professionnel relie a cette connexion Meta.");

  const fields = "username,biography,followers_count,website,media.limit(10){caption,permalink,timestamp,media_type}";
  const profileRes = await fetch(`https://graph.facebook.com/v21.0/${igId}?fields=${encodeURIComponent(fields)}&access_token=${encodeURIComponent(connection.access_token)}`);
  const profile = await profileRes.json().catch(() => ({}));
  if (!profileRes.ok || profile.error) throw new Error(profile.error?.message || "Impossible de lire le compte Instagram.");
  const posts = (profile.media?.data || []).map((media) => ({
    id: media.id,
    url: media.permalink || "",
    caption: media.caption || "",
    hashtags: hashtagsFrom(media.caption),
    createdAt: media.timestamp || "",
    type: media.media_type || "",
  }));

  return {
    provider: "Instagram",
    handle: profile.username || connection.handle || "",
    visibility: "Public/professionnel connecte",
    followers: profile.followers_count ?? null,
    bio: profile.biography || "",
    bioLink: profile.website || "",
    posts,
  };
}
