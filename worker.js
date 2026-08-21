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

function corsHeaders(env) {
  return {
    "Access-Control-Allow-Origin": env.ALLOWED_ORIGIN || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

function json(data, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(env) },
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // --- LOGIN ---
    if (path === "/api/login" && request.method === "POST") {
      const body = await request.json().catch(() => ({}));
      if (body.password && body.password === env.ADMIN_PASSWORD) {
        return json({ ok: true, token: env.ADMIN_PASSWORD }, env);
      }
      return json({ ok: false, error: "Contraseña incorrecta" }, env, 401);
    }

    // --- LIST CARS (public) ---
    if (path === "/api/cars" && request.method === "GET") {
      const cars = await getCars(env);
      return json({ cars }, env);
    }

    // --- ADD CAR (admin only) ---
    if (path === "/api/cars" && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, env, 401);
      const body = await request.json().catch(() => null);
      if (!body || !body.title) return json({ error: "Datos incompletos" }, env, 400);
      const cars = await getCars(env);
      const car = {
        id: uid(),
        type: body.type === "vendido" ? "vendido" : "venta",
        title: body.title,
        price: Number(body.price) || 0,
        image: body.image || "",
        damage: body.damage || "",
        arrival: body.arrival || "",
        stock: body.stock || "",
        createdAt: Date.now(),
      };
      cars.unshift(car);
      await saveCars(env, cars);
      return json({ ok: true, car }, env);
    }

    // --- MARK CAR AS SOLD (admin only) ---
    const soldMatch = path.match(/^\/api\/cars\/([^/]+)\/sell$/);
    if (soldMatch && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, env, 401);
      const cars = await getCars(env);
      const car = cars.find((c) => c.id === soldMatch[1]);
      if (!car) return json({ error: "No encontrado" }, env, 404);
      car.type = "vendido";
      await saveCars(env, cars);
      return json({ ok: true, car }, env);
    }

    // --- DELETE CAR (admin only) ---
    const delMatch = path.match(/^\/api\/cars\/([^/]+)$/);
    if (delMatch && request.method === "DELETE") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, env, 401);
      let cars = await getCars(env);
      cars = cars.filter((c) => c.id !== delMatch[1]);
      await saveCars(env, cars);
      return json({ ok: true }, env);
    }

    // --- UPLOAD IMAGE (admin only) ---
    if (path === "/api/upload" && request.method === "POST") {
      if (!isAuthed(request, env)) return json({ error: "No autorizado" }, env, 401);
      const form = await request.formData();
      const file = form.get("file");
      if (!file) return json({ error: "No se recibió archivo" }, env, 400);
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const key = `images/${uid()}.${ext}`;
      await env.IMAGES.put(key, await file.arrayBuffer(), {
        httpMetadata: { contentType: file.type || "image/jpeg" },
      });
      return json({ ok: true, key }, env);
    }

    // --- SERVE IMAGE (public) ---
    if (path.startsWith("/images/")) {
      const key = path.slice(1);
      const obj = await env.IMAGES.get(key);
      if (!obj) return new Response("Not found", { status: 404, headers: corsHeaders(env) });
      return new Response(obj.body, {
        headers: {
          "Content-Type": obj.httpMetadata?.contentType || "image/jpeg",
          "Cache-Control": "public, max-age=31536000",
          ...corsHeaders(env),
        },
      });
    }

    return json({ error: "Not found" }, env, 404);
  },
};
