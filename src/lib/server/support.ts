import { randomInt } from "node:crypto";
import { ApiError } from "../errors";
import { isCategory, isStatus, LIMITS, STATUSES, type StatusId, type Ticket, type TicketEvent, type TicketList } from "../support-shared";
import { EMAIL_RE } from "./auth";
import { query } from "./db";

type TicketRow = { id: string; category: string; email: string; tiktok_url: string | null; subject: string; description: string; status: StatusId; created_at: Date | string; updated_at: Date | string };

const iso = (v: Date | string) => new Date(v).toISOString();
const toTicket = (r: TicketRow): Ticket => ({ id: r.id, category: r.category, email: r.email, tiktokUrl: r.tiktok_url, subject: r.subject, description: r.description, status: r.status, createdAt: iso(r.created_at), updatedAt: iso(r.updated_at) });

const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // sans 0/O/1/I
export function newTicketId(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `TF-${s}`;
}

export type TicketInput = { category: string; email: string; tiktokUrl: string | null; subject: string; description: string };

export function validateTicketInput(body: unknown): TicketInput {
  const b = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const fields: Record<string, string> = {};

  const category = str(b.category);
  if (!isCategory(category)) fields.category = "Choisissez une catégorie.";

  const email = str(b.email).toLowerCase();
  if (!email) fields.email = "L'adresse e-mail est obligatoire.";
  else if (!EMAIL_RE.test(email) || email.length > 254) fields.email = "Cette adresse e-mail n'est pas valide.";

  const rawUrl = str(b.tiktokUrl);
  let tiktokUrl: string | null = null;
  if (rawUrl) {
    try {
      const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
      if (!/(^|\.)tiktok\.com$/i.test(u.hostname) || rawUrl.length > 500) throw new Error("host");
      tiktokUrl = u.toString();
    } catch {
      fields.tiktokUrl = "Indiquez un lien tiktok.com valide, ou laissez ce champ vide.";
    }
  }

  const subject = str(b.subject);
  if (!subject) fields.subject = "Le sujet est obligatoire.";
  else if (subject.length > LIMITS.subject) fields.subject = `${LIMITS.subject} caractères maximum.`;

  const description = str(b.description);
  if (!description) fields.description = "La description est obligatoire.";
  else if (description.length < LIMITS.descriptionMin) fields.description = `Décrivez votre demande en ${LIMITS.descriptionMin} caractères minimum.`;
  else if (description.length > LIMITS.description) fields.description = `${LIMITS.description} caractères maximum.`;

  if (Object.keys(fields).length) {
    const err = new ApiError("VALIDATION", "Vérifiez les champs signalés.");
    err.fields = fields;
    throw err;
  }
  return { category, email, tiktokUrl, subject, description };
}

export async function createTicket(input: TicketInput): Promise<Ticket> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = newTicketId();
    const rows = await query<TicketRow>(
      `INSERT INTO tickets (id, category, email, tiktok_url, subject, description) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO NOTHING RETURNING *`,
      [id, input.category, input.email, input.tiktokUrl, input.subject, input.description],
    );
    if (rows[0]) {
      await query("INSERT INTO ticket_events (ticket_id, type) VALUES ($1, 'created')", [id]);
      return toTicket(rows[0]);
    }
  }
  throw new ApiError("INTERNAL");
}

export type ListFilters = { status?: string | null; category?: string | null; q?: string | null; sort?: string | null };

export async function listTickets(f: ListFilters): Promise<TicketList> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status && isStatus(f.status)) where.push(`status = $${params.push(f.status)}`);
  if (f.category && isCategory(f.category)) where.push(`category = $${params.push(f.category)}`);
  const q = f.q?.trim().slice(0, 100);
  if (q) {
    const i = params.push(`%${q.replace(/[\\%_]/g, "\\$&")}%`);
    where.push(`(id ILIKE $${i} OR email ILIKE $${i} OR subject ILIKE $${i} OR description ILIKE $${i})`);
  }
  const order = f.sort === "oldest" ? "ASC" : "DESC";
  const rows = await query<TicketRow>(`SELECT * FROM tickets ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at ${order}, id LIMIT 500`, params);

  const countRows = await query<{ status: StatusId; n: number | string }>("SELECT status, COUNT(*) AS n FROM tickets GROUP BY status");
  const counts = Object.fromEntries(STATUSES.map((s) => [s.id, 0])) as Record<StatusId, number>;
  for (const c of countRows) if (c.status in counts) counts[c.status] = Number(c.n);
  return { tickets: rows.map(toTicket), counts, total: Object.values(counts).reduce((a, b) => a + b, 0) };
}

export async function getTicket(id: string): Promise<{ ticket: Ticket; events: TicketEvent[] }> {
  const rows = await query<TicketRow>("SELECT * FROM tickets WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError("NOT_FOUND", "Demande introuvable.");
  const events = await query<{ id: number; type: string; data: string; created_at: Date | string }>("SELECT id, type, data, created_at FROM ticket_events WHERE ticket_id = $1 ORDER BY id", [id]);
  return {
    ticket: toTicket(rows[0]),
    events: events.map((e) => ({ id: e.id, type: e.type, createdAt: iso(e.created_at), data: JSON.parse(e.data || "{}") }) as TicketEvent),
  };
}

export async function setTicketStatus(id: string, to: StatusId): Promise<void> {
  const rows = await query<{ status: StatusId }>("SELECT status FROM tickets WHERE id = $1", [id]);
  if (!rows[0]) throw new ApiError("NOT_FOUND", "Demande introuvable.");
  const from = rows[0].status;
  if (from === to) return;
  await query("UPDATE tickets SET status = $2, updated_at = now() WHERE id = $1", [id, to]);
  await query("INSERT INTO ticket_events (ticket_id, type, data) VALUES ($1, 'status_changed', $2)", [id, JSON.stringify({ from, to })]);
}

export async function recordReply(id: string, reply: { to: string; subject: string; message: string; providerId?: string }): Promise<void> {
  await query("INSERT INTO ticket_events (ticket_id, type, data) VALUES ($1, 'reply_sent', $2)", [id, JSON.stringify(reply)]);
  await setTicketStatus(id, "waiting");
  await query("UPDATE tickets SET updated_at = now() WHERE id = $1", [id]);
}
