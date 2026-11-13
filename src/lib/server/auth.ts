import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { ApiError } from "../errors";
import { databaseConfigured, query } from "./db";

/**
 * Compte fondateur unique.
 * Le premier visiteur crée le compte ; l'inscription est ensuite fermée
 * définitivement (contrainte d'unicité en base : id = 1).
 */
const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;
export const SESSION_COOKIE = "tf_session";
const SESSION_DAYS = 30;

export const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, saltHex, hashHex] = stored.split("$");
  if (algo !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

let founderKnown = false;
/** Vrai dès qu'un fondateur existe (mémorisé : l'état ne redevient jamais faux). */
export async function founderExists(): Promise<boolean> {
  if (founderKnown) return true;
  const rows = await query("SELECT 1 FROM founder WHERE id = 1");
  founderKnown = rows.length > 0;
  return founderKnown;
}

/** État du site pour l'affichage : faut-il proposer la création du compte fondateur ? */
export async function needsFounderSetup(): Promise<boolean> {
  if (!databaseConfigured()) return false;
  try {
    return !(await founderExists());
  } catch {
    return false; // base injoignable : le site public reste utilisable
  }
}

export function validateCredentials(email: unknown, password: unknown): { email: string; password: string } {
  const fields: Record<string, string> = {};
  const e = typeof email === "string" ? email.trim().toLowerCase() : "";
  const p = typeof password === "string" ? password : "";
  if (!EMAIL_RE.test(e)) fields.email = "Adresse e-mail invalide.";
  if (p.length < 10) fields.password = "10 caractères minimum.";
  else if (p.length > 200) fields.password = "Mot de passe trop long.";
  if (Object.keys(fields).length) {
    const err = new ApiError("VALIDATION");
    err.fields = fields;
    throw err;
  }
  return { email: e, password: p };
}

export async function createFounder(email: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  // ON CONFLICT : si deux personnes valident en même temps, une seule l'emporte.
  const rows = await query("INSERT INTO founder (id, email, password_hash) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING RETURNING id", [email, hash]);
  founderKnown = true;
  if (rows.length === 0) throw new ApiError("CONFLICT", "Le compte fondateur existe déjà. L'inscription est fermée.");
}

export async function checkFounderLogin(email: string, password: string): Promise<boolean> {
  const rows = await query<{ email: string; password_hash: string }>("SELECT email, password_hash FROM founder WHERE id = 1");
  const founder = rows[0];
  // Hachage factice si aucun compte : temps de réponse constant.
  const ok = await verifyPassword(password, founder?.password_hash ?? "scrypt$00$00");
  return !!founder && ok && founder.email === email.trim().toLowerCase();
}

const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

export async function startSession(): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await query("DELETE FROM sessions WHERE expires_at < now()");
  await query("INSERT INTO sessions (token_hash, expires_at) VALUES ($1, $2)", [sha256(token), expires.toISOString()]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && process.env.INSECURE_COOKIES !== "1",
    path: "/",
    expires,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await query("DELETE FROM sessions WHERE token_hash = $1", [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

/** Renvoie l'e-mail du fondateur connecté, ou null. */
export async function currentFounder(): Promise<string | null> {
  if (!databaseConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await query<{ email: string }>(
    "SELECT f.email FROM sessions s JOIN founder f ON f.id = 1 WHERE s.token_hash = $1 AND s.expires_at > now()",
    [sha256(token)],
  );
  return rows[0]?.email ?? null;
}

export async function requireFounder(): Promise<string> {
  const email = await currentFounder();
  if (!email) throw new ApiError("UNAUTHORIZED");
  return email;
}

/** Protection CSRF : les requêtes de modification doivent venir du site lui-même. */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (!origin) return; // requêtes non-navigateur : le cookie SameSite=Lax protège déjà
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = new URL(origin).host;
  } catch {
    /* origine illisible */
  }
  if (!host || originHost !== host) throw new ApiError("FORBIDDEN", "Origine de la requête refusée.");
}
