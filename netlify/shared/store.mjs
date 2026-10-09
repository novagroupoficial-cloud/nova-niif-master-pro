// Almacenamiento persistente (Netlify Blobs) y lógica de códigos PRO.
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

// Para pruebas locales: NOVA_MEMORY_STORE=1 usa memoria en lugar de Netlify Blobs.
const memory = new Map();
function memoryStore(name) {
  const k = key => name + "/" + key;
  return {
    async get(key, opts) { const v = memory.get(k(key)); if (v === undefined) return null; return opts?.type === "json" ? JSON.parse(v) : v; },
    async set(key, value) { memory.set(k(key), String(value)); },
    async setJSON(key, value) { memory.set(k(key), JSON.stringify(value)); },
    async delete(key) { memory.delete(k(key)); },
    async list() { return { blobs: [...memory.keys()].filter(x => x.startsWith(name + "/")).map(x => ({ key: x.slice(name.length + 1) })) }; }
  };
}

export function openStore(name) {
  if (process.env.NOVA_MEMORY_STORE === "1") return memoryStore(name);
  return getStore({ name, consistency: "strong" });
}

export const CODES_STORE = "nova-niif-codes";

// Código legible, sin caracteres ambiguos (0/O, 1/I/L)
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newCode() {
  const bytes = randomBytes(8);
  const chars = [...bytes].map(b => ALPHABET[b % ALPHABET.length]).join("");
  return `NOVA-${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Fechas en hora de Ecuador (UTC-5), para que coincidan con el día local del administrador
const TZ = process.env.NOVA_TIMEZONE || "America/Guayaquil";
export function today() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
export function monthKey() { return today().slice(0, 7); }

export function addMonths(isoDate, months) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth() + 1, 0)).getUTCDate();
  dt.setUTCDate(Math.min(d, lastDay));
  return dt.toISOString().slice(0, 10);
}

// Devuelve { valid, reason } — reason: "unknown" | "revoked" | "expired"
export async function checkCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  if (!clean) return { valid: false, reason: "unknown" };
  const legacy = (process.env.PRO_CODES || "").split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
  if (legacy.includes(clean)) return { valid: true, code: clean, record: { plan: "permanente" } };
  let record = null;
  try { record = await openStore(CODES_STORE).get(clean, { type: "json" }); }
  catch (e) { console.error("Blobs (códigos):", e?.message); }
  if (!record) return { valid: false, reason: "unknown" };
  if (record.activo === false) return { valid: false, reason: "revoked" };
  if (record.vence && record.vence < today()) return { valid: false, reason: "expired", record };
  return { valid: true, code: clean, record };
}
