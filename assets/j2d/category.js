(() => {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

  // Touch-first devices don't have hover. We treat the first tap as "preview" and
  // a second tap (within a short window) as "open".
  const IS_TOUCH = window.matchMedia('(hover: none) and (pointer: coarse)').matches;

  const norm = (s) => (s || '').toString().toLowerCase().trim();

  const escapeHtml = (s) => (s || '').toString()
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');

  const loadJson = async (url) => {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return await res.json();
  };

  // Merge the main library with any optional add-on libraries.
  // This lets you ship "pre-prepared" manuals without overwriting the main library.json.
  const loadLibraryCombined = async () => {
    const items = [];
    try {
      const lib = await loadJson('data/library.json');
      (lib?.items || []).forEach((it) => items.push(it));
    } catch (e) {
      console.warn('Failed to load library.json', e);
    }

    // Optional: pre-prepared packs (manual_site/data/library_preprepared.json)
    try {
      const extra = await loadJson('data/library_preprepared.json');
      (extra?.items || []).forEach((it) => items.push(it));
    } catch (e) {
      // Not required.
    }

    return items;
  };

  const getParam = (key) => {
    const u = new URL(window.location.href);
    return u.searchParams.get(key);
  };

  const CATEGORY_DESCRIPTIONS = {
    "Bible Foundations": "Core doctrines, Scripture overview, and building a strong spiritual foundation.",
    "Faith & Trust": "Learning to rely on God — in uncertainty, waiting seasons, and daily decisions.",
    "Character & Holiness": "Growing in purity, integrity, humility, and Christlike living.",
    "Identity & Purpose": "Discover who you are in Christ and walk confidently in God’s calling.",
    "Prayer & Intercession": "Praying with understanding, persistence, and compassion for others.",
    "Spiritual Disciplines": "Habits that deepen your walk: study, fasting, meditation, and obedience.",
    "Holy Spirit & Power": "Spirit-filled living, gifts, fruit, and God’s enabling power for ministry.",
    "Worship & Church Life": "Worship, fellowship, and healthy participation in the life of the church.",
    "Leadership & Service": "Servant leadership, ministry excellence, and faithful stewardship of influence.",
    "Relationships": "Biblical wisdom for friendships, conflict, forgiveness, and love.",
    "Family & Parenting": "Building godly homes, raising children in faith, and strengthening marriages.",
    "Evangelism & Mission": "Sharing the gospel, discipleship, and living on mission.",
    "Stewardship": "Managing time, resources, work, and money with Kingdom priorities.",
    "Trials & Suffering": "Finding hope, endurance, and joy through challenges and seasons of pain.",
    "Emotional Health": "Healing, peace, and resilience — renewing the mind with God’s truth.",
    "House Fellowship Manuals 2026": "RCCG House Fellowship Manuals for 2026 — ready-to-use weekly study guides (HTML + PDF)."
  };

  const state = {
    category: '',
    theme: 'navy-gold',
    items: [],
    filtered: [],
    activeIndex: -1,
    categoryStyles: {}
  };

  const applyTheme = () => {
    const body = document.body;
    body.setAttribute('data-theme', state.theme);

    // Use the requested template background (_p2) as the wallpaper layer.
    // (We keep the theme variables for text colors + accents.)
    // Some template filenames have different casing (e.g., Whitemarble_p2.png),
    // so we probe a couple of sensible candidates.
    const candidates = Array.from(new Set([
      state.theme,
      state.theme ? state.theme[0].toUpperCase() + state.theme.slice(1) : state.theme,
      state.theme?.toLowerCase?.() || state.theme
    ].filter(Boolean)));

    const tryLoad = (i = 0) => {
      if (i >= candidates.length) return;
      const name = candidates[i];
      const url = `/assets/img/templates/${name}_p2.png`;
      const img = new Image();
      img.onload = () => body.style.setProperty('--wallpaper', `url('${url}')`);
      img.onerror = () => tryLoad(i + 1);
      img.src = url;
    };

    tryLoad(0);
  };

  const matchesQuery = (item, q) => {
    if (!q) return true;
    const hay = [
      item.title,
      item.big_idea,
      item.slug,
      (item.tags || []).join(' '),
      (item.primary_passages || []).join(' ')
    ].join(' • ');
    return norm(hay).includes(q);
  };

  const setActive = (idx) => {
    state.activeIndex = idx;

    $$('.j2d-item').forEach((el) => el.classList.remove('is-active'));
    const activeEl = $(`.j2d-item[data-idx="${idx}"]`);
    if (activeEl) activeEl.classList.add('is-active');

    const item = state.filtered[idx];
    const idea = $('#manualIdea');
    const meta = $('#manualMeta');
    const open = $('#manualOpen');

    if (!item) {
      if (idea) {
        idea.textContent = IS_TOUCH
          ? 'Tap a manual title to preview its Big Idea. Tap again (or use “Open manual”) to open.'
          : 'Hover a manual title to preview its Big Idea.';
      }
      if (meta) meta.innerHTML = '';
      if (open) {
        open.setAttribute('href', '#');
        open.setAttribute('aria-disabled', 'true');
        open.style.pointerEvents = 'none';
        open.style.opacity = '0.6';
      }
      return;
    }

    if (idea) idea.textContent = item.big_idea || '—';

    const passages = (item.primary_passages || []).slice(0, 4);
    const tags = (item.tags || []).slice(0, 4);

    if (meta) {
      meta.innerHTML = [
        item.date ? `<span class="j2d-chip"><span>📅</span> ${escapeHtml(item.date)}</span>` : '',
        passages.length ? `<span class="j2d-chip"><span>📖</span> ${escapeHtml(passages.join(', '))}</span>` : '',
        tags.length ? `<span class="j2d-chip"><span>🏷️</span> ${escapeHtml(tags.join(', '))}</span>` : ''
      ].filter(Boolean).join('');
    }

    if (open) {
      const url = item.url || '#';
      open.setAttribute('href', url);
      open.removeAttribute('aria-disabled');
      open.style.pointerEvents = 'auto';
      open.style.opacity = '1';
    }
  };

  const renderList = () => {
    const list = $('#manualList');
    const count = $('#manualCount');

    if (!list) return;

    const q = norm($('#manualSearch')?.value);
    state.filtered = (state.items || []).filter((it) => matchesQuery(it, q));

    if (count) count.textContent = `${state.filtered.length} manual(s)`;

    // Remove any previous empty message
    list.parentElement?.querySelectorAll('.j2d-empty').forEach((n) => n.remove());

    if (!state.filtered.length) {
      list.innerHTML = '';
      const empty = document.createElement('div');
      empty.className = 'j2d-empty';
      empty.innerHTML = state.items.length
        ? 'No manuals match your search yet.'
        : 'No manuals found in this category yet. Check back after new manuals are generated.';
      list.parentElement?.appendChild(empty);
      setActive(-1);
      return;
    }

    list.innerHTML = state.filtered.map((it, idx) => {
      const title = it.title || 'Untitled manual';
      const idea = it.big_idea || '';
      const date = it.date || '';
      return `
        <li class="j2d-item" data-idx="${idx}">
          <a href="${escapeHtml(it.url || '#')}" class="j2d-item-link" aria-label="Open manual: ${escapeHtml(title)}">
            <div class="j2d-item-title">${escapeHtml(title)}</div>
            <div class="j2d-item-meta">
              ${date ? `<span>📅 ${escapeHtml(date)}</span>` : ''}
              ${idea ? `<span>• Preview available</span>` : ''}
            </div>
          </a>
        </li>
      `;
    }).join('');

    // Default preview: first item
    setActive(0);

    // Hover/focus preview (no click required)
    $$('.j2d-item', list).forEach((el) => {
      const idx = Number(el.getAttribute('data-idx'));
      el.addEventListener('mouseenter', () => setActive(idx));
      el.addEventListener('focusin', () => setActive(idx));
    });

    // Mobile/touch: first tap previews, second tap opens
    if (IS_TOUCH) {
      let lastTapIdx = null;
      let lastTapAt = 0;
      const ARM_WINDOW_MS = 900;

      $$('.j2d-item-link', list).forEach((link) => {
        link.addEventListener('click', (ev) => {
          const li = link.closest('.j2d-item');
          const idx = Number(li?.getAttribute('data-idx') || '-1');
          if (idx < 0) return;

          const now = Date.now();
          const isSecondTap = (lastTapIdx === idx) && (now - lastTapAt <= ARM_WINDOW_MS);

          if (isSecondTap) {
            // Let the browser follow the link.
            lastTapIdx = null;
            lastTapAt = 0;
            li?.classList.remove('is-armed');
            return;
          }

          // First tap: prevent navigation and just preview.
          ev.preventDefault();
          setActive(idx);

          // Visual cue (optional)
          $$('.j2d-item.is-armed', list).forEach((n) => n.classList.remove('is-armed'));
          li?.classList.add('is-armed');

          lastTapIdx = idx;
          lastTapAt = now;

          window.setTimeout(() => {
            if (lastTapIdx === idx && (Date.now() - lastTapAt) >= ARM_WINDOW_MS) {
              lastTapIdx = null;
              lastTapAt = 0;
              li?.classList.remove('is-armed');
            }
          }, ARM_WINDOW_MS + 40);
        });
      });
    }
  };

  const init = async () => {
    const cat = getParam('cat');
    if (!cat) {
      window.location.replace('folders.html');
      return;
    }

    state.category = cat;

    // Load styles
    try {
      const styles = await loadJson('data/category_styles.json');
      state.categoryStyles = styles?.categories || {};
      state.theme = state.categoryStyles?.[cat]?.theme || state.theme;
    } catch (e) {
      console.warn('Failed to load category_styles.json', e);
    }

    applyTheme();

    // Update title/desc
    const title = $('#categoryName');
    const desc = $('#categoryDesc');
    if (title) title.textContent = cat;
    if (desc) desc.textContent = CATEGORY_DESCRIPTIONS[cat] || 'Bible study manuals for this life topic.';
    document.title = `${cat} — The Journey 2 Discovery`;

    // Load library (main + any optional add-ons)
    try {
      const all = await loadLibraryCombined();
      state.items = all.filter((it) => (it.category || '') === cat);
    } catch (e) {
      state.items = [];
      console.warn('Failed to load library', e);
    }

    // Wire search
    const search = $('#manualSearch');
    if (search) search.addEventListener('input', renderList);

    renderList();

    // Year
    const year = $('#j2dYear');
    if (year) year.textContent = String(new Date().getFullYear());
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
