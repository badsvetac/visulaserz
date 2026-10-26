// The site's own pages, written at build time (scripts/build-production.mjs) from the scene and tool
// catalogues and the words in copy.mjs: a page for every scene and every tool, the two indexes, the
// use-case pages in English and Turkish, the sitemap and robots.txt. Plain HTML and one stylesheet,
// no script: they are there to be read, by people and by search engines, and each one leads into
// the app (/?scene=<id>, /?tool=<id>).
import { SCENE_GROUPS, TOOL_GROUPS, ENERGY, TOOL_COPY, UI, SCENE_STEPS, TOOL_STEPS, USE_CASES, TR_NAMES, INDEX } from './copy.mjs';

export const ORIGIN = 'https://visulaserz.com';
const FONTS = 'https://fonts.googleapis.com/css2?family=Michroma&family=Saira+Semi+Condensed:wght@400;500;600&family=Martian+Mono:wght@400;500&display=swap';
const YEAR = 2026;

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Capitals the Turkish way for a Turkish name (Çini is ÇİNİ, not ÇINI).
const upper = (s) => (/[çğıöşüÇĞİÖŞÜ]/.test(s) ? s.toLocaleUpperCase('tr') : s.toUpperCase());
// Michroma, the wordmark's face, is for plain Latin names; the others are set in the body face.
const plate = (s) => (/^[ -~]+$/.test(s) ? ' class="plate"' : '');
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
// Every page also names the site and the app, so its references by @id resolve on the page itself.
const WEBSITE = { '@type': 'WebSite', '@id': `${ORIGIN}/#website`, url: `${ORIGIN}/`, name: 'Visulaserz' };
const APP = { '@type': 'WebApplication', '@id': `${ORIGIN}/#app`, name: 'Visulaserz', url: `${ORIGIN}/`, applicationCategory: 'MultimediaApplication', operatingSystem: 'Any', browserRequirements: 'A current browser with WebGL 2', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } };
const jsonLd = (graph) => JSON.stringify({ '@context': 'https://schema.org', '@graph': [...graph, WEBSITE] }).replace(/</g, '\\u003c');

export function buildSite({ scenes, tools, sceneOg, toolOg, cards, css }) {
  const known = new Set(['/']);
  const links = [];                          // every address the pages point at, checked at the end
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const toolById = new Map(tools.map((t) => [t.id, t]));
  const turkish = scenes.filter((s) => s.tags.includes('turkish'));
  const vars = {
    scenes: String(scenes.length),
    free: String(scenes.filter((s) => !s.requiresAccount).length),
    tools: String(tools.length),
    instruments: String(tools.length - 1),
    turkish: String(turkish.length),
    turkishList: list(turkish.map((s) => `[${TR_NAMES[s.id] || s.name}](/scene/${s.id})`), 'tr'),
  };
  const fill = (text, more = {}) => String(text).replace(/\{(\w+)\}/g, (m, k) => (k in more ? more[k] : k in vars ? vars[k] : m));
  const href = (to) => { links.push(to); return to; };
  // **bold** and [label](/address) in otherwise escaped text
  const inline = (text, more) => esc(fill(text, more))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(((?:\/|https:\/\/)[^)\s]*)\)/g, (_, label, to) => (to.startsWith('https:') ? `<a href="${to}" rel="noopener">${label}</a>` : `<a href="${href(to)}">${label}</a>`));
  const thumbUrl = (s) => (s.thumb ? `/assets/scenes/${s.thumb}` : null);
  const toolThumb = (t) => (t.thumb ? `/assets/tools/${t.thumb}` : null);
  const energyOf = (e) => ENERGY.find((x) => e >= x.min);

  // ── the frame every page shares ─────────────────────────────────────────────
  function bar(lang, route, other) {
    const ui = UI[lang];
    const nav = ui.nav.map(([to, label]) => `<a href="${href(to)}"${to === route ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
    const switcher = `<a class="lang" href="${href(other)}" hreflang="${lang === 'tr' ? 'en' : 'tr'}" lang="${lang === 'tr' ? 'en' : 'tr'}">${ui.other}</a>`;
    return `<header class="bar"><div class="wrap bar-row"><a class="mark" href="/">VISULASERZ</a><nav class="nav" aria-label="${ui.site}">${nav}${switcher}</nav><a class="btn btn-small" href="/">${esc(ui.open)}</a></div></header>`;
  }
  function footer(lang) {
    const f = UI[lang].footer;
    const col = (title, items, attrs = '') => `<div${attrs}><p class="foot-h">${esc(title)}</p><ul>${items.map(([to, label]) => `<li><a href="${href(to)}">${esc(label)}</a></li>`).join('')}</ul></div>`;
    const en = USE_CASES.filter((u) => u.lang === 'en'), tr = USE_CASES.filter((u) => u.lang === 'tr');
    const shortTitle = (u) => u.title.split(' — ')[0].split(' | ')[0];
    return `<footer class="foot"><div class="wrap"><div class="foot-cols">${
      col(f.scenes, [['/scenes', lang === 'tr' ? 'Tüm sahneler' : 'All scenes'], ...Object.keys(SCENE_GROUPS).map((g) => [`/scenes#${slug(g)}`, g])])
    }${col(f.tools, [['/tools', lang === 'tr' ? 'Tüm araçlar' : 'All tools'], ['/tool/studio', 'Studio'], ...Object.keys(TOOL_GROUPS).filter((g) => g !== 'Studio').map((g) => [`/tools#${slug(g)}`, g])])
    }${col(f.make, en.map((u) => [u.route, shortTitle(u)]), lang === 'tr' ? ' lang="en"' : '')
    }${col('Türkçe', tr.map((u) => [u.route, shortTitle(u)]), lang === 'tr' ? '' : ' lang="tr"')}</div>`
      + `<p class="fine"><span class="mark mark-small">VISULASERZ</span> ${esc(f.line)} © ${YEAR}</p></div></footer>`;
  }
  function page({ lang = 'en', route, title, ogTitle, description, image, imageAlt, pair, ld, body, missing = false }) {
    if (description.length > 160) throw new Error(`${route}: the description is ${description.length} characters; keep it to 160.`);
    if (!image) throw new Error(`${route}: no picture for link previews.`);
    known.add(route);
    const url = ORIGIN + route;
    const alternates = pair ? [[lang, route], [lang === 'en' ? 'tr' : 'en', pair]] : [];
    const xDefault = pair ? (lang === 'en' ? route : pair) : null;
    const head = [
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      `<title>${esc(title)}</title>`,
      `<meta name="description" content="${esc(description)}">`,
      missing ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`,
      ...alternates.map(([l, r]) => `<link rel="alternate" hreflang="${l}" href="${ORIGIN}${r}">`),
      ...(xDefault ? [`<link rel="alternate" hreflang="x-default" href="${ORIGIN}${xDefault}">`] : []),
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="Visulaserz">',
      `<meta property="og:locale" content="${lang === 'tr' ? 'tr_TR' : 'en_US'}">`,
      `<meta property="og:title" content="${esc(ogTitle)}">`,
      `<meta property="og:description" content="${esc(description)}">`,
      `<meta property="og:url" content="${url}">`,
      `<meta property="og:image" content="${ORIGIN}${image}">`,
      '<meta property="og:image:width" content="1200">',
      '<meta property="og:image:height" content="630">',
      `<meta property="og:image:alt" content="${esc(imageAlt)}">`,
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="theme-color" content="#07070b">',
      '<meta name="color-scheme" content="dark">',
      '<link rel="icon" href="/favicon.svg" type="image/svg+xml">',
      '<link rel="preconnect" href="https://fonts.googleapis.com">',
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
      `<link href="${FONTS}" rel="stylesheet">`,
      `<link rel="stylesheet" href="${css}">`,
      `<script type="application/ld+json">${jsonLd(ld)}</script>`,
    ];
    const other = pair || (lang === 'tr' ? '/' : '/tr');
    return { route, file: `${route.slice(1)}.html`, lang, pair, image, html: `<!doctype html>\n<html lang="${lang}">\n<head>\n${head.join('\n')}\n</head>\n<body>\n${bar(lang, route, other)}\n<main id="main">\n${body}\n</main>\n${footer(lang)}\n</body>\n</html>\n` };
  }
  const crumbs = (lang, items) => `<nav class="crumbs wrap" aria-label="${UI[lang].crumbs}"><ol>${items.map(([to, label], i) => (i === items.length - 1 ? `<li aria-current="page">${esc(label)}</li>` : `<li><a href="${href(to)}">${esc(label)}</a></li>`)).join('')}</ol></nav>`;
  const breadcrumbLd = (items) => ({ '@type': 'BreadcrumbList', itemListElement: items.map(([to, label], i) => ({ '@type': 'ListItem', position: i + 1, name: label, item: ORIGIN + to })) });
  const meter = (e) => `<span class="meter" aria-hidden="true">${[0, 1, 2, 3, 4].map((i) => `<i${i < Math.round(e * 5) ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const sceneCard = (s, { blurb = false } = {}) => `<li class="card"><a href="${href(`/scene/${s.id}`)}">${thumbUrl(s) ? `<img src="${thumbUrl(s)}" width="480" height="270" alt="" loading="lazy" decoding="async">` : '<span class="card-blank"></span>'}<span class="card-name">${esc(s.name)}${s.requiresAccount ? '' : ' <span class="tag">No account</span>'}</span>${blurb ? `<span class="card-blurb">${esc(s.blurb)}</span>` : ''}<span class="card-meta">${esc(s.group)} · ${energyOf(s.energy).word}</span></a></li>`;
  const toolCard = (t, { blurb = false } = {}) => `<li class="card card-tool"><a href="${href(`/tool/${t.id}`)}">${toolThumb(t) ? `<img src="${toolThumb(t)}" width="320" height="180" alt="" loading="lazy" decoding="async">` : '<span class="card-blank"></span>'}<span class="card-name">${esc(t.name)}</span>${blurb ? `<span class="card-blurb">${esc(t.blurb)}</span>` : ''}<span class="card-meta">${esc(TOOL_COPY[t.id]?.phrase || t.group)}</span></a></li>`;
  const steps = (items, more, lang = 'en') => `<ol class="steps">${items.map(([t, d], i) => `<li><span class="step">${lang === 'tr' ? 'ADIM' : 'STEP'} ${i + 1}/${items.length}</span><b>${inline(t, more)}</b><p>${inline(d, more)}</p></li>`).join('')}</ol>`;

  const pages = [];

  // ── a page for every scene ──────────────────────────────────────────────────
  // The scenes most like this one: its room first, then shared tags, then a close energy.
  const related = (s) => scenes.filter((o) => o.id !== s.id)
    .map((o, i) => ({ o, i, score: (o.group === s.group ? 3 : 0) + o.tags.filter((t) => s.tags.includes(t)).length - Math.abs(o.energy - s.energy) * 4 }))
    .sort((a, b) => b.score - a.score || a.i - b.i).slice(0, 6).map((x) => x.o);
  scenes.forEach((s, index) => {
    const route = `/scene/${s.id}`;
    const e = energyOf(s.energy);
    const image = sceneOg.get(s.id) || thumbUrl(s);
    const sentence = s.blurb.replace(/[.\s]*$/, '.');
    const alt = `${s.name}, a Visulaserz music visualizer scene: ${s.blurb}`;
    const access = s.requiresAccount ? 'Free account: an email and a password, nothing to pay.' : 'Works without an account.';
    const credit = s.author ? `<p class="credit">Made by ${s.author.url ? `<a href="${esc(s.author.url)}" rel="noopener">${esc(s.author.name)}</a>` : esc(s.author.name)}, from the Visulaserz community.</p>` : '';
    const groupLine = SCENE_GROUPS[s.group] ? `It is in the ${s.group} room, with the ${s.group === 'Show' ? 'club and stage pictures' : s.group === 'Journey' ? 'journeys' : s.group === 'Vibe' ? 'calm places' : s.group === 'Things' ? 'objects that play the music' : 'mathematics and physics'}.` : '';
    const description = fit(sentence, [` A free music visualizer scene: drop a track, watch ${s.name} move with it, record a video.`, ' A free music visualizer scene for your browser.', ' Free, in your browser.']);
    const trail = [['/', 'Visulaserz'], ['/scenes', 'Scenes'], [`/scenes#${slug(s.group)}`, s.group], [route, s.name]];
    const srcset = sceneOg.get(s.id) && thumbUrl(s) ? ` srcset="${thumbUrl(s)} 480w, ${sceneOg.get(s.id)} 1200w" sizes="(max-width: 1152px) calc(100vw - 32px), 1120px"` : '';
    const body = `${crumbs('en', trail.slice(1))}
<section class="stage wrap">
<figure class="window"><img src="${image}"${srcset} width="1200" height="630" alt="${esc(alt)}" fetchpriority="high"></figure>
<div class="lcd"><span><b>SCENE</b> ${String(index + 1).padStart(3, '0')}/${scenes.length}</span><span><b>ROOM</b> ${esc(s.group.toUpperCase())}</span><span><b>ENERGY</b> ${meter(s.energy)} ${s.energy.toFixed(2)}</span><span class="lcd-tags">${esc(s.tags.slice(0, 5).join(' · ').toUpperCase())}</span></div>
</section>
<section class="intro wrap">
<div class="intro-main">
<p class="eyebrow">Music visualizer scene · ${esc(s.group)}</p>
<h1${plate(s.name)}>${esc(s.name)}</h1>
<p class="lead">${esc(sentence)}</p>
<p>${esc(e.text)} ${esc(groupLine)}</p>
${credit}<div class="actions"><a class="btn btn-primary" href="${href(`/?scene=${s.id}`)}">Open ${esc(s.name)} in Visulaserz</a><span class="access">${esc(access)}</span></div>
</div>
<aside class="facts"><p class="foot-h">Plays well with</p><ul class="chips">${e.genres.map((g) => `<li>${esc(g)}</li>`).join('')}</ul><p class="foot-h">Look</p><ul class="chips chips-quiet">${s.tags.map((t) => `<li>${esc(t)}</li>`).join('')}</ul></aside>
</section>
<section class="band wrap"><h2>Make a video with ${esc(s.name)}</h2>${steps(SCENE_STEPS, { name: s.name })}<p class="more-line">Add <a href="${href('/lyric-video-maker')}">timed lyrics</a>, a <a href="${href('/slowed-reverb')}">slowed + reverb</a> sound, or make it <a href="${href('/visualizer-for-tiktok')}">vertical for TikTok</a>.</p></section>
<section class="band wrap"><h2>Scenes like ${esc(s.name)}</h2><ul class="cards">${related(s).map((o) => sceneCard(o)).join('')}</ul><p class="more-line"><a href="${href(`/scenes#${slug(s.group)}`)}">All ${esc(s.group)} scenes</a> · <a href="${href('/scenes')}">All ${scenes.length} scenes</a></p></section>`;
    pages.push(page({
      route, title: `${s.name} — Music Visualizer Scene | Visulaserz`, ogTitle: `${s.name} · music visualizer scene`, description, image, imageAlt: alt, body,
      ld: [breadcrumbLd(trail), { '@type': 'WebPage', '@id': ORIGIN + route, url: ORIGIN + route, name: `${s.name} — music visualizer scene`, description, inLanguage: 'en', isPartOf: { '@id': `${ORIGIN}/#website` }, about: { '@id': `${ORIGIN}/#app` }, primaryImageOfPage: { '@type': 'ImageObject', contentUrl: ORIGIN + image, width: 1200, height: 630 }, ...(s.author ? { creator: { '@type': 'Person', name: s.author.name, ...(s.author.url ? { url: s.author.url } : {}) } } : {}) }, APP],
    }));
  });

  // ── a page for every tool ───────────────────────────────────────────────────
  tools.forEach((t) => {
    const route = `/tool/${t.id}`;
    const c = TOOL_COPY[t.id] || { phrase: t.group, uses: [] };
    const image = toolOg.get(t.id) || cards.get('tools');
    const sentence = t.blurb.replace(/[.\s]*$/, '.');
    const description = fit(`${c.phrase}. ${sentence}`, [' Free in your browser, no account needed.', ' Free, no account needed.']);
    const trail = [['/', 'Visulaserz'], ['/tools', 'Tools'], [`/tools#${slug(t.group)}`, t.group], [route, t.name]];
    const others = tools.filter((o) => o.id !== t.id).sort((a, b) => (b.group === t.group) - (a.group === t.group)).slice(0, 6);
    const body = `${crumbs('en', trail.slice(1))}
<section class="stage wrap">
<figure class="window window-tool">${toolThumb(t) ? `<img src="${toolThumb(t)}" width="320" height="180" alt="${esc(`${t.name}, a Visulaserz tool: ${c.phrase}`)}" fetchpriority="high">` : ''}</figure>
<div class="lcd"><span><b>TOOL</b> ${esc(upper(t.name))}</span><span><b>GROUP</b> ${esc(t.group.toUpperCase())}</span><span class="lcd-tags">${esc(t.tags.slice(0, 5).join(' · ').toUpperCase())}</span></div>
</section>
<section class="intro wrap">
<div class="intro-main">
<p class="eyebrow">${esc(c.phrase)}</p>
<h1${plate(t.name)}>${esc(t.name)}</h1>
<p class="lead">${esc(sentence)}</p>
<div class="actions"><a class="btn btn-primary" href="${href(`/?tool=${t.id}`)}">Open ${esc(t.name)} in Visulaserz</a><span class="access">Free, no account needed.</span></div>
</div>
<aside class="facts"><p class="foot-h">Use it to</p><ul class="uses">${c.uses.map((u) => `<li>${esc(u)}</li>`).join('')}</ul></aside>
</section>
<section class="band wrap"><h2>How to play it</h2>${steps(TOOL_STEPS, { name: t.name })}</section>
<section class="band wrap"><h2>More tools</h2><ul class="cards">${others.map((o) => toolCard(o)).join('')}</ul><p class="more-line"><a href="${href('/tools')}">All ${tools.length} tools</a> · <a href="${href('/online-daw')}">The online DAW</a></p></section>`;
    pages.push(page({
      route, title: `${t.name} — ${c.phrase} | Visulaserz`, ogTitle: `${t.name} · ${c.phrase}`, description, image, imageAlt: `${t.name}: ${c.phrase}`, body,
      ld: [breadcrumbLd(trail), { '@type': 'WebPage', '@id': ORIGIN + route, url: ORIGIN + route, name: `${t.name} — ${c.phrase}`, description, inLanguage: 'en', isPartOf: { '@id': `${ORIGIN}/#website` }, about: { '@id': `${ORIGIN}/#app` } }, APP],
    }));
  });

  // ── the two indexes ─────────────────────────────────────────────────────────
  {
    const x = INDEX.scenes;
    const groups = Object.keys(SCENE_GROUPS).filter((g) => scenes.some((s) => s.group === g));
    const trail = [['/', 'Visulaserz'], ['/scenes', 'Scenes']];
    const body = `${crumbs('en', trail.slice(1))}
<section class="intro intro-solo wrap"><div class="intro-main"><p class="eyebrow">${inline(x.eyebrow)}</p><h1>${inline(x.h1)}</h1><p class="lead">${inline(x.lead)}</p>
<nav class="rooms" aria-label="Rooms">${groups.map((g) => `<a href="#${slug(g)}">${esc(g)} <span>${scenes.filter((s) => s.group === g).length}</span></a>`).join('')}</nav></div></section>
${groups.map((g) => `<section class="band band-wide wrap" id="${slug(g)}"><h2>${esc(g)}</h2><p class="room-line">${esc(SCENE_GROUPS[g])}</p><ul class="cards">${scenes.filter((s) => s.group === g).map((s) => sceneCard(s, { blurb: true })).join('')}</ul></section>`).join('\n')}`;
    const description = fill(x.description);
    pages.push(page({ route: '/scenes', title: fill(x.title), ogTitle: fill(x.ogTitle), description, image: cards.get('scenes'), imageAlt: 'Scenes from Visulaserz', body,
      ld: [breadcrumbLd(trail), { '@type': 'CollectionPage', '@id': `${ORIGIN}/scenes`, url: `${ORIGIN}/scenes`, name: 'Visulaserz scenes', description, inLanguage: 'en', isPartOf: { '@id': `${ORIGIN}/#website` } }] }));
  }
  {
    const x = INDEX.tools;
    const groups = Object.keys(TOOL_GROUPS).filter((g) => tools.some((t) => t.group === g));
    const trail = [['/', 'Visulaserz'], ['/tools', 'Tools']];
    const body = `${crumbs('en', trail.slice(1))}
<section class="intro intro-solo wrap"><div class="intro-main"><p class="eyebrow">${inline(x.eyebrow)}</p><h1>${inline(x.h1)}</h1><p class="lead">${inline(x.lead)}</p>
<nav class="rooms" aria-label="Groups">${groups.map((g) => `<a href="#${slug(g)}">${esc(g)} <span>${tools.filter((t) => t.group === g).length}</span></a>`).join('')}</nav></div></section>
${groups.map((g) => `<section class="band band-wide wrap" id="${slug(g)}"><h2>${esc(g)}</h2><p class="room-line">${esc(TOOL_GROUPS[g])}</p><ul class="cards">${tools.filter((t) => t.group === g).map((t) => toolCard(t, { blurb: true })).join('')}</ul></section>`).join('\n')}`;
    const description = fill(x.description);
    pages.push(page({ route: '/tools', title: fill(x.title), ogTitle: fill(x.ogTitle), description, image: cards.get('tools'), imageAlt: 'Tools in Visulaserz', body,
      ld: [breadcrumbLd(trail), { '@type': 'CollectionPage', '@id': `${ORIGIN}/tools`, url: `${ORIGIN}/tools`, name: 'Visulaserz tools', description, inLanguage: 'en', isPartOf: { '@id': `${ORIGIN}/#website` } }] }));
  }

  // ── the use-case pages ──────────────────────────────────────────────────────
  for (const u of USE_CASES) {
    const lang = u.lang;
    const hero = (() => {
      if (u.hero.kind === 'tool') {
        const t = toolById.get(u.hero.tool);
        return t && toolThumb(t) ? `<figure class="window window-tool window-hero"><img src="${toolThumb(t)}" width="320" height="180" alt="${esc(`${t.name}: ${TOOL_COPY[t.id]?.phrase || ''}`)}" fetchpriority="high"></figure>` : '';
      }
      const shown = u.hero.scenes.map((id) => sceneById.get(id)).filter(Boolean);
      const cls = u.hero.kind === 'phones' ? 'strip strip-phones' : 'strip';
      const picture = (s) => (u.hero.kind === 'phones' || !thumbUrl(s) ? `src="${sceneOg.get(s.id) || thumbUrl(s)}" width="1200" height="630"` : `src="${thumbUrl(s)}"${sceneOg.get(s.id) ? ` srcset="${thumbUrl(s)} 480w, ${sceneOg.get(s.id)} 1200w" sizes="(max-width: 700px) 72vw, 220px"` : ''} width="480" height="270"`);
      return `<ul class="${cls}">${shown.map((s, i) => `<li><a href="${href(`/scene/${s.id}`)}"><img ${picture(s)} alt="${esc(`${s.name} scene`)}"${i < 3 ? '' : ' loading="lazy"'} decoding="async"><span>${esc(upper(s.name))} / ${esc(s.group.toUpperCase())}</span></a></li>`).join('')}</ul>`;
    })();
    const section = (sec) => {
      const parts = [`<h2>${inline(sec.h2)}</h2>`];
      if (sec.steps) parts.push(steps(sec.steps, {}, lang));
      for (const p of sec.p || []) parts.push(`<p>${inline(p)}</p>`);
      if (sec.list) parts.push(`<ul class="points">${sec.list.map((li) => `<li>${inline(li)}</li>`).join('')}</ul>`);
      if (sec.scenes) parts.push(`<ul class="cards">${sec.scenes.map((id) => sceneById.get(id)).filter(Boolean).map((s) => sceneCard(s)).join('')}</ul>`);
      if (sec.tools) parts.push(`<ul class="cards">${sec.tools.map((id) => toolById.get(id)).filter(Boolean).map((t) => toolCard(t)).join('')}</ul>`);
      return `<section class="band wrap">${parts.join('')}</section>`;
    };
    const ctaHref = u.ctaHref || '/';
    const body = `<section class="intro intro-solo intro-use wrap"><div class="intro-main"><p class="eyebrow">${inline(u.eyebrow)}</p><h1>${inline(u.h1)}</h1><p class="lead">${inline(u.lead)}</p><div class="actions"><a class="btn btn-primary" href="${href(ctaHref)}">${esc(u.cta)}</a><span class="access">${lang === 'tr' ? 'Ücretsiz · kurulum yok' : 'Free · nothing to install'}</span></div></div></section>
<section class="wrap hero-band">${hero}</section>
${u.sections.map(section).join('\n')}
<section class="band band-end wrap"><a class="btn btn-primary" href="${href(ctaHref)}">${esc(u.cta)}</a></section>`;
    const description = fill(u.description);
    pages.push(page({
      lang, route: u.route, pair: u.pair === '/' ? '/' : u.pair, title: fill(u.title), ogTitle: fill(u.ogTitle), description, image: cards.get(u.card) || cards.get('site'), imageAlt: fill(u.ogTitle), body,
      ld: [{ '@type': 'WebPage', '@id': ORIGIN + u.route, url: ORIGIN + u.route, name: fill(u.ogTitle), description, inLanguage: lang, isPartOf: { '@id': `${ORIGIN}/#website` }, about: { '@id': `${ORIGIN}/#app` } }, { ...APP, description }],
    }));
  }

  // ── what a missing address shows a person (the server sends it with a 404) ───
  const notFound = page({
    route: '/404', title: 'Not found | Visulaserz', ogTitle: 'Not found', description: 'This page is not here.', image: cards.get('site'), imageAlt: 'Visulaserz', missing: true, ld: [],
    body: `<section class="intro intro-solo intro-use wrap"><div class="intro-main"><p class="eyebrow">404 · no signal</p><h1>This page is not here</h1><p class="lead">The address may have a typo in it, or the page has moved.</p><div class="actions"><a class="btn btn-primary" href="/">Open the app</a><a class="btn" href="${href('/scenes')}">All scenes</a><a class="btn" href="${href('/tools')}">All tools</a></div><p lang="tr">Bu sayfa burada değil. <a href="${href('/tr')}">Türkçe sayfaya git</a>.</p></div></section>`,
  });
  known.delete('/404');

  // ── the app page links to them under its hero ───────────────────────────────
  const heroLinks = `<nav class="hero-links" aria-label="Visulaserz pages">${[['/scenes', 'Scenes'], ['/tools', 'Tools'], ['/lyric-video-maker', 'Lyric videos'], ['/slowed-reverb', 'Slowed + reverb'], ['/online-daw', 'Online DAW'], ['/visualizer-for-tiktok', 'TikTok videos']]
    .map(([to, label]) => `<a href="${href(to)}">${esc(label)}</a>`).join('')}<a href="${href('/tr')}" hreflang="tr" lang="tr">Türkçe</a></nav>`;

  // ── every link has to land somewhere ────────────────────────────────────────
  const fragments = new Map([['/scenes', new Set(Object.keys(SCENE_GROUPS).map(slug))], ['/tools', new Set(Object.keys(TOOL_GROUPS).map(slug))]]);
  for (const to of links) {
    const [path, fragment] = to.split('#');
    const [bare, query] = path.split('?');
    if (!known.has(bare)) throw new Error(`A page links to a missing page: ${to}`);
    if (fragment && !fragments.get(bare)?.has(fragment)) throw new Error(`A page links to a missing part of a page: ${to}`);
    if (query && !(bare === '/' && (/^scene=([a-z0-9-]+)$/.exec(query) && sceneById.has(query.slice(6)) || /^tool=([a-z0-9-]+)$/.exec(query) && toolById.has(query.slice(5))))) throw new Error(`A page links to an unknown scene or tool: ${to}`);
  }
  for (const p of pages) if (p.pair && !known.has(p.pair)) throw new Error(`${p.route} pairs with a missing page: ${p.pair}`);

  // ── the sitemap and robots.txt ──────────────────────────────────────────────
  const byRoute = new Map(pages.map((p) => [p.route, p]));
  const entry = (route, pair, lang, image) => {
    const alt = pair ? [[lang, route], [lang === 'en' ? 'tr' : 'en', pair], ['x-default', lang === 'en' ? route : pair]] : [];
    return `<url><loc>${ORIGIN}${route}</loc>${alt.map(([l, r]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${ORIGIN}${r}"/>`).join('')}${image ? `<image:image><image:loc>${ORIGIN}${image}</image:loc></image:image>` : ''}</url>`;
  };
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${[
    entry('/', '/tr', 'en', cards.get('site')),
    ...pages.map((p) => entry(p.route, p.pair, p.lang, p.route.startsWith('/scene/') ? p.image : null)),
  ].join('\n')}\n</urlset>\n`;
  if (byRoute.has('/')) throw new Error('The app has the / address.');
  const robots = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /media/\n\nSitemap: ${ORIGIN}/sitemap.xml\n`;
  return { pages, sitemap, robots, heroLinks, notFound: { file: '404.html', html: notFound.html } };
}

// "a, b and c" (Turkish: "a, b ve c")
function list(items, lang = 'en') {
  if (items.length < 2) return items.join('');
  return `${items.slice(0, -1).join(', ')} ${lang === 'tr' ? 've' : 'and'} ${items[items.length - 1]}`;
}
// A description that fits a search result (about 158 characters): the longest ending that still
// fits after the sentence, or the sentence cut at a word.
function fit(sentence, endings, max = 158) {
  for (const end of endings) if (sentence.length + end.length <= max) return sentence + end;
  const last = endings[endings.length - 1];
  const head = sentence.slice(0, max - last.length - 1);
  const at = Math.max(head.lastIndexOf(', '), head.lastIndexOf(': '), head.lastIndexOf('; '));
  return at > 40 ? `${sentence.slice(0, at)}.${last}` : cut(sentence, max);
}
// Cut at the last word that fits, with an ellipsis.
function cut(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/[\s,;:.]+\S*$/, '')}…`;
}
