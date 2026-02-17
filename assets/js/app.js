(() => {
  const $ = (q, el=document) => el.querySelector(q);
  const $$ = (q, el=document) => Array.from(el.querySelectorAll(q));

  // Print button
  const btnPrint = $("#btnPrint");
  if (btnPrint) btnPrint.addEventListener("click", () => window.print());

  // Copy share URL
  const btnCopy = $("#btnCopy");
  const shareUrl = $("#shareUrl");
  if (btnCopy && shareUrl) {
    btnCopy.addEventListener("click", async () => {
      const val = shareUrl.value || window.location.href;
      try {
        await navigator.clipboard.writeText(val);
        btnCopy.textContent = "Copied!";
        setTimeout(() => (btnCopy.textContent = "Copy"), 900);
      } catch {
        shareUrl.select();
        document.execCommand("copy");
      }
    });
  }

  // Copy scripture refs buttons
  $$(".js-copy").forEach(btn => {
    btn.addEventListener("click", async () => {
      const text = btn.getAttribute("data-copy") || "";
      try { await navigator.clipboard.writeText(text); } catch {}
      btn.textContent = "Copied";
      setTimeout(() => (btn.textContent = "Copy ref"), 800);
    });
  });

  // Tabs (discussion)
  const tabs = $(".tabs");
  if (tabs) {
    const buttons = $$(".tabs__btn", tabs);
    const glow = $(".tabs__glow", tabs);
    const panels = $$(".tabs__panel", tabs);
    const setActive = (key) => {
      buttons.forEach((b, i) => {
        const on = b.dataset.tab === key;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        if (on && glow) glow.style.transform = `translateX(${i * 100}%)`;
      });
      panels.forEach(p => p.classList.toggle("is-active", p.dataset.panel === key));
    };
    buttons.forEach(b => b.addEventListener("click", () => setActive(b.dataset.tab)));
    setActive("obs");
  }

  // Speed nav indicator
  const nav = $(".nav");
  const indicator = $(".nav__indicator");
  const links = nav ? $$(".nav__item", nav) : [];
  const setIndicatorTo = (a) => {
    if (!indicator || !a) return;
    const r = a.getBoundingClientRect();
    const nr = nav.getBoundingClientRect();
    indicator.style.width = `${r.width}px`;
    indicator.style.transform = `translateX(${r.left - nr.left}px)`;
  };
  if (links.length) {
    // initial
    setTimeout(() => setIndicatorTo(links[0]), 40);
    links.forEach(a => a.addEventListener("click", () => setIndicatorTo(a)));
    window.addEventListener("resize", () => {
      const active = links.find(x => x.classList.contains("is-active")) || links[0];
      setIndicatorTo(active);
    });

    // Scroll spy
    const sections = links
      .map(a => $(a.getAttribute("href")))
      .filter(Boolean);

    const pickActive = () => {
      const y = window.scrollY + 120;
      let best = sections[0];
      for (const s of sections) if (s.offsetTop <= y) best = s;
      const href = `#${best.id}`;
      links.forEach(a => a.classList.toggle("is-active", a.getAttribute("href") === href));
      const active = links.find(a => a.classList.contains("is-active"));
      setIndicatorTo(active || links[0]);
    };
    window.addEventListener("scroll", () => window.requestAnimationFrame(pickActive), { passive: true });
    pickActive();
  }

  // Theme picker
  const themePicker = $("#themePicker");
  if (themePicker) {
    const applyTheme = (id) => {
      document.body.setAttribute("data-theme", id);
      try { localStorage.setItem("manualTheme", id); } catch {}
    };
    try {
      const saved = localStorage.getItem("manualTheme");
      if (saved) { themePicker.value = saved; applyTheme(saved); }
    } catch {}
    themePicker.addEventListener("change", () => applyTheme(themePicker.value));
  }
})();
