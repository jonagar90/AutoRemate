/**
 * AutoRemate — Worker backend
 * Handles: admin login check, car listings (CRUD), image upload/serving.
 *
 * Bindings required (set in Cloudflare dashboard or wrangler.toml):
 *  - CARS_KV      (KV namespace)  -> stores the car list as JSON
 *  - IMAGES       (R2 bucket)     -> stores uploaded photos
 *  - ADMIN_PASSWORD (secret)      -> wrangler secret put ADMIN_PASSWORD
 *  - ALLOWED_ORIGIN (var)         -> e.g. https://jonagar90.github.io
 */

function corsHeaders(request, env) {
  const configured = (env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
  const withWww = configured.replace("https://", "https://www.");
  const withoutWww = configured.replace("https://www.", "https://");
  const allowed = new Set([configured, withWww, withoutWww, "https://jonagar90.github.io"].filter(Boolean));

  const requestOrigin = request.headers.get("Origin") || "";
  const originToAllow = allowed.has(requestOrigin) ? requestOrigin : configured;

  return {
    "Access-Control-Allow-Origin": originToAllow || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request, env) },
  });
}

function isAuthed(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace("Bearer ", "");
  return token && token === env.ADMIN_PASSWORD;
}

async function getCars(env) {
  const raw = await env.CARS_KV.get("cars");
  return raw ? JSON.parse(raw) : [];
}

async function saveCars(env, cars) {
  await env.CARS_KV.put("cars", JSON.stringify(cars));
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function getSubscribers(env) {
  const raw = await env.CARS_KV.get("subscribers");
  return raw ? JSON.parse(raw) : [];
}

async function notifySubscribers(env, car) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL) return; // email sending not configured yet
  const subscribers = await getSubscribers(env);
  if (subscribers.length === 0) return;
  const priceText = "Q" + Number(car.price).toLocaleString("es-GT");
  const siteUrl = env.ALLOWED_ORIGIN || "";
  for (const email of subscribers) {
    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: env.NOTIFY_FROM_EMAIL,
          to: email,
          subject: `Nuevo carro en AutoRemate: ${car.title}`,
          html: `<p>Acaba de entrar un carro nuevo en ruta:</p>
                 <p><b>${car.title}</b> — ${priceText}</p>
                 <p><a href="${siteUrl}">Ver en AutoRemate</a></p>`,
        }),
      });
    } catch (e) {
      // one failed email shouldn't block the rest
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    // --- SUBSCRIBE TO NEW CAR NOTIFICATIONS (public) ---
    if (path === "/api/subscribe" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      const email = (body.email || "").trim().toLowerCase();
      const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      if (!validEmail) return json({ error: "Correo inválido" }, request, env, 400);
      const subscribers = await getSubscribers(env);
      if (!subscribers.includes(email)) {
        subscribers.push(email);
        await env.CARS_KV.put("subscribers", JSON.stringify(subscribers));
      }
      return json({ ok: true }, request, env);
    }

    // --- LOGIN ---
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.password && body.password === env.ADMIN_PASSWORD) {
        return json({ ok: true, token: env.ADMIN_PASSWORD }, request, env);
      }
      return json({ ok: false, error: "Contraseña incorrecta" }, request, env, 401);
    }

    // --- LIST CARS (public) ---
    if (path === "/api/cars" && request.method === "GET") {
      const cars = await getCars(env);
      return json({ cars }, request, env);
    }

    // --- ADD CAR (admin only) ---
    if (path === "/api/cars" && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, request, env, 401);
      const body = await request.json().catch(() => null);
      if (!body || !body.title) return json({ error: "Datos incompletos" }, request, env, 400);
      const cars = await getCars(env);
      const images = Array.isArray(body.images) ? body.images.slice(0, 10) : (body.image ? [body.image] : []);
      const car = {
        id: uid(),
        type: body.type === "vendido" ? "vendido" : "venta",
        title: body.title,
        price: Number(body.price) || 0,
        images,
        damage: body.damage || "",
        arrival: body.arrival || "",
        stock: body.stock || "",
        createdAt: Date.now(),
      };
      cars.unshift(car);
      await saveCars(env, cars);
      if (car.type === "venta") {
        await notifySubscribers(env, car);
      }
      return json({ ok: true, car }, request, env);
    }

    // --- MARK CAR AS SOLD (admin only) ---
    const soldMatch = path.match(/^\/api\/cars\/([^/]+)\/sell$/);
    if (soldMatch && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, request, env, 401);
      const cars = await getCars(env);
      const car = cars.find((c) => c.id === soldMatch[1]);
      if (!car) return json({ error: "No encontrado" }, request, env, 404);
      car.type = "vendido";
      await saveCars(env, cars);
      return json({ ok: true, car }, request, env);
    }

    // --- DELETE CAR (admin only) ---
    const delMatch = path.match(/^\/api\/cars\/([^/]+)$/);
    if (delMatch && request.method === "DELETE") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, request, env, 401);
      let cars = await getCars(env);
      cars = cars.filter((c) => c.id !== delMatch[1]);
      await saveCars(env, cars);
      return json({ ok: true }, request, env);
    }

    // --- UPLOAD IMAGE (admin only) ---
    if (path === "/api/upload" && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, request, env, 401);
      const form = await request.formData();
      const file = form.get("file");
      if (!file) return json({ error: "No se recibió archivo" }, request, env, 400);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const key = `images/${uid()}.${ext}`;
      await env.IMAGES.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "image/jpeg" },
      });
      return json({ ok: true, key }, request, env);
    }

    // --- SERVE IMAGE (public) ---
    if (path.startsWith("/images/")) {
      const key = path.slice(1);
      const obj = await env.IMAGES.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: corsHeaders(request, env) });
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders(request, env),
        },
      });
    }

    return json({ error: "Not found" }, request, env, 404);
  },
};
