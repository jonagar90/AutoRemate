const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8',...headers}});
function cors(req,env){const origin=req.headers.get('Origin')||'';const configured=(env.ALLOWED_ORIGIN||'').replace(/\/$/,'');const allowed=new Set([configured,configured.replace('://www.','://'),configured.includes('://www.')?configured:configured.replace('://','://www.'),'https://jonagar90.github.io'].filter(Boolean));return {'Access-Control-Allow-Origin':allowed.has(origin)?origin:(configured||origin||'*'),'Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS','Vary':'Origin'}}
const auth=(req,env)=>(req.headers.get('Authorization')||'')===`Bearer ${env.ADMIN_PASSWORD}`;
const clean=s=>typeof s==='string'?s.trim():s;
function normalize(c={}){const status=c.status||(c.type==='vendido'?'vendido':'transito');return {...c,status,type:status==='vendido'?'vendido':'venta',year:c.year??'',make:c.make??'',model:c.model??'',trim:c.trim??'',engine:c.engine??'',fuel:c.fuel??'',transmission:c.transmission??'',drivetrain:c.drivetrain??'',mileage:c.mileage??'',passengers:c.passengers??'',color:c.color??'',titleType:c.titleType??'',stock:c.stock??'',damage:c.damage??'',conditionDescription:c.conditionDescription??'',arrival:c.arrival??'',equipment:Array.isArray(c.equipment)?c.equipment:[],images:Array.isArray(c.images)?c.images:(c.image?[c.image]:[])}}
async function getCars(env){const raw=await env.CARS_KV.get('cars');let a=[];try{a=raw?JSON.parse(raw):[]}catch{}return Array.isArray(a)?a.map(normalize):[]}
async function putCars(env,cars){await env.CARS_KV.put('cars',JSON.stringify(cars))}
function mergeCar(old,b){const n={...old};for(const k of ['status','type','year','make','model','trim','title','price','stock','engine','fuel','transmission','drivetrain','mileage','passengers','color','titleType','arrival','damage','conditionDescription'])if(k in b)n[k]=clean(b[k]);if(Array.isArray(b.equipment))n.equipment=b.equipment.map(clean).filter(Boolean);if(Array.isArray(b.images))n.images=b.images.slice(0,20);if(n.status)n.type=n.status==='vendido'?'vendido':'venta';n.updatedAt=new Date().toISOString();return normalize(n)}
export default{async fetch(req,env){const u=new URL(req.url),H=cors(req,env);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:H});
try{
if(u.pathname==='/api/admin/login'&&req.method==='POST'){const b=await req.json();return json({ok:b.password===env.ADMIN_PASSWORD},b.password===env.ADMIN_PASSWORD?200:401,H)}
if(u.pathname==='/api/cars'&&req.method==='GET')return json({cars:await getCars(env)},200,H);
if(/^\/api\/cars\/[^/]+$/.test(u.pathname)&&req.method==='GET'){const id=decodeURIComponent(u.pathname.split('/').pop()),c=(await getCars(env)).find(x=>String(x.id)===id);return c?json({car:c},200,H):json({error:'No encontrado'},404,H)}
if(u.pathname==='/api/cars'&&req.method==='POST'){if(!auth(req,env))return json({error:'No autorizado'},401,H);const b=await req.json(),cars=await getCars(env);const c=mergeCar({id:crypto.randomUUID(),createdAt:new Date().toISOString(),images:[],equipment:[]},b);cars.unshift(c);await putCars(env,cars);return json({ok:true,car:c},201,H)}
if(/^\/api\/cars\/[^/]+$/.test(u.pathname)&&req.method==='PATCH'){if(!auth(req,env))return json({error:'No autorizado'},401,H);const id=decodeURIComponent(u.pathname.split('/').pop()),b=await req.json(),cars=await getCars(env),i=cars.findIndex(x=>String(x.id)===id);if(i<0)return json({error:'No encontrado'},404,H);cars[i]=mergeCar(cars[i],b);await putCars(env,cars);return json({ok:true,car:cars[i]},200,H)}
if(/^\/api\/cars\/[^/]+\/sell$/.test(u.pathname)&&req.method==='POST'){if(!auth(req,env))return json({error:'No autorizado'},401,H);const id=decodeURIComponent(u.pathname.split('/')[3]),cars=await getCars(env),i=cars.findIndex(x=>String(x.id)===id);if(i<0)return json({error:'No encontrado'},404,H);cars[i]=mergeCar(cars[i],{status:'vendido',type:'vendido'});await putCars(env,cars);return json({ok:true,car:cars[i]},200,H)}
if(/^\/api\/cars\/[^/]+$/.test(u.pathname)&&req.method==='DELETE'){if(!auth(req,env))return json({error:'No autorizado'},401,H);const id=decodeURIComponent(u.pathname.split('/').pop()),cars=await getCars(env),next=cars.filter(x=>String(x.id)!==id);await putCars(env,next);return json({ok:true},200,H)}
if(u.pathname==='/api/upload'&&req.method==='POST'){if(!auth(req,env))return json({error:'No autorizado'},401,H);const fd=await req.formData(),f=fd.get('file');if(!f||typeof f==='string')return json({error:'Archivo requerido'},400,H);if(!String(f.type||'').startsWith('image/'))return json({error:'Solo imágenes'},400,H);const ext=(f.name.split('.').pop()||'jpg').replace(/[^a-z0-9]/gi,'').toLowerCase();const key=`cars/${Date.now()}-${crypto.randomUUID()}.${ext}`;await env.IMAGES.put(key,await f.arrayBuffer(),{httpMetadata:{contentType:f.type||'image/jpeg'}});return json({ok:true,key},200,H)}
if(req.method==='GET'&&!u.pathname.startsWith('/api/')){
 const requested=decodeURIComponent(u.pathname.replace(/^\/+/, ''));
 const candidates=[requested];
 if(requested&&!requested.startsWith('cars/'))candidates.push('cars/'+requested);
 if(requested.startsWith('images/'))candidates.push(requested.slice(7));
 if(requested.startsWith('cars/images/'))candidates.push(requested.slice(5));
 let o=null;
 for(const key of [...new Set(candidates.filter(Boolean))]){o=await env.IMAGES.get(key);if(o)break}
 if(o){const hd=new Headers(H);o.writeHttpMetadata(hd);hd.set('etag',o.httpEtag);hd.set('cache-control','public,max-age=31536000,immutable');return new Response(o.body,{headers:hd})}
}
if(u.pathname==='/api/subscribe'&&req.method==='POST'){const b=await req.json(),email=String(b.email||'').trim().toLowerCase();if(!email.includes('@'))return json({error:'Correo inválido'},400,H);const raw=await env.CARS_KV.get('subscribers');let list=[];try{list=raw?JSON.parse(raw):[]}catch{}if(!list.includes(email)){list.push(email);await env.CARS_KV.put('subscribers',JSON.stringify(list))}return json({ok:true},200,H)}
return new Response('Not found',{status:404,headers:H});
}catch(e){return json({error:'Error interno',detail:String(e.message||e)},500,H)}
}};
