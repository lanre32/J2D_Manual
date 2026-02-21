(() => {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

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

  // Featured folder: always show first (and styled differently).
  const FEATURED_CATEGORY = 'House Fellowship Manuals 2026';

  // Fallback list (used if category_styles.json can't be loaded).
  const DEFAULT_CATEGORIES = [
    FEATURED_CATEGORY,
    'Bible Foundations',
    'Character & Holiness',
    'Emotional Health',
    'Evangelism & Mission',
    'Faith & Trust',
    'Family & Parenting',
    'Holy Spirit & Power',
    'Identity & Purpose',
    'Leadership & Service',
    'Prayer & Intercession',
    'Relationships',
    'Spiritual Disciplines',
    'Stewardship',
    'Trials & Suffering',
    'Worship & Church Life'
  ];

  const folderIconSvg = () => `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="folder-icon-neon" aria-hidden="true">
      <path fill="currentColor" d="M10 4H2v16h20V6H12l-2-2zm10 4v10H4V6h5.17l2 2H20z" />
    </svg>
  `;

  const folderHtml = (cat) => {
    const featured = (cat === FEATURED_CATEGORY);
    const cls = featured ? 'folder-container-neon is-featured' : 'folder-container-neon';
    return `
      <div class="${cls}" role="link" tabindex="0" data-cat="${escapeHtml(cat)}" aria-label="Open ${escapeHtml(cat)}">
        <div class="doc-sheet sheet-1"></div>
        <div class="doc-sheet sheet-2"></div>
        <div class="doc-sheet sheet-3"></div>
        <div class="folder-card-neon">
          <div class="folder-inner">
            ${folderIconSvg()}
            <h2 class="folder-title-neon">${escapeHtml(cat)}</h2>
          </div>
        </div>
      </div>
    `;
  };

  const init = async () => {
    const grid = $('#foldersGrid');
    if (!grid) return;

    let categories = [];
    try {
      const catStyles = await loadJson('data/category_styles.json');
      const styleMap = catStyles?.categories || {};

      categories = Object.keys(styleMap);

      // If an "order" number is provided, we sort by it first (lowest = first),
      // otherwise we fall back to alphabetical ordering.
      const orderOf = (c) => {
        const o = styleMap?.[c]?.order;
        return (typeof o === 'number' && Number.isFinite(o)) ? o : 9999;
      };

      categories.sort((a, b) => (orderOf(a) - orderOf(b)) || a.localeCompare(b));
    } catch (e) {
      categories = DEFAULT_CATEGORIES;
      console.warn('Failed to load category_styles.json; using fallback list.', e);
    }

    // Defensive: ensure featured category appears first if present.
    if (categories.includes(FEATURED_CATEGORY)) {
      categories = [FEATURED_CATEGORY, ...categories.filter((c) => c !== FEATURED_CATEGORY)];
    }

    grid.innerHTML = categories.map(folderHtml).join('');

    $$('.folder-container-neon', grid).forEach((el) => {
      const cat = el.getAttribute('data-cat') || '';
      const go = () => {
        window.location.href = `category.html?cat=${encodeURIComponent(cat)}`;
      };

      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          go();
        }
      });
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
