// NOVA NIIF MASTER PRO — Consultor técnico con IA (Netlify Function)
// Recibe la conversación desde la app, consulta la API de Claude (con búsqueda web
// en fuentes normativas) y devuelve la respuesta. Controla el límite DEMO en el servidor.
//
// Variables de entorno (Netlify → Site configuration → Environment variables):
//   ANTHROPIC_API_KEY  (obligatoria)  Clave de la API de Claude
//   ADMIN_KEY          (obligatoria)  Clave del panel /admin.html para crear y renovar códigos PRO
//   PRO_CODES          (opcional)     Códigos PRO permanentes (sin vencimiento), separados por coma
//   ANTHROPIC_MODEL    (opcional)     Modelo. Por defecto: claude-sonnet-5-5
//   DEMO_LIMIT         (opcional)     Consultas DEMO por usuario. Por defecto: 2
//   PRO_MONTHLY_LIMIT  (opcional)     Consultas por mes por código PRO (uso justo). Por defecto: 300
//   WEB_SEARCH         (opcional)     "off" para desactivar la búsqueda web

import { openStore, checkCode, monthKey } from "../shared/store.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-5-5";
const DEMO_LIMIT = Number(process.env.DEMO_LIMIT || 2);
const PRO_MONTHLY_LIMIT = Number(process.env.PRO_MONTHLY_LIMIT || 300);
const DEMO_FOLLOWUPS = 2;            // aclaraciones gratuitas por consulta DEMO
const MAX_TURNS = 13;                // mensajes máximos en un hilo
const MAX_CHARS_MSG = 4000;
const MAX_CHARS_TOTAL = 40000;

const SEARCH_DOMAINS = [
  "ifrs.org", "iasplus.com", "kpmg.com", "pwc.com", "ey.com", "deloitte.com",
  "bdo.global", "grantthornton.global", "bakertilly.global", "mazars.com", "forvismazars.com",
  "supercias.gob.ec", "sri.gob.ec", "nicniif.org", "efrag.org"
];

const LANG_NAME = { es: "español", en: "English", pt: "português do Brasil" };

function systemPrompt(lang) {
  const today = new Date().toISOString().slice(0, 10);
  return `Eres el consultor técnico de NOVA NIIF MASTER PRO: un experto en NIIF/IFRS completas, NIIF para las PYMES, NIC, CINIIF y SIC, con criterio de auditor y de preparador de estados financieros. Atiendes a contadores profesionales. Fecha de hoy: ${today}.

Responde SIEMPRE en ${LANG_NAME[lang] || "español"}.

ALCANCE
- Resuelves consultas técnicas, casos prácticos y ejercicios de contabilidad bajo NIIF: reconocimiento, medición, presentación, revelación, asientos contables, políticas contables, transición y novedades normativas.
- También puedes relacionar el tratamiento NIIF con aspectos tributarios locales (por ejemplo, Ecuador: SRI, Superintendencia de Compañías), indicando claramente que lo tributario es complementario y debe verificarse.
- Si la consulta no es contable/financiera, indícalo con cortesía en una línea y no la respondas.

CÓMO RESPONDER UN CASO O EJERCICIO
1. **Hechos y supuestos**: resume en pocas líneas los datos relevantes. Si falta un dato imprescindible, indica qué supuesto razonable usas (y que la respuesta cambia si el supuesto no se cumple). No inventes datos.
2. **Norma aplicable**: cita la norma y los párrafos (p. ej. NIIF 16.26, NIC 36.18). Cita un párrafo solo si estás seguro; si no, cita la norma sin número de párrafo.
3. **Cálculos paso a paso**: muestra fórmulas, factores y resultados intermedios. Verifica la aritmética antes de responder; redondea solo al final y di cómo redondeas.
4. **Asientos contables**: en tabla Markdown con columnas Cuenta | Debe | Haber, con fecha o momento del registro.
5. **Conclusión**: respuesta directa a la pregunta, en negrita las cifras clave.
6. **Matices** (opcional, máximo 3 viñetas): alternativas de política, exenciones, efectos de revelación o diferencias con NIIF para PYMES cuando sean relevantes.

NOVEDADES Y VIGENCIAS
- Tu conocimiento tiene una fecha de corte. Cuando la pregunta trate de normas nuevas, enmiendas, fechas de vigencia, proyectos del IASB o cambios recientes, usa la herramienta de búsqueda web antes de responder y cita las fuentes.
- Prioriza fuentes oficiales (IFRS Foundation) y de firmas reconocidas. Si no puedes confirmar algo, dilo.
- No narres el proceso de búsqueda ("voy a buscar…"); entrega directamente la respuesta.

ESTILO
- Técnico, claro y ordenado, con encabezados cortos (##) y tablas cuando ayuden.
- No repitas la pregunta. No uses relleno.
- Cierra, cuando aplique, con una línea: "Respuesta orientativa; valide con el juicio profesional y los hechos completos del caso."`;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

function validateMessages(messages) {
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_TURNS) return false;
  let total = 0;
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const expected = i % 2 === 0 ? "user" : "assistant";
    if (!m || m.role !== expected || typeof m.content !== "string") return false;
    const len = m.content.trim().length;
    if (len === 0 || (m.role === "user" && len > MAX_CHARS_MSG)) return false;
    total += m.content.length;
  }
  if (total > MAX_CHARS_TOTAL) return false;
  return messages[messages.length - 1].role === "user";
}

async function askClaude(messages, lang) {
  const base = messages.map(m => ({ role: m.role, content: m.content }));
  const tools = process.env.WEB_SEARCH === "off" ? undefined : [{
    type: "web_search_20250305",
    name: "web_search",
    max_uses: 2,
    allowed_domains: SEARCH_DOMAINS
  }];

  let collected = [];
  for (let round = 0; round < 3; round++) {
    const convo = collected.length ? [...base, { role: "assistant", content: collected }] : base;
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 4000,
        system: systemPrompt(lang),
        messages: convo,
        ...(tools ? { tools } : {})
      })
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`API ${res.status}: ${detail.slice(0, 300)}`);
    }
    const data = await res.json();
    collected = collected.concat(data.content || []);
    if (data.stop_reason !== "pause_turn") break;
  }

  const textBlocks = collected.filter(b => b.type === "text");
  const answer = textBlocks.map(b => b.text).join("").trim();
  const seen = new Set();
  const sources = [];
  for (const b of textBlocks) {
    for (const c of b.citations || []) {
      if (c.url && !seen.has(c.url)) { seen.add(c.url); sources.push({ url: c.url, title: c.title || c.url }); }
    }
  }
  return { answer, sources };
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  if (!process.env.ANTHROPIC_API_KEY) {
    return json({ ok: false, error: "not_configured", message: "Falta configurar ANTHROPIC_API_KEY en Netlify." }, 500);
  }

  let body;
  try { body = await req.json(); } catch { return json({ ok: false, error: "bad_request" }, 400); }
  const messages = body?.messages;
  const lang = ["es", "en", "pt"].includes(body?.lang) ? body.lang : "es";
  if (!validateMessages(messages)) return json({ ok: false, error: "bad_request" }, 400);

  const code = (req.headers.get("x-nova-pro") || "").trim();
  let isPro = false;
  let proCode = "";
  if (code !== "") {
    const check = await checkCode(code);
    if (!check.valid) {
      const error = check.reason === "expired" ? "expired_code" : "invalid_code";
      return json({ ok: false, error, vence: check.record?.vence || null }, 403);
    }
    isPro = true;
    proCode = check.code;
  }

  const isFollowup = messages.length > 1;
  let store = null, ipKey = null, used = 0, remaining = null;

  if (isPro) {
    try {
      store = openStore("nova-niif-pro");
      ipKey = "pro:" + proCode + ":" + monthKey();
      used = Number((await store.get(ipKey)) || 0);
    } catch (e) {
      console.error("Blobs no disponible:", e?.message);
      store = null;
    }
    if (used >= PRO_MONTHLY_LIMIT) return json({ ok: false, error: "pro_limit" }, 402);
    remaining = Math.max(0, PRO_MONTHLY_LIMIT - used - 1);
  }

  if (!isPro) {
    if (isFollowup && (messages.length - 1) / 2 > DEMO_FOLLOWUPS) {
      return json({ ok: false, error: "followup_limit" }, 402);
    }
    try {
      store = openStore("nova-niif-demo");
      ipKey = "ip:" + (context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown");
      used = Number((await store.get(ipKey)) || 0);
    } catch (e) {
      console.error("Blobs no disponible:", e?.message);
      store = null;
    }
    if (!isFollowup && used >= DEMO_LIMIT) return json({ ok: false, error: "demo_limit", remaining: 0 }, 402);
    remaining = Math.max(0, DEMO_LIMIT - used - (isFollowup ? 0 : 1));
  }

  // Respuesta en streaming: se envían espacios cada 5 s para mantener viva la conexión
  // (las funciones con streaming en Netlify admiten hasta 60 s) y al final el JSON.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const keepAlive = setInterval(() => controller.enqueue(enc.encode(" ")), 5000);
      try {
        const { answer, sources } = await askClaude(messages, lang);
        if (!answer) throw new Error("Respuesta vacía");
        if ((isPro || !isFollowup) && store) {
          try { await store.set(ipKey, String(used + 1)); } catch (e) { console.error("Blobs set:", e?.message); }
        }
        controller.enqueue(enc.encode(JSON.stringify({ ok: true, answer, sources, pro: isPro, remaining })));
      } catch (e) {
        console.error("Consultor:", e?.message);
        controller.enqueue(enc.encode(JSON.stringify({ ok: false, error: "upstream" })));
      } finally {
        clearInterval(keepAlive);
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
};

export const config = { path: "/api/consultor" };
