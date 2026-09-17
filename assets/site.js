const API = 'https://autoremate-api.jonagar90.workers.dev';
const WA = '50233584071';

let cars = [];

const esc = s =>
  String(s ?? '').replace(
    /[&<>"']/g,
    m => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[m])
  );

const img = k =>
  !k
    ? ''
    : k.startsWith('http')
      ? k
      : `${API}/${k.replace(/^\/+/, '')}`;

const money = n =>
  Number(n) > 0
    ? 'Q ' + Number(n).toLocaleString('en-US')
    : '';

const title = c =>
  c.title ||
  [c.year, c.make, c.model, c.trim]
    .filter(Boolean)
    .join(' ') ||
  'Deal AutoRemate';

const active = c =>
  c.status !== 'vendido' &&
  c.type !== 'vendido';

const stat = c =>
  c.status === 'disponible'
    ? 'DISPONIBLE'
    : 'EN TRÁNSITO';

function card(c, sold = false) {
  const im = (c.images || [])[0];

  const sp = [
    c.fuel,
    c.transmission,
    c.mileage
      ? Number(c.mileage).toLocaleString() + ' millas'
      : ''
  ]
    .filter(Boolean)
    .join(' · ');

  return `
    <article class="dealcard" onclick="openDeal('${esc(c.id)}')">
      <div class="dealimg">
        ${
          im
            ? `<img src="${esc(img(im))}" alt="${esc(title(c))}" loading="lazy">`
            : `<div class="noimg">AutoRemate</div>`
        }
        <span class="badge ${sold ? 'sold' : ''}">
          ${sold ? 'VENDIDO' : esc(stat(c))}
        </span>
      </div>

      <div class="dealbody">
        <h3>${esc(title(c))}</h3>

        ${
          sp
            ? `<p class="spec">${esc(sp)}</p>`
            : ''
        }

        ${
          !sold && money(c.price)
            ? `<div class="price">${esc(money(c.price))}</div>`
            : ''
        }

        <button class="linkbtn" type="button">
          ${sold ? 'VER VEHÍCULO' : 'VER DEAL →'}
        </button>
      </div>
    </article>
  `;
}

async function load() {
  try {
    const r = await fetch(API + '/api/cars');

    if (!r.ok) {
      throw new Error(`API ${r.status}`);
    }

    const data = await r.json();

    cars = Array.isArray(data)
      ? data
      : Array.isArray(data.cars)
        ? data.cars
        : [];

    render();
    openFromUrl();
  } catch (e) {
    console.error('Error cargando Deals:', e);

    document
      .querySelectorAll('[data-cars]')
      .forEach(x => {
        x.innerHTML =
          '<div class="empty">No pudimos cargar los Deals. Intenta nuevamente.</div>';
      });
  }
}

function render() {
  const available = cars.filter(active);
  const sold = cars.filter(c => !active(c));

  const activeContainer =
    document.querySelector('[data-cars="active"]');

  const soldContainer =
    document.querySelector('[data-cars="sold"]');

  if (activeContainer) {
    activeContainer.innerHTML =
      available.map(c => card(c)).join('') ||
      '<div class="empty">No hay Deals disponibles en este momento.</div>';
  }

  if (soldContainer) {
    soldContainer.innerHTML =
      sold.map(c => card(c, true)).join('') ||
      '<div class="empty">Todavía no hay Deals vendidos para mostrar.</div>';
  }
}

function openDeal(id) {
  const c = cars.find(
    x => String(x.id) === String(id)
  );

  if (!c) return;

  const ims = c.images || [];

  const facts = [
    [
      'Estado',
      active(c) ? stat(c) : 'VENDIDO'
    ],
    [
      'Llegada estimada',
      c.arrival || ''
    ],
    [
      'Stock',
      c.stock || ''
    ],
    [
      'Millaje',
      c.mileage
        ? Number(c.mileage).toLocaleString() + ' millas'
        : ''
    ],
    [
      'Transmisión',
      c.transmission || ''
    ],
    [
      'Combustible',
      c.fuel || ''
    ],
    [
      'Tracción',
      c.drivetrain || ''
    ],
    [
      'Color',
      c.color || ''
    ],
    [
      'Tipo de título',
      c.titleType || ''
    ],
    [
      'Condición / daño',
      c.damage || ''
    ]
  ].filter(x => x[1]);

  const dealUrl =
    `${location.origin}${location.pathname}?deal=${encodeURIComponent(c.id)}`;

  const waText = [
    `Hola AutoRemate, me interesa el Deal: ${title(c)}.`,
    c.stock ? `Stock: ${c.stock}.` : '',
    `Link: ${dealUrl}`
  ]
    .filter(Boolean)
    .join(' ');

  const gallery = ims.length
    ? `
      <div class="gallery">
        <div class="mainphoto">
          <img
            id="mainDealPhoto"
            src="${esc(img(ims[0]))}"
            alt="${esc(title(c))}"
          >
        </div>

        ${
          ims.length > 1
            ? `
              <div class="thumbs">
                ${ims.map((x, i) => `
                  <button
                    type="button"
                    class="thumb ${i === 0 ? 'active' : ''}"
                    onclick="changeDealPhoto('${esc(img(x))}', this)"
                  >
                    <img
                      src="${esc(img(x))}"
                      alt="Foto ${i + 1} de ${esc(title(c))}"
                    >
                  </button>
                `).join('')}
              </div>
            `
            : ''
        }
      </div>
    `
    : `
      <div class="gallery">
        <div class="mainphoto noimg">
          AutoRemate
        </div>
      </div>
    `;

  const factsHtml = facts.length
    ? `
      <div class="facts">
        ${facts.map(([label, value]) => `
          <div class="fact">
            <span>${esc(label)}</span>
            <strong>${esc(value)}</strong>
          </div>
        `).join('')}
      </div>
    `
    : '';

  const priceHtml =
    active(c) && money(c.price)
      ? `<div class="modalprice">${esc(money(c.price))}</div>`
      : '';

  const whatsappHtml =
    active(c)
      ? `
        <a
          class="btn green modalwa"
          href="https://wa.me/${WA}?text=${encodeURIComponent(waText)}"
          target="_blank"
          rel="noopener"
        >
          WhatsApp · +502 3358 4071
        </a>
      `
      : '';

  document.getElementById('modalContent').innerHTML = `
    <div class="modalgrid">
      ${gallery}

      <div class="modalinfo">
        <div class="modalstatus">
          ${active(c) ? esc(stat(c)) : 'VENDIDO'}
        </div>

        <h2>${esc(title(c))}</h2>

        ${priceHtml}

        ${factsHtml}

        <p class="modalnote">
          Fotografías reales del vehículo.
          Consulta las condiciones de compra por WhatsApp.
        </p>

        ${whatsappHtml}
      </div>
    </div>
  `;

  document
    .getElementById('dealModal')
    .classList.add('open');

  document.body.classList.add('modalopen');

  history.pushState(
    {},
    '',
    `${location.pathname}?deal=${encodeURIComponent(c.id)}`
  );
}

function changeDealPhoto(src, button) {
  const main = document.getElementById('mainDealPhoto');

  if (main) {
    main.src = src;
  }

  document
    .querySelectorAll('.thumb')
    .forEach(x => x.classList.remove('active'));

  if (button) {
    button.classList.add('active');
  }
}

function closeDeal() {
  document
    .getElementById('dealModal')
    .classList.remove('open');

  document.body.classList.remove('modalopen');

  history.pushState(
    {},
    '',
    location.pathname
  );
}

function openFromUrl() {
  const id =
    new URLSearchParams(location.search).get('deal');

  if (id) {
    openDeal(id);
  }
}

document.addEventListener(
  'DOMContentLoaded',
  () => {
    load();

    document
      .getElementById('closeModal')
      .onclick = closeDeal;

    document
      .getElementById('dealModal')
      .onclick = e => {
        if (e.target.id === 'dealModal') {
          closeDeal();
        }
      };

    document.addEventListener(
      'keydown',
      e => {
        if (e.key === 'Escape') {
          closeDeal();
        }
      }
    );
  }
);
