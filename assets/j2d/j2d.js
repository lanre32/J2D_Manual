(() => {
  const $ = (q, el = document) => el.querySelector(q);
  const $$ = (q, el = document) => Array.from(el.querySelectorAll(q));

  const norm = (s) => (s || "").toString().toLowerCase().trim();

  const escapeHtml = (s) => (s || "").toString()
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const slugify = (s) => norm(s)
    .replaceAll("&", " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const scrollToId = (id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
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
    "Pre-Prepared": "Curated, ready-to-use study resources — prepared manuals you can pick up and run with."
  };

  const state = {
    categories: [],
    items: []
  };

  const loadJson = async (url) => {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`${url} returned ${res.status}`);
    return await res.json();
  };

  const loadLibraryCombined = async () => {
    const items = [];
    let generatedAt = "—";

    try {
      const lib = await loadJson("data/library.json");
      (lib?.items || []).forEach((it) => items.push(it));
      generatedAt = lib?.generated_at || generatedAt;
    } catch (err) {
      console.warn("Failed to load library.json", err);
    }

    // Optional extra library (pre-prepared packs)
    try {
      const extra = await loadJson("data/library_preprepared.json");
      (extra?.items || []).forEach((it) => items.push(it));
    } catch (err) {
      // Not required.
    }

    return { items, generatedAt };
  };

  const countByCategory = (items) => {
    const map = new Map();
    for (const it of items) {
      const cat = it.category || "";
      if (!cat) continue;
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return map;
  };

  const renderCategories = () => {
    const wrap = $("#j2dCategories");
    const select = $("#j2dCategorySelect");
    if (!wrap) return;

    const counts = countByCategory(state.items);

    // Build select options
    if (select) {
      const existing = new Set($$("option", select).map(o => o.value));
      for (const c of state.categories) {
        if (existing.has(c)) continue;
        const opt = document.createElement("option");
        opt.value = c;
        opt.textContent = c;
        select.appendChild(opt);
      }
    }

    wrap.innerHTML = state.categories.map((cat) => {
      const desc = CATEGORY_DESCRIPTIONS[cat] || "Bible study manuals for this life topic.";
      const theme = (state.categoryStyles?.[cat]?.theme) || "default";
      const fontPair = (state.categoryStyles?.[cat]?.font_pair) || "";
      const n = counts.get(cat) || 0;

      return `
        <div class="col-xl-4 col-md-6">
          <div class="j2d-cat-card" role="button" tabindex="0" data-cat="${escapeHtml(cat)}">
            <h3 class="j2d-cat-title">${escapeHtml(cat)}</h3>
            <div class="j2d-cat-meta">
              <span class="j2d-pill"><i class="fas fa-layer-group"></i> Theme: ${escapeHtml(theme)}</span>
              <span class="j2d-pill"><i class="fas fa-book"></i> Manuals: ${n}</span>
              ${fontPair ? `<span class="j2d-pill"><i class="fas fa-font"></i> ${escapeHtml(fontPair)}</span>` : ""}
            </div>
            <p class="j2d-cat-desc">${escapeHtml(desc)}</p>
          </div>
        </div>
      `;
    }).join("");

    // Interactions
    $$(".j2d-cat-card", wrap).forEach(card => {
      const cat = card.getAttribute("data-cat") || "";
      const activate = () => {
        const select = $("#j2dCategorySelect");
        if (select) {
          select.value = cat;
          select.dispatchEvent(new Event("change"));
        }
        scrollToId("library");
      };

      card.addEventListener("click", activate);
      card.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      });
    });
  };

  const matchesQuery = (item, q) => {
    if (!q) return true;
    const hay = [
      item.title,
      item.big_idea,
      item.category,
      item.slug,
      (item.tags || []).join(" "),
      (item.primary_passages || []).join(" ")
    ].join(" • ");
    return norm(hay).includes(q);
  };

  const matchesCategory = (item, cat) => {
    if (!cat) return true;
    return (item.category || "") === cat;
  };

  const renderLibrary = () => {
    const cards = $("#j2dCards");
    const count = $("#j2dCount");

    if (!cards) return;

    const q = norm($("#j2dSearch")?.value);
    const cat = $("#j2dCategorySelect")?.value || "";

    const filtered = (state.items || [])
      .filter(it => matchesQuery(it, q))
      .filter(it => matchesCategory(it, cat));

    if (count) count.textContent = `${filtered.length} manual(s)`;

    if (!filtered.length) {
      cards.innerHTML = `
        <div class="j2d-empty">
          <div style="font-weight:800; margin-bottom:8px;">No manuals found yet.</div>
          <div>Try clearing your search, switching category, or check back after new manuals are generated.</div>
        </div>
      `;
      return;
    }

    cards.innerHTML = filtered.map(it => {
      const url = it.url || "#";
      const title = it.title || "Untitled manual";
      const idea = it.big_idea || "";
      const cat = it.category || "";
      const date = it.date || "";
      const passages = (it.primary_passages || []).slice(0, 4);

      return `
        <a class="j2d-manual-card" href="${escapeHtml(url)}">
          <div class="j2d-cat-meta" style="margin-top:0;">
            ${cat ? `<span class="j2d-pill"><i class="fas fa-tag"></i> ${escapeHtml(cat)}</span>` : ""}
            ${date ? `<span class="j2d-pill"><i class="far fa-calendar"></i> ${escapeHtml(date)}</span>` : ""}
          </div>
          <div class="j2d-manual-title">${escapeHtml(title)}</div>
          <p class="j2d-manual-idea">${escapeHtml(idea)}</p>
          ${passages.length ? `
            <div class="j2d-chips">
              ${passages.map(p => `<span class="j2d-chip">${escapeHtml(p)}</span>`).join("")}
            </div>
          ` : ""}
        </a>
      `;
    }).join("");
  };

  const wireEvents = () => {
    // Enter study button -> scroll to categories
    const enter = $("#enterStudyBtn");
    if (enter) {
      const go = () => scrollToId("categories");
      enter.addEventListener("click", go);
      enter.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          go();
        }
      });
    }

    const q = $("#j2dSearch");
    const sel = $("#j2dCategorySelect");
    const clear = $("#j2dClear");

    if (q) q.addEventListener("input", renderLibrary);
    if (sel) sel.addEventListener("change", renderLibrary);
    if (clear) clear.addEventListener("click", () => {
      if (q) q.value = "";
      if (sel) sel.value = "";
      renderLibrary();
    });

    const year = $("#j2dYear");
    if (year) year.textContent = String(new Date().getFullYear());
  };

  const init = async () => {
    wireEvents();

    // Load category styles
    try {
      const catStyles = await loadJson("data/category_styles.json");
      state.categoryStyles = catStyles?.categories || {};
      state.categories = Object.keys(catStyles?.categories || {}).sort((a, b) => a.localeCompare(b));
    } catch (err) {
      // Fallback: static list
      state.categories = Object.keys(CATEGORY_DESCRIPTIONS);
      console.warn("Failed to load category_styles.json", err);
    }

    // Load library (main + optional add-ons)
    try {
      const lib = await loadLibraryCombined();
      state.items = lib.items || [];
      const updated = $("#j2dUpdated");
      if (updated) updated.textContent = lib.generatedAt || "—";
    } catch (err) {
      state.items = [];
      const updated = $("#j2dUpdated");
      if (updated) updated.textContent = "—";
      console.warn("Failed to load library", err);
    }

    renderCategories();
    renderLibrary();
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
