// NOVA NIIF MASTER PRO — Administración de códigos PRO (Netlify Function)
// Protegida con la variable de entorno ADMIN_KEY. La usa la página /admin.html.
import { timingSafeEqual } from "node:crypto";
import { openStore, CODES_STORE, newCode, today, addMonths, monthKey } from "../shared/store.mjs";

const PLAN_MONTHS = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function authorized(req) {
  const expected = process.env.ADMIN_KEY || "";
  const given = req.headers.get("x-admin-key") || "";
  if (expected.length < 12 || given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const clean = (v, max = 120) => String(v ?? "").trim().slice(0, max);

export default async (req) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!process.env.ADMIN_KEY) return json({ ok: false, error: "not_configured" }, 500);
  if (!authorized(req)) return json({ ok: false, error: "unauthorized" }, 401);

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const store = openStore(CODES_STORE);
  const action = body?.action;

  try {
    if (action === "list") {
      const { blobs } = await store.list();
      const records = [];
      for (const b of blobs) {
        const r = await store.get(b.key, { type: "json" });
        if (r) records.push({ code: b.key, ...r });
      }
      records.sort((a, b) => String(a.vence).localeCompare(String(b.vence)));
      // Uso del mes actual por código
      const usage = openStore("nova-niif-pro");
      const month = monthKey();
      for (const r of records) {
        try { r.usoMes = Number((await usage.get("pro:" + r.code + ":" + month)) || 0); } catch { r.usoMes = null; }
      }
      return json({ ok: true, hoy: today(), records });
    }

    if (action === "create") {
      const plan = PLAN_MONTHS[body.plan] ? body.plan : "mensual";
      const cantidad = Math.min(50, Math.max(1, parseInt(body.cantidad, 10) || 1));
      const inicio = /^\d{4}-\d{2}-\d{2}$/.test(body.inicio || "") ? body.inicio : today();
      const created = [];
      for (let i = 0; i < cantidad; i++) {
        let code = newCode();
        while (await store.get(code)) code = newCode();
        const record = {
          cliente: clean(body.cliente) || (cantidad > 1 ? `Lote ${inicio}` : ""),
          contacto: clean(body.contacto),
          plan,
          pago: clean(body.pago, 40),
          nota: clean(body.nota, 300),
          creado: today(),
          inicio,
          vence: addMonths(inicio, PLAN_MONTHS[plan]),
          activo: true,
          historial: [{ fecha: today(), accion: "creado", plan }]
        };
        await store.setJSON(code, record);
        created.push({ code, ...record });
      }
      return json({ ok: true, created });
    }

    const code = clean(body.code, 40).toUpperCase();
    const record = code ? await store.get(code, { type: "json" }) : null;
    if (!record) return json({ ok: false, error: "not_found" }, 404);

    if (action === "renew") {
      const plan = PLAN_MONTHS[body.plan] ? body.plan : record.plan || "mensual";
      const base = record.vence && record.vence >= today() ? record.vence : today();
      record.vence = addMonths(base, PLAN_MONTHS[plan]);
      record.plan = plan;
      record.activo = true;
      if (body.pago) record.pago = clean(body.pago, 40);
      record.historial = [...(record.historial || []), { fecha: today(), accion: "renovado", plan, vence: record.vence }].slice(-30);
      await store.setJSON(code, record);
      return json({ ok: true, record: { code, ...record } });
    }

    if (action === "revoke" || action === "activate") {
      record.activo = action === "activate";
      record.historial = [...(record.historial || []), { fecha: today(), accion: action === "activate" ? "reactivado" : "anulado" }].slice(-30);
      await store.setJSON(code, record);
      return json({ ok: true, record: { code, ...record } });
    }

    if (action === "update") {
      for (const f of ["cliente", "contacto", "nota", "pago"]) if (f in body) record[f] = clean(body[f], f === "nota" ? 300 : 120);
      if (/^\d{4}-\d{2}-\d{2}$/.test(body.vence || "")) record.vence = body.vence;
      await store.setJSON(code, record);
      return json({ ok: true, record: { code, ...record } });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("Admin:", e?.message);
    return json({ ok: false, error: "server_error" }, 500);
  }
};

export const config = { path: "/api/admin" };
