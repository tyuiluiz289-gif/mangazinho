// mangazinho-multichapter.js // Drop-in de armazenamento local com suporte a múltiplos capítulos // Estratégia: LocalStorage (simples). Se você armazena imagens em base64, cuidado com limite ~5–10MB por domínio. // Se precisar guardar MUITAS páginas offline, recomendo migrar depois para IndexedDB/localForage.

/**

Estrutura v2:

{

version: 2,

series: [{ id, title, createdAt, updatedAt }],

chapters: [{ id, seriesId, number, title, createdAt, updatedAt, pageCount }],

pagesByChapter: {

[chapterId]: [{ index, src, width, height }]

}

} */


const KEY = "mangazinho_v2";

function now(){ return Date.now(); } function uid(){ return crypto.randomUUID ? crypto.randomUUID() : ("id-"+Math.random().toString(36).slice(2)); }

function loadDB(){ const raw = localStorage.getItem(KEY); if(!raw){ // tenta migrar do v1 se existir const migrated = migrateFromV1(); if(migrated) return migrated; const fresh = { version:2, series:[], chapters:[], pagesByChapter:{} }; localStorage.setItem(KEY, JSON.stringify(fresh)); return fresh; } try{ return JSON.parse(raw); }catch(e){ console.warn("DB corrompido, resetando", e); const fresh = { version:2, series:[], chapters:[], pagesByChapter:{} }; localStorage.setItem(KEY, JSON.stringify(fresh)); return fresh; } }

function saveDB(db){ localStorage.setItem(KEY, JSON.stringify(db)); }

// --- MIGRAÇÃO V1 -> V2 --- // Esperado do v1 (pelo seu export): { version:1, series:[{id,title}], chapters:[], pages:{} } // Onde pages representava o capítulo atual. Migra para um capítulo único dentro da série existente. function migrateFromV1(){ const rawOld = localStorage.getItem("mangazinho_export"); // caso você tenha usado outra key, ajuste aqui // Também tentamos ler do arquivo importado manualmente no app, se você jogou em localStorage com outra chave // Se não houver nada, retorna null. try { if(!rawOld) return null; const old = JSON.parse(rawOld); if(!old || old.version !== 1) return null;

const db = { version:2, series:[], chapters:[], pagesByChapter:{} };

// Copia séries
const series = Array.isArray(old.series) ? old.series : [];
db.series = series.map(s => ({
  id: s.id || uid(),
  title: s.title || "Sem título",
  createdAt: s.createdAt || now(),
  updatedAt: now(),
}));

// Cria um capítulo a partir de pages (capítulo único)
if(old.pages && Object.keys(old.pages).length){
  const seriesId = db.series[0] ? db.series[0].id : uid();
  if(!db.series.length){
    db.series.push({ id: seriesId, title: "Série Migrada", createdAt: now(), updatedAt: now() });
  }
  const chapId = uid();
  const pagesArr = Object.keys(old.pages)
    .map(k => old.pages[k])
    .sort((a,b)=> (a.index??0) - (b.index??0));
  db.chapters.push({ id: chapId, seriesId, number: 1, title: "Capítulo Migrado", createdAt: now(), updatedAt: now(), pageCount: pagesArr.length });
  db.pagesByChapter[chapId] = pagesArr.map(p => ({ index: p.index ?? 0, src: p.src || p.url || "", width: p.width||null, height: p.height||null }));
}

saveDB(db);
console.info("Migração v1 -> v2 concluída");
return db;

} catch(e){ console.warn("Falha ao migrar v1:", e); return null; } }

// --- API PÚBLICA --- export const Store = { get(){ return loadDB(); },

reset(){ const fresh = { version:2, series:[], chapters:[], pagesByChapter:{} }; saveDB(fresh); return fresh; },

// Séries upsertSeries({ id, title }){ const db = loadDB(); if(!id) id = uid(); const i = db.series.findIndex(s => s.id === id); if(i>=0){ db.series[i] = { ...db.series[i], title, updatedAt: now() }; } else { db.series.push({ id, title: title||"Sem título", createdAt: now(), updatedAt: now() }); } saveDB(db); return id; },

listSeries(){ return loadDB().series.slice(); },

// Capítulos upsertChapter({ id, seriesId, number, title }){ const db = loadDB(); if(!seriesId) throw new Error("seriesId obrigatório"); if(!id) id = uid(); const i = db.chapters.findIndex(c => c.id === id); if(i>=0){ db.chapters[i] = { ...db.chapters[i], seriesId, number, title, updatedAt: now() }; } else { db.chapters.push({ id, seriesId, number: number ?? null, title: title||Capítulo ${number??"?"}, createdAt: now(), updatedAt: now(), pageCount: 0 }); } saveDB(db); return id; },

listChapters(seriesId){ const db = loadDB(); return db.chapters.filter(c => c.seriesId === seriesId).sort((a,b)=> (a.number??0)-(b.number??0) || a.createdAt-b.createdAt); },

deleteChapter(chapterId){ const db = loadDB(); db.chapters = db.chapters.filter(c => c.id !== chapterId); delete db.pagesByChapter[chapterId]; saveDB(db); },

// Páginas savePages(chapterId, pages){ // pages: array de { index, src, width?, height? } const db = loadDB(); if(!db.pagesByChapter[chapterId]) db.pagesByChapter[chapterId] = []; // normaliza e ordena const norm = pages.map(p => ({ index: p.index ?? 0, src: p.src || p.url || "", width: p.width||null, height: p.height||null })); norm.sort((a,b)=> a.index-b.index); db.pagesByChapter[chapterId] = norm; const chap = db.chapters.find(c => c.id === chapterId); if(chap){ chap.pageCount = norm.length; chap.updatedAt = now(); } saveDB(db); },

getPages(chapterId){ const db = loadDB(); return (db.pagesByChapter[chapterId] || []).slice().sort((a,b)=> a.index-b.index); },

// Export/Import export(){ return JSON.stringify(loadDB()); },

import(json, { merge = true } = {}){ const incoming = typeof json === "string" ? JSON.parse(json) : json; if(!incoming || incoming.version !== 2) throw new Error("Somente import v2 suportado neste helper"); if(!merge){ saveDB(incoming); return; }

const db = loadDB();
// mescla séries
const seriesMap = new Map(db.series.map(s => [s.id, s]));
(incoming.series||[]).forEach(s => { seriesMap.set(s.id, { ...seriesMap.get(s.id), ...s, updatedAt: now() }); });
db.series = Array.from(seriesMap.values());

// mescla capítulos
const chMap = new Map(db.chapters.map(c => [c.id, c]));
(incoming.chapters||[]).forEach(c => { chMap.set(c.id, { ...chMap.get(c.id), ...c, updatedAt: now() }); });
db.chapters = Array.from(chMap.values());

// mescla páginas
db.pagesByChapter = db.pagesByChapter || {};
Object.entries(incoming.pagesByChapter||{}).forEach(([cid, pages]) => {
  db.pagesByChapter[cid] = pages; // simples: sobrescreve por capítulo
});

saveDB(db);

} };

// --- EXEMPLOS DE USO --- // 1) Criar/pegar série // const seriesId = Store.upsertSeries({ title: "Tirano" }); // 2) Criar capítulo // const chapId = Store.upsertChapter({ seriesId, number: 1, title: "Cap. 1" }); // 3) Salvar páginas // Store.savePages(chapId, [ //   { index: 1, src: "https://.../01.jpg" }, //   { index: 2, src: "https://.../02.jpg" } // ]); // 4) Listar capítulos // const chs = Store.listChapters(seriesId); // 5) Carregar páginas para leitura // const pages = Store.getPages(chapId); // 6) Exportar JSON // const json = Store.export();

// --- INTEGRAÇÃO NO LEITOR --- // Onde hoje você carregava "pages" único, troque por: // const pages = Store.getPages(chapterId); // E quando for baixar/salvar um novo capítulo: // const chapId = Store.upsertChapter({ seriesId, number, title }); // Store.savePages(chapId, pagesArray); // Depois, para o menu "Capítulos", popule com Store.listChapters(seriesId).

