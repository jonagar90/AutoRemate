const API='https://autoremate-api.jonagar90.workers.dev',WA='50233584071';let cars=[];
const esc=s=>String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const image=k=>!k?'':k.startsWith('http')?k:`${API}/${k.replace(/^\/+/,'')}`;
const money=n=>Number(n)>0?'Q '+Number(n).toLocaleString('en-US'):'';
const title=c=>c.title||[c.year,c.make,c.model,c.trim].filter(Boolean).join(' ')||'Deal AutoRemate';
const active=c=>c.status!=='vendido'&&c.type!=='vendido';
const status=c=>c.status==='disponible'?'DISPONIBLE':'EN TRÁNSITO';
const fmtDate=s=>{if(!s)return'';const d=new Date(s+'T12:00:00');return isNaN(d)?s:d.toLocaleDateString('es-GT',{day:'numeric',month:'long',year:'numeric'})};
const icon=(n)=>`<span class="miniIcon">${n}</span>`;
function card(c,sold=false){const im=(c.images||[])[0];const meta=[c.trim,c.fuel,c.transmission,c.mileage?Number(c.mileage).toLocaleString()+' millas':''].filter(Boolean).join(' · ');return `<article class="dealCard" onclick="openDeal('${esc(c.id)}')"><div class="dealImage">${im?`<img src="${esc(image(im))}" alt="${esc(title(c))}" loading="lazy">`:''}<span class="dealBadge ${sold?'sold':c.status==='disponible'?'available':''}">${sold?'VENDIDO':esc(status(c))}</span></div><div class="dealBody"><h3>${esc(title(c).toUpperCase())}</h3><div class="dealMeta">${esc(meta)}</div>${!sold&&money(c.price)?`<div class="dealPrice">${esc(money(c.price))}</div>`:''}</div></article>`}
async function load(){try{const r=await fetch(API+'/api/cars');if(!r.ok)throw Error();const d=await r.json();cars=Array.isArray(d)?d:Array.isArray(d.cars)?d.cars:[];render();openFromUrl()}catch(e){document.querySelectorAll('[data-cars]').forEach(x=>x.innerHTML='<div class="empty">No pudimos cargar los Deals.</div>')}}
function render(){const a=cars.filter(active),s=cars.filter(c=>!active(c));document.querySelector('[data-cars="active"]').innerHTML=a.map(c=>card(c)).join('')||'<div class="empty">No hay Deals disponibles.</div>';document.querySelector('[data-cars="sold"]').innerHTML=s.map(c=>card(c,true)).join('')||'<div class="empty">Todavía no hay Deals vendidos.</div>'}
function specRows(c){return [['Año',c.year],['Marca',c.make],['Modelo',[c.model,c.trim].filter(Boolean).join(' ')],['Motor',c.engine],['Combustible',c.fuel],['Transmisión',c.transmission],['Tracción',c.drivetrain],['Kilometraje',c.mileage?Number(c.mileage).toLocaleString()+' millas':''],['Color',c.color],['Título',c.titleType]].filter(x=>x[1]).map(([a,b])=>`<div class="specRow"><span>${esc(a)}</span><strong>${esc(b)}</strong></div>`).join('')}
function navDeal(id,dir){const list=cars.filter(active);let i=list.findIndex(c=>String(c.id)===String(id));if(i<0||list.length<2)return;openDeal(list[(i+dir+list.length)%list.length].id)}
function goDealPhoto(i,btn){
 const a=window.currentDealImages||[]; if(!a.length)return;
 i=(i+a.length)%a.length; window.currentDealPhotoIndex=i;
 const m=document.getElementById('mainDealPhoto'),b=document.getElementById('dealPhotoBackdrop'),c=document.getElementById('dealPhotoCount');
 if(m)m.src=a[i]; if(b)b.style.backgroundImage=`url("${a[i]}")`; if(c)c.textContent=i+1;
 document.querySelectorAll('.detailThumb').forEach((x,n)=>x.classList.toggle('selected',n===i));
 const t=btn||document.querySelectorAll('.detailThumb')[i]; if(t)t.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
 if(document.getElementById('photoViewer')?.classList.contains('open')) updatePhotoViewer();
}
function cycleDealPhoto(dir){goDealPhoto((window.currentDealPhotoIndex||0)+dir)}
function scrollDealThumbs(){document.getElementById('detailThumbs')?.scrollBy({left:360,behavior:'smooth'})}
function openPhotoViewer(){
 if(!(window.currentDealImages||[]).length)return;
 let v=document.getElementById('photoViewer');
 if(!v){v=document.createElement('div');v.id='photoViewer';v.className='photoViewer';v.innerHTML=`<button class="viewerClose" onclick="closePhotoViewer()">×</button><button class="viewerNav viewerPrev" onclick="cycleDealPhoto(-1)">‹</button><img id="viewerImg" alt="Fotografía del vehículo"><button class="viewerNav viewerNext" onclick="cycleDealPhoto(1)">›</button><div class="viewerCount" id="viewerCount"></div>`;document.body.appendChild(v)}
 v.classList.add('open');updatePhotoViewer();
}
function updatePhotoViewer(){const a=window.currentDealImages||[],i=window.currentDealPhotoIndex||0,m=document.getElementById('viewerImg'),c=document.getElementById('viewerCount');if(m&&a[i])m.src=a[i];if(c)c.textContent=`${i+1} / ${a.length}`}
function closePhotoViewer(){document.getElementById('photoViewer')?.classList.remove('open')}
function openDeal(id){const c=cars.find(x=>String(x.id)===String(id));if(!c)return;const ims=c.images||[];const isActive=active(c);const u=`${location.origin}${location.pathname}?deal=${encodeURIComponent(c.id)}`;const wt=`Hola AutoRemate, me interesa el Deal: ${title(c)}. Link: ${u}`;const available=c.status==='disponible';
const quick=[['⛽',c.fuel],['⚙',c.transmission],['◉',c.passengers?c.passengers+' pasajeros':c.drivetrain],['⌁',c.mileage?Number(c.mileage).toLocaleString()+' millas':'']].filter(x=>x[1]);
const details=[['Llegada estimada',fmtDate(c.arrival)],['Condición',c.damage],['Stock',c.stock],['Título',c.titleType]].filter(x=>x[1]);
const candidates=cars.filter(x=>active(x)&&String(x.id)!==String(c.id));
const score=x=>(x.make&&c.make&&x.make.toLowerCase()===c.make.toLowerCase()?5:0)+(x.model&&c.model&&x.model.toLowerCase()===c.model.toLowerCase()?6:0)+(x.year&&c.year?Math.max(0,3-Math.abs(Number(x.year)-Number(c.year))):0)+(x.price&&c.price&&Math.abs(Number(x.price)-Number(c.price))/Math.max(Number(c.price),1)<.25?2:0);
const other=candidates.map(x=>({x,s:score(x)})).filter(o=>o.s>0).sort((a,b)=>b.s-a.s).slice(0,4).map(o=>o.x);
window.currentDealImages=ims.map(image);window.currentDealPhotoIndex=0;const thumbs=ims.map((x,i)=>`<button class="detailThumb ${i===0?'selected':''}" onclick="goDealPhoto(${i},this)"><img src="${esc(image(x))}" alt=""></button>`).join('');
const similar=other.length?`<section class="similarDeals"><div class="detailSectionHead"><h3>Vehículos similares</h3><button onclick="closeDeal(true)">Ver todos los deals →</button></div><div class="similarGrid">${other.map(x=>card(x,false)).join('')}</div></section>`:'';
document.getElementById('modalContent').innerHTML=`
<header class="detailHeader"><div class="detailShell detailHeaderInner"><a class="detailLogoLink" href="/" onclick="closeDeal(false)"><img src="assets/autoremate-header.png" class="detailLogo" alt="AutoRemate"></a><nav><a href="#" onclick="closeDeal(true);return false">Deals</a><a href="#vendidos" onclick="closeDeal(true)">Vendidos</a><a href="#contacto" onclick="closeDeal(true)">Contacto</a></nav></div></header>
<main class="detailMain">
<div class="detailShell">
<div class="detailToolbar"><button onclick="closeDeal(true)">← Volver a todos los deals</button><div>${cars.filter(active).length>1?`<button onclick="navDeal('${esc(c.id)}',-1)">← Deal anterior</button><span></span><button onclick="navDeal('${esc(c.id)}',1)">Siguiente deal →</button>`:''}</div></div>
<section class="detailHero">
<div class="detailGallery">
<div class="detailMainPhoto" id="detailMainPhoto">
${ims[0]?`<div id="dealPhotoBackdrop" class="dealPhotoBackdrop" style="background-image:url('${esc(image(ims[0]))}')"></div><img id="mainDealPhoto" src="${esc(image(ims[0]))}" alt="${esc(title(c))}">`:''}
${ims.length>1?`<button class="photoNav photoPrev" onclick="cycleDealPhoto(-1)" aria-label="Foto anterior">‹</button><button class="photoNav photoNext" onclick="cycleDealPhoto(1)" aria-label="Foto siguiente">›</button>`:''}
${ims.length?`<button class="photoExpand" onclick="openPhotoViewer()" aria-label="Ampliar fotografía">↗</button>`:''}
<span class="photoCount">▣ <b id="dealPhotoCount">1</b> / ${Math.max(ims.length,1)}</span></div>
<div class="thumbRail"><div class="detailThumbs" id="detailThumbs">${thumbs}</div>${ims.length>6?`<button class="thumbRailNext" onclick="scrollDealThumbs()" aria-label="Más fotografías">›</button>`:''}</div>
</div>
<div class="detailInfo">
<div class="detailBadges">${isActive?`<span class="orangeBadge">DEAL ${available?'DISPONIBLE':'ACTIVO'}</span><span class="darkBadge">${esc(status(c))}</span>`:`<span class="darkBadge">VENDIDO</span>`}</div>
<h1>${esc(title(c).toUpperCase())}</h1>${c.trim?`<div class="detailTrim">${esc(c.trim.toUpperCase())}</div>`:''}
${quick.length?`<div class="quickSpecs">${quick.map(([i,v])=>`<span><b>${i}</b>${esc(v)}</span>`).join('')}</div>`:''}
${isActive&&money(c.price)?`<div class="detailPrice">${esc(money(c.price))}</div>`:''}
<div class="detailFacts">${details.map(([l,v])=>`<div><span>${esc(l)}:</span><strong>${esc(v)}</strong></div>`).join('')}</div>
${isActive?`<a class="detailWa" target="_blank" rel="noopener" href="https://wa.me/${WA}?text=${encodeURIComponent(wt)}"><img src="assets/whatsapp.svg" alt="">Consultar por WhatsApp <b>›</b></a>`:''}
<p class="detailDisclosure">Las fotografías muestran la condición real del vehículo.<br>Escríbenos para recibir todos los detalles de este deal.</p>
</div></section>
<section class="detailTrust">
<div><svg><use href="#i-tag"/></svg><b>PRECIOS DE<br>OPORTUNIDAD</b></div>
<div><svg><use href="#i-camera"/></svg><b>FOTOS<br>REALES</b></div>
<div><svg><use href="#i-shield"/></svg><b>INFORMACIÓN<br>CLARA</b></div>
<div><img src="assets/experience-handshake.svg" alt=""><b>+20 AÑOS DE<br>EXPERIENCIA</b></div>
</section>
<section class="detailColumns">
<div><h3>Especificaciones</h3>${specRows(c)||'<p class="muted">Información por confirmar.</p>'}</div>
<div><h3>Condición del vehículo</h3><p>${c.conditionDescription?esc(c.conditionDescription):(c.damage?`Condición reportada: <strong>${esc(c.damage)}</strong>.`:'Consulta con AutoRemate para conocer la condición reportada del vehículo.')}</p><div class="importantNote"><b>ⓘ &nbsp; Notas importantes</b><p>La información mostrada es la disponible para este Deal. Recomendamos revisar todos los detalles antes de la compra.</p></div></div>
<div><h3>Equipamiento destacado</h3>${Array.isArray(c.equipment)&&c.equipment.length?c.equipment.map(v=>`<div class="infoLine"><span>✓</span>${esc(v)}</div>`).join(''):'<p class="muted">Equipamiento por confirmar.</p>'}</div>
</section>
${similar}
</div></main>`;
const modal=document.getElementById('dealModal');modal.classList.add('open');modal.setAttribute('aria-hidden','false');document.body.style.overflow='hidden';history.pushState({},'',`${location.pathname}?deal=${encodeURIComponent(c.id)}`);modal.scrollTop=0}
function closeDeal(scroll=false){const m=document.getElementById('dealModal');m.classList.remove('open');m.setAttribute('aria-hidden','true');document.body.style.overflow='';history.pushState({},'',location.pathname);if(scroll)setTimeout(()=>document.getElementById('deals')?.scrollIntoView({behavior:'smooth'}),50)}
function openFromUrl(){const id=new URLSearchParams(location.search).get('deal');if(id)openDeal(id)}
document.addEventListener('DOMContentLoaded',()=>{load();document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(document.getElementById('photoViewer')?.classList.contains('open'))closePhotoViewer();else if(document.getElementById('dealModal').classList.contains('open'))closeDeal()}})});
