(() => {
  const $ = (q, el=document) => el.querySelector(q);

  const themePicker = $("#themePicker");
  const applyTheme = (id) => {
    document.body.setAttribute("data-theme", id);
    try { localStorage.setItem("manualTheme", id); } catch {}
  };
  if (themePicker) {
    try {
      const saved = localStorage.getItem("manualTheme");
      if (saved) { themePicker.value = saved; applyTheme(saved); }
    } catch {}
    themePicker.addEventListener("change", () => applyTheme(themePicker.value));
  }

  const elCards = $("#cards");
  const elCount = $("#count");
  const elQ = $("#q");
  const elUpdated = $("#updated");
  const btnClear = $("#btnClear");

  const norm = (s) => (s||"").toLowerCase();
  const contains = (hay, q) => norm(hay).includes(q);

  const render = (items) => {
    if (!elCards) return;
    elCards.innerHTML = items.map(it => `
      <a class="card card--glass libCard" href="${it.url}">
        <div class="libCard__meta">
          <span class="pill">${it.category}</span>
          <span class="chip chip--soft">${it.date}</span>
        </div>
        <div class="libCard__title">${it.title}</div>
        <div class="muted">${it.big_idea}</div>
        <div class="chips" style="margin-top:10px;">
          ${(it.primary_passages||[]).slice(0,4).map(r => `<span class="chip">${r}</span>`).join("")}
        </div>
      </a>
    `).join("");
    if (elCount) elCount.textContent = `${items.length} manual(s)`;
  };

  const filterItems = (items, q) => {
    if (!q) return items;
    return items.filter(it => {
      const all = [
        it.title, it.big_idea, it.category,
        (it.tags||[]).join(" "),
        (it.primary_passages||[]).join(" "),
        it.slug
      ].join(" • ");
      return contains(all, q);
    });
  };

  const load = async () => {
    const items = [];
    let generatedAt = "";

    try {
      const res = await fetch("/data/library.json", { cache: "no-store" });
      const data = await res.json();
      generatedAt = (data.generated_at || generatedAt);
      (data.items || []).forEach((it) => items.push(it));
    } catch (e) {
      // continue; we'll try optional extras
    }

    // Optional: ship pre-prepared packs without touching the main library.json
    try {
      const res2 = await fetch("/data/library_preprepared.json", { cache: "no-store" });
      if (res2.ok) {
        const extra = await res2.json();
        (extra.items || []).forEach((it) => items.push(it));
      }
    } catch (e) {
      // ignore
    }

    if (elUpdated) elUpdated.textContent = (generatedAt || "");
    const q = norm(elQ ? elQ.value : "");
    render(filterItems(items, q));
    if (elQ) elQ.addEventListener("input", () => render(filterItems(items, norm(elQ.value))));
    if (btnClear) btnClear.addEventListener("click", () => { elQ.value=""; render(items); });
    render(items);
  };

  load().catch(err => {
    if (elCards) elCards.innerHTML = `<div class="muted">Failed to load library.json: ${String(err)}</div>`;
  });
})();
