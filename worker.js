/**
 * AutoRemate — Worker backend
 *
 * Handles:
 * - Admin login
 * - Deal listings (CRUD)
 * - Deal status changes
 * - Image upload / serving
 * - Legacy vehicle compatibility
 *
 * Bindings required:
 * - CARS_KV         (KV namespace)
 * - IMAGES          (R2 bucket)
 * - ADMIN_PASSWORD  (secret)
 * - ALLOWED_ORIGIN  (var)
 *
 * Optional:
 * - RESEND_API_KEY
 * - NOTIFY_FROM_EMAIL
 */

function corsHeaders(request, env) {
  const configured = (env.ALLOWED_ORIGIN || "").replace(/\/$/, "");
  const withWww = configured.replace("https://", "https://www.");
  const withoutWww = configured.replace("https://www.", "https://");

  const allowed = new Set(
    [
      configured,
      withWww,
      withoutWww,
      "https://jonagar90.github.io",
    ].filter(Boolean)
  );

  const requestOrigin = request.headers.get("Origin") || "";
  const originToAllow = allowed.has(requestOrigin)
    ? requestOrigin
    : configured;

  return {
    "Access-Control-Allow-Origin": originToAllow || "*",
    "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function json(data, request, env, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(request, env),
    },
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
  return (
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8)
  );
}

async function getSubscribers(env) {
  const raw = await env.CARS_KV.get("subscribers");

  return raw ? JSON.parse(raw) : [];
}

/**
 * Converts old records into the new Deal structure
 * without modifying the original stored record.
 *
 * OLD:
 * type: "venta" | "vendido"
 *
 * NEW:
 * type: "venta" | "vendido"
 * status: "transito" | "disponible" | "vendido"
 */
function normalizeCar(car) {
  if (!car) return car;

  let status = car.status;

  if (!status) {
    status = car.type === "vendido"
      ? "vendido"
      : "transito";
  }

  return {
    ...car,

    type: status === "vendido"
      ? "vendido"
      : "venta",

    status,

    make: car.make || "",
    model: car.model || "",
    trim: car.trim || "",
    year: car.year || "",

    mileage:
      car.mileage !== undefined
        ? car.mileage
        : "",

    transmission: car.transmission || "",
    fuel: car.fuel || "",
    drivetrain: car.drivetrain || "",
    color: car.color || "",
    titleType: car.titleType || "",

    damage: car.damage || "",
    arrival: car.arrival || "",
    stock: car.stock || "",

    images: Array.isArray(car.images)
      ? car.images
      : car.image
      ? [car.image]
      : [],
  };
}

async function notifySubscribers(env, car) {
  if (!env.RESEND_API_KEY || !env.NOTIFY_FROM_EMAIL) {
    return;
  }

  const subscribers = await getSubscribers(env);

  if (subscribers.length === 0) {
    return;
  }

  const priceText =
    "Q" + Number(car.price).toLocaleString("es-GT");

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

          subject:
            `Nuevo Deal en AutoRemate: ${car.title}`,

          html: `
            <p>Acaba de entrar un nuevo Deal en AutoRemate:</p>

            <p>
              <b>${car.title}</b> — ${priceText}
            </p>

            <p>
              <a href="${siteUrl}">
                Ver Deal en AutoRemate
              </a>
            </p>
          `,
        }),
      });
    } catch (e) {
      // A failed email must not block publishing the Deal.
    }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    /*
     * ------------------------------------------
     * CORS
     * ------------------------------------------
     */

    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: corsHeaders(request, env),
      });
    }

    /*
     * ------------------------------------------
     * SUBSCRIBE
     * ------------------------------------------
     */

    if (
      path === "/api/subscribe" &&
      request.method === "POST"
    ) {
      const body = await request
        .json()
        .catch(() => ({}));

      const email = (body.email || "")
        .trim()
        .toLowerCase();

      const validEmail =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

      if (!validEmail) {
        return json(
          { error: "Correo inválido" },
          request,
          env,
          400
        );
      }

      const subscribers =
        await getSubscribers(env);

      if (!subscribers.includes(email)) {
        subscribers.push(email);

        await env.CARS_KV.put(
          "subscribers",
          JSON.stringify(subscribers)
        );
      }

      return json(
        { ok: true },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * LOGIN
     * ------------------------------------------
     */

    if (
      path === "/api/login" &&
      request.method === "POST"
    ) {
      const body = await request
        .json()
        .catch(() => ({}));

      if (
        body.password &&
        body.password === env.ADMIN_PASSWORD
      ) {
        return json(
          {
            ok: true,
            token: env.ADMIN_PASSWORD,
          },
          request,
          env
        );
      }

      return json(
        {
          ok: false,
          error: "Contraseña incorrecta",
        },
        request,
        env,
        401
      );
    }

    /*
     * ------------------------------------------
     * LIST DEALS — PUBLIC
     * ------------------------------------------
     */

    if (
      path === "/api/cars" &&
      request.method === "GET"
    ) {
      const cars = await getCars(env);

      const normalizedCars =
        cars.map(normalizeCar);

      return json(
        { cars: normalizedCars },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * GET ONE DEAL — PUBLIC
     *
     * /api/cars/DEAL_ID
     * ------------------------------------------
     */

    const getCarMatch =
      path.match(/^\/api\/cars\/([^/]+)$/);

    if (
      getCarMatch &&
      request.method === "GET"
    ) {
      const cars = await getCars(env);

      const car = cars.find(
        (c) => c.id === getCarMatch[1]
      );

      if (!car) {
        return json(
          { error: "No encontrado" },
          request,
          env,
          404
        );
      }

      return json(
        {
          ok: true,
          car: normalizeCar(car),
        },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * ADD DEAL — ADMIN
     * ------------------------------------------
     */

    if (
      path === "/api/cars" &&
      request.method === "POST"
    ) {
      if (!isAuthed(request, env)) {
        return json(
          { error: "No autorizado" },
          request,
          env,
          401
        );
      }

      const body = await request
        .json()
        .catch(() => null);

      if (!body || !body.title) {
        return json(
          { error: "Datos incompletos" },
          request,
          env,
          400
        );
      }

      const cars = await getCars(env);

      const images =
        Array.isArray(body.images)
          ? body.images.slice(0, 20)
          : body.image
          ? [body.image]
          : [];

      const requestedStatus =
        ["transito", "disponible", "vendido"]
          .includes(body.status)
          ? body.status
          : body.type === "vendido"
          ? "vendido"
          : "transito";

      const car = {
        id: uid(),

        type:
          requestedStatus === "vendido"
            ? "vendido"
            : "venta",

        status: requestedStatus,

        title: body.title.trim(),

        make: (body.make || "").trim(),
        model: (body.model || "").trim(),
        trim: (body.trim || "").trim(),

        year:
          body.year !== undefined &&
          body.year !== ""
            ? Number(body.year)
            : "",

        price: Number(body.price) || 0,

        mileage:
          body.mileage !== undefined &&
          body.mileage !== ""
            ? Number(body.mileage)
            : "",

        transmission:
          (body.transmission || "").trim(),

        fuel:
          (body.fuel || "").trim(),

        drivetrain:
          (body.drivetrain || "").trim(),

        color:
          (body.color || "").trim(),

        titleType:
          (body.titleType || "").trim(),

        images,

        damage:
          (body.damage || "").trim(),

        arrival:
          body.arrival || "",

        stock:
          (body.stock || "").trim(),

        createdAt: Date.now(),

        updatedAt: Date.now(),
      };

      cars.unshift(car);

      await saveCars(env, cars);

      if (car.type === "venta") {
        await notifySubscribers(env, car);
      }

      return json(
        {
          ok: true,
          car: normalizeCar(car),
        },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * EDIT DEAL — ADMIN
     *
     * PATCH /api/cars/DEAL_ID
     * ------------------------------------------
     */

    const editMatch =
      path.match(/^\/api\/cars\/([^/]+)$/);

    if (
      editMatch &&
      request.method === "PATCH"
    ) {
      if (!isAuthed(request, env)) {
        return json(
          { error: "No autorizado" },
          request,
          env,
          401
        );
      }

      const body = await request
        .json()
        .catch(() => null);

      if (!body) {
        return json(
          { error: "Datos inválidos" },
          request,
          env,
          400
        );
      }

      const cars = await getCars(env);

      const index = cars.findIndex(
        (c) => c.id === editMatch[1]
      );

      if (index === -1) {
        return json(
          { error: "No encontrado" },
          request,
          env,
          404
        );
      }

      const car = normalizeCar(cars[index]);

      const textFields = [
        "title",
        "make",
        "model",
        "trim",
        "transmission",
        "fuel",
        "drivetrain",
        "color",
        "titleType",
        "damage",
        "arrival",
        "stock",
      ];

      for (const field of textFields) {
        if (body[field] !== undefined) {
          car[field] =
            typeof body[field] === "string"
              ? body[field].trim()
              : body[field];
        }
      }

      if (body.price !== undefined) {
        car.price =
          Number(body.price) || 0;
      }

      if (body.year !== undefined) {
        car.year =
          body.year === ""
            ? ""
            : Number(body.year);
      }

      if (body.mileage !== undefined) {
        car.mileage =
          body.mileage === ""
            ? ""
            : Number(body.mileage);
      }

      if (Array.isArray(body.images)) {
        car.images =
          body.images.slice(0, 20);
      }

      if (
        body.status !== undefined &&
        ["transito", "disponible", "vendido"]
          .includes(body.status)
      ) {
        car.status = body.status;

        car.type =
          body.status === "vendido"
            ? "vendido"
            : "venta";
      }

      car.updatedAt = Date.now();

      cars[index] = car;

      await saveCars(env, cars);

      return json(
        {
          ok: true,
          car: normalizeCar(car),
        },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * MARK AS SOLD — ADMIN
     *
     * Kept for compatibility with current Admin.
     * ------------------------------------------
     */

    const soldMatch =
      path.match(
        /^\/api\/cars\/([^/]+)\/sell$/
      );

    if (
      soldMatch &&
      request.method === "POST"
    ) {
      if (!isAuthed(request, env)) {
        return json(
          { error: "No autorizado" },
          request,
          env,
          401
        );
      }

      const cars = await getCars(env);

      const car = cars.find(
        (c) => c.id === soldMatch[1]
      );

      if (!car) {
        return json(
          { error: "No encontrado" },
          request,
          env,
          404
        );
      }

      car.type = "vendido";
      car.status = "vendido";
      car.updatedAt = Date.now();

      await saveCars(env, cars);

      return json(
        {
          ok: true,
          car: normalizeCar(car),
        },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * DELETE DEAL — ADMIN
     * ------------------------------------------
     */

    const delMatch =
      path.match(/^\/api\/cars\/([^/]+)$/);

    if (
      delMatch &&
      request.method === "DELETE"
    ) {
      if (!isAuthed(request, env)) {
        return json(
          { error: "No autorizado" },
          request,
          env,
          401
        );
      }

      let cars = await getCars(env);

      const exists = cars.some(
        (c) => c.id === delMatch[1]
      );

      if (!exists) {
        return json(
          { error: "No encontrado" },
          request,
          env,
          404
        );
      }

      cars = cars.filter(
        (c) => c.id !== delMatch[1]
      );

      await saveCars(env, cars);

      return json(
        { ok: true },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * UPLOAD IMAGE — ADMIN
     * ------------------------------------------
     */

    if (
      path === "/api/upload" &&
      request.method === "POST"
    ) {
      if (!isAuthed(request, env)) {
        return json(
          { error: "No autorizado" },
          request,
          env,
          401
        );
      }

      const form =
        await request.formData();

      const file =
        form.get("file");

      if (!file) {
        return json(
          { error: "No se recibió archivo" },
          request,
          env,
          400
        );
      }

      const ext =
        (
          file.name
            .split(".")
            .pop() || "jpg"
        ).toLowerCase();

      const key =
        `images/${uid()}.${ext}`;

      await env.IMAGES.put(
        key,
        await file.arrayBuffer(),
        {
          httpMetadata: {
            contentType:
              file.type ||
              "image/jpeg",
          },
        }
      );

      return json(
        {
          ok: true,
          key,
        },
        request,
        env
      );
    }

    /*
     * ------------------------------------------
     * SERVE IMAGE — PUBLIC
     * ------------------------------------------
     */

    if (path.startsWith("/images/")) {
      const key =
        path.slice(1);

      const obj =
        await env.IMAGES.get(key);

      if (!obj) {
        return new Response(
          "Not found",
          {
            status: 404,
            headers:
              corsHeaders(request, env),
          }
        );
      }

      return new Response(
        obj.body,
        {
          headers: {
            "Content-Type":
              obj.httpMetadata
                ?.contentType ||
              "image/jpeg",

            "Cache-Control":
              "public, max-age=31536000",

            ...corsHeaders(
              request,
              env
            ),
          },
        }
      );
    }

    /*
     * ------------------------------------------
     * NOT FOUND
     * ------------------------------------------
     */

    return json(
      { error: "Not found" },
      request,
      env,
      404
    );
  },
};
