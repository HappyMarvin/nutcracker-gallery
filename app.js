'use strict';
// Requested lightweight gate. This is intentionally not a security boundary.
const PASSWORD = '1235';
const STORAGE_KEY = 'nutcracker-choice-v1';
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog, currentTab = 'recommended', visibleItems = [], detailId, toastTimer;
let selected = new Set(), makerNote = '';
const intros = {
  recommended: '<p><strong>Начните с S и N01.</strong> Низкое шако проще и оставляет запас сверху; высокая гренадерка выразительнее повторяет свод. Порядок ниже — моя общая рекомендация после просмотра обеих подборок.</p>',
  all: '<p>Все финальные и поисковые варианты двух подборок. Промежуточные версии можно включить отдельно. Коды постоянные: <strong>A–D, P — Codex; N — соседний агент; S — новый синтез.</strong></p>',
  details: '<p>Выбирайте волосы, усы и роспись независимо от шапки. Наш общий ориентир — <strong>две гладкие белые пряди и небольшие шоколадные усы</strong>. Листы можно открыть крупно.</p>',
  references: '<p>Исходная игрушка, набросок, понравившиеся владельцу примеры и ранние поиски других агентов. Это <strong>источники идей</strong>, а не обязательные шаблоны.</p>',
  notes: '<p>Здесь — общая оценка и исходные рассуждения авторов. Совпадения и различия сохранены: единого решения за мастера мы не принимаем.</p>',
  favorites: '<p>Ваш личный список. Сравните варианты рядом, добавьте замечания и скачайте выбор, чтобы передать его владельцу. <strong>На сервер ничего не отправляется.</strong></p>'
};

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false;
  toastTimer = setTimeout(() => { $('#toast').hidden = true; }, 3500);
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ids:[...selected], note:makerNote})); }
  catch { toast('Браузер не сохранил выбор. Скачайте список перед закрытием.'); }
}
function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    selected = new Set(Array.isArray(saved.ids) ? saved.ids.filter(id => catalog.items.some(item => item.id === id)) : []);
    makerNote = typeof saved.note === 'string' ? saved.note : '';
  } catch { selected = new Set(); makerNote = ''; }
  $('#maker-note').value = makerNote;
}
async function unlock() {
  $('#enter').disabled = true; $('#enter').textContent = 'Открываем…';
  try {
    if (!catalog) {
      const response = await fetch('catalog.json');
      if (!response.ok) throw new Error('catalog');
      catalog = await response.json();
      const options = Object.entries(catalog.collections).map(([value,label]) => `<option value="${escapeHTML(value)}">${escapeHTML(label)}</option>`).join('');
      $('#collection').insertAdjacentHTML('beforeend', options);
      const s = catalog.items.find(item => item.id === 'S');
      const n = catalog.items.find(item => item.id === 'N01');
      $('#hero-s').src = s.image; $('#hero-n').src = n.thumb;
      const counts = Object.groupBy ? Object.groupBy(catalog.items, item => item.kind) : null;
      const countKind = kind => counts ? (counts[kind] || []).length : catalog.items.filter(item => item.kind === kind).length;
      $('#catalog-count').textContent = `${countKind('variant')} вариантов и версий · ${countKind('detail')} листов деталей · ${countKind('reference')} референса`;
      $('#essays').innerHTML = catalog.essays.map((essay,index) => `<details class="essay" ${index===0?'open':''}><summary>${escapeHTML(essay.title)}</summary>${essay.note?`<p class="essay-note">${escapeHTML(essay.note)}</p>`:''}<div class="essay-text">${escapeHTML(essay.text)}</div></details>`).join('');
    }
    restore();
    $('#gate').hidden = true; $('#app').hidden = false; $('#password').value = '';
    try { sessionStorage.setItem('nutcracker-open', 'yes'); } catch {}
    render(); updateSelection();
    const id = decodeURIComponent(location.hash.slice(1));
    if (catalog.items.some(item => item.id === id)) openDetail(id);
  } catch {
    $('#login-error').textContent = 'Не удалось загрузить альбом. Проверьте соединение и попробуйте ещё раз.';
  } finally { $('#enter').disabled = false; $('#enter').innerHTML = 'Открыть альбом <span aria-hidden="true">↗</span>'; }
}
$('#login-form').addEventListener('submit', event => {
  event.preventDefault();
  if ($('#password').value.trim() !== PASSWORD) { $('#login-error').textContent = 'Пароль не подошёл. Попробуйте ещё раз.'; $('#password').focus(); return; }
  $('#login-error').textContent = ''; unlock();
});
$('#show-password').addEventListener('click', () => {
  const show = $('#password').type === 'password'; $('#password').type = show ? 'text' : 'password';
  $('#show-password').textContent = show ? 'Скрыть' : 'Показать';
  $('#show-password').setAttribute('aria-label', show ? 'Скрыть пароль' : 'Показать пароль');
});
$('#logout').addEventListener('click', () => {
  try { sessionStorage.removeItem('nutcracker-open'); } catch {}
  $$('dialog[open]').forEach(dialog => dialog.close()); $('#app').hidden = true; $('#gate').hidden = false;
  $('#login-error').textContent = ''; $('#password').type = 'password'; $('#show-password').textContent = 'Показать';
  $('#show-password').setAttribute('aria-label','Показать пароль'); window.scrollTo(0,0); $('#password').focus();
});

function switchTab(tab, scroll = false) {
  currentTab = tab; $('#search').value = ''; $('#collection').value = ''; $('#ease').value = '';
  render(); if (scroll) $('#gallery').scrollIntoView({behavior:'smooth'});
}
$$('[data-tab]').forEach(button => button.addEventListener('click', () => switchTab(button.dataset.tab)));
$('#show-selection').addEventListener('click', () => switchTab('favorites',true));
['search','collection','ease','archives'].forEach(id => $('#'+id).addEventListener(id==='search'?'input':'change', render));
$('#reset-filters').addEventListener('click', () => { $('#search').value=''; $('#collection').value=''; $('#ease').value=''; $('#archives').checked=false; render(); });

function stageLabel(item) {
  if (item.kind === 'reference') return item.tags.includes('Понравился владельцу') ? 'Выбор владельца' : 'Референс';
  if (item.kind === 'detail') return 'Детали и сравнение';
  return ({archive:'Промежуточный',search:'Поиск',final:'Финал'})[item.stage] || '';
}
function favoriteButton(item, full = false) {
  const on = selected.has(item.id);
  return `<button class="favorite${full?' full':''}" data-favorite="${escapeHTML(item.id)}" aria-pressed="${on}" aria-label="${on?'Убрать':'Добавить'} ${escapeHTML(item.id)} ${on?'из выбора':'в выбор'}">${full ? (on?'♥ В вашем выборе':'♡ Добавить в выбор') : (on?'♥':'♡')}</button>`;
}
function render() {
  if (!catalog) return;
  $$('[data-tab]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.tab === currentTab)));
  $('#section-intro').innerHTML = intros[currentTab];
  const notes = currentTab === 'notes'; $('#filters').hidden = notes; $('#essays').hidden = !notes; $('#grid').hidden = notes;
  $('#results-meta').hidden = notes; $('#selection-note').hidden = currentTab !== 'favorites'; $('#archive-filter').hidden = currentTab !== 'all';
  if (notes) { $('#empty').hidden = true; return; }
  let list = catalog.items.filter(item => {
    if (currentTab === 'recommended') return item.rank > 0;
    if (currentTab === 'all') return item.kind === 'variant' && (item.stage !== 'archive' || $('#archives').checked);
    if (currentTab === 'details') return item.kind === 'detail';
    if (currentTab === 'references') return item.kind === 'reference';
    if (currentTab === 'favorites') return selected.has(item.id);
    return false;
  });
  if (currentTab === 'recommended') list.sort((a,b) => a.rank-b.rank);
  if (currentTab === 'favorites') list.sort((a,b) => [...selected].indexOf(a.id)-[...selected].indexOf(b.id));
  const term = $('#search').value.trim().toLocaleLowerCase('ru');
  list = list.filter(item => (!$('#collection').value || item.collection === $('#collection').value) && (!$('#ease').value || item.ease === $('#ease').value) && (!term || [item.id,item.title,item.summary,...item.tags].join(' ').toLocaleLowerCase('ru').includes(term)));
  visibleItems = list;
  $('#results-meta').textContent = `Показано: ${list.length}${currentTab==='recommended'?' · порядок общей рекомендации':''}`;
  $('#grid').innerHTML = list.map(item => `<article class="card" data-id="${escapeHTML(item.id)}"><button class="card-image-button" data-open="${escapeHTML(item.id)}" aria-label="Открыть ${escapeHTML(item.id)}: ${escapeHTML(item.title)}"><img src="${item.thumb}" width="640" height="640" alt="${escapeHTML(item.title)}" loading="lazy" decoding="async">${currentTab==='recommended'?`<span class="card-rank">${String(item.rank).padStart(2,'0')} / Рекомендация</span>`:''}<span class="card-type">${escapeHTML(stageLabel(item))}</span></button><div class="card-heading"><div><span class="card-code">${escapeHTML(item.id)} · ${escapeHTML(catalog.collections[item.collection])}</span><h3>${escapeHTML(item.title)}</h3></div>${favoriteButton(item)}</div><p>${escapeHTML(item.summary)}</p><div class="card-bottom"><span>${escapeHTML(item.ease)}${item.kind==='variant'?' · оценка лепки':''}</span><button data-open="${escapeHTML(item.id)}">Подробнее ↗</button></div></article>`).join('');
  $('#empty').hidden = list.length > 0;
  if (currentTab === 'favorites' && !selected.size) { $('#empty h3').textContent = 'Ваш выбор пока пуст'; $('#empty p').textContent = 'Нажмите сердечко на понравившейся карточке. Можно выбрать и целую фигурку, и отдельный лист деталей.'; }
  else { $('#empty h3').textContent = 'Ничего не найдено'; $('#empty p').textContent = 'Измените поиск или сбросьте фильтры.'; }
}
function toggleFavorite(id) {
  if (!catalog.items.some(item => item.id === id)) return;
  if (selected.has(id)) selected.delete(id); else selected.add(id);
  save(); updateSelection();
  if (currentTab === 'favorites') render();
  if ($('#compare-dialog').open) renderComparison();
}
function updateSelection() {
  const count = selected.size;
  $('#tab-count').textContent = count;
  $('#selection-count').textContent = count ? `В вашем выборе: ${count}` : 'Ничего не выбрано';
  $('#selection-hint').textContent = count ? 'Сохранено в этом браузере' : 'Отметьте варианты сердечком';
  $('#compare').disabled = count < 2; $('#export').disabled = count === 0;
  $$('[data-favorite]').forEach(button => {
    const on = selected.has(button.dataset.favorite);
    button.setAttribute('aria-pressed',String(on));
    button.setAttribute('aria-label',`${on?'Убрать':'Добавить'} ${button.dataset.favorite} ${on?'из выбора':'в выбор'}`);
    button.textContent = button.classList.contains('full') ? (on?'♥ В вашем выборе':'♡ Добавить в выбор') : (on?'♥':'♡');
  });
}
function openDetail(id) {
  const item = catalog.items.find(value => value.id === id); if (!item) return;
  detailId = id;
  $('#detail-code').textContent = `${item.id} / ${catalog.collections[item.collection]}`;
  const block = (title, text, type='') => text ? `<div class="detail-block ${type}"><h3>${title}</h3><p>${escapeHTML(text)}</p></div>` : '';
  $('#detail-content').innerHTML = `<div class="detail-picture"><img src="${item.image}" width="${item.width}" height="${item.height}" alt="${escapeHTML(item.title)}"><a href="${item.image}" target="_blank" rel="noopener">Изображение целиком ↗</a></div><div class="detail-info"><h2 id="detail-title">${escapeHTML(item.title)}</h2><p class="summary">${escapeHTML(item.summary)}</p><div class="badges"><span class="badge">${escapeHTML(stageLabel(item))}</span><span class="badge">${escapeHTML(item.ease)}</span>${item.tags.map(tag=>`<span class="badge">${escapeHTML(tag)}</span>`).join('')}</div>${block('Мысль автора подборки',item.author)}${block('Общая оценка',item.recommendation)}${block('На что обратить внимание',item.caution,'warning')}<div class="detail-actions">${favoriteButton(item,true)}<button id="copy-link">Скопировать ссылку</button></div></div>`;
  $('#previous').disabled = visibleItems.length < 2; $('#next').disabled = visibleItems.length < 2;
  if (!$('#detail-dialog').open) $('#detail-dialog').showModal();
  $('#detail-dialog').scrollTop = 0;
}
function nextDetail(direction) {
  if (!visibleItems.length) return;
  const index = visibleItems.findIndex(item => item.id === detailId);
  openDetail(visibleItems[(index+direction+visibleItems.length)%visibleItems.length].id);
}
$('#previous').addEventListener('click',()=>nextDetail(-1)); $('#next').addEventListener('click',()=>nextDetail(1));
$('#detail-dialog').addEventListener('keydown',event => {
  if (event.key==='ArrowLeft') { event.preventDefault(); nextDetail(-1); }
  if (event.key==='ArrowRight') { event.preventDefault(); nextDetail(1); }
});
function renderComparison() {
  const list = [...selected].map(id => catalog.items.find(item => item.id === id));
  $('#compare-dialog').style.width = `min(${Math.max(560,list.length*440+64)}px, calc(100% - 32px))`;
  $('#compare-content').innerHTML = list.map(item => `<article class="compare-card"><span class="code">${escapeHTML(item.id)} · ${escapeHTML(catalog.collections[item.collection])}</span><img src="${item.image}" alt="${escapeHTML(item.title)}"><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.summary)}</p><p class="reason"><b>ОБЩАЯ ОЦЕНКА</b>${escapeHTML(item.recommendation)}</p><p class="reason quiet"><b>ПРОВЕРИТЬ</b>${escapeHTML(item.caution || 'Размеры и посадку подтверждает реальный образец.')}</p><button data-remove="${item.id}">Убрать из выбора</button></article>`).join('') || '<p>Все варианты убраны из выбора.</p>';
  $('#copy-selection').disabled = !list.length; $('#export-comparison').disabled = !list.length;
}
$('#compare').addEventListener('click',() => { renderComparison(); $('#compare-dialog').showModal(); });
$$('[data-close]').forEach(button => button.addEventListener('click',()=>$('#'+button.dataset.close).close()));
$$('dialog').forEach(dialog => dialog.addEventListener('click', event => { if(event.target===dialog) {const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close();} }));
document.addEventListener('click', async event => {
  const open = event.target.closest('[data-open]'); if (open && catalog) openDetail(open.dataset.open);
  const favorite = event.target.closest('[data-favorite]'); if (favorite) toggleFavorite(favorite.dataset.favorite);
  const remove = event.target.closest('[data-remove]'); if (remove) toggleFavorite(remove.dataset.remove);
  if (event.target.closest('#copy-link')) {
    const url = new URL(location.href); url.hash = detailId;
    try { await navigator.clipboard.writeText(url.href); toast('Ссылка скопирована. Для входа нужен пароль альбома.'); }
    catch { toast('Копирование недоступно. Скачайте список выбора.'); }
  }
});
$('#maker-note').addEventListener('input',()=> { makerNote = $('#maker-note').value; save(); });
function selectionText() {
  const url = new URL(location.href); url.hash='';
  return ['ЩЕЛКУНЧИК В СКОРЛУПКЕ — ВЫБОР МАСТЕРА',`Дата: ${new Date().toLocaleDateString('ru-RU')}`,`Альбом: ${url.href}`,'',...[...selected].map((id,index)=> {
    const item = catalog.items.find(item=>item.id===id);
    return `${index+1}. ${item.id} — ${item.title}\nПодборка: ${catalog.collections[item.collection]}\n${item.summary}\nСсылка: ${url.href}#${encodeURIComponent(item.id)}`;
  }), '', 'ЗАМЕЧАНИЯ МАСТЕРА',makerNote.trim() || 'Пока без замечаний.','', 'Выбор сохранён пользователем из рабочего альбома. Реальная посадка и время лепки проверяются на образце.'].join('\n\n');
}
function downloadSelection() {
  const blob = new Blob(['\ufeff',selectionText()],{type:'text/plain;charset=utf-8'}); const href=URL.createObjectURL(blob);
  const a=document.createElement('a'); a.href=href; a.download='Щелкунчик — выбор мастера.txt'; document.body.append(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(href),1000); toast('Список выбора скачан');
}
$('#export').addEventListener('click',downloadSelection); $('#export-comparison').addEventListener('click',downloadSelection);
$('#copy-selection').addEventListener('click',async()=> { try {await navigator.clipboard.writeText(selectionText());toast('Выбор скопирован');} catch {toast('Копирование недоступно. Используйте «Скачать список».');} });
try { if(sessionStorage.getItem('nutcracker-open')==='yes') unlock(); } catch {}
