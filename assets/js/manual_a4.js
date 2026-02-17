(function(){
  function extractUrl(cssUrlValue){
    if(!cssUrlValue) return null;
    const m = String(cssUrlValue).match(/url\((['"]?)(.*?)\1\)/i);
    return m ? m[2] : null;
  }

  async function preloadImages(urls){
    const list = (urls || []).filter(Boolean);
    if(!list.length) return;
    await Promise.all(list.map((u) => new Promise((resolve) => {
      try{
        const img = new Image();
        img.onload = () => resolve();
        img.onerror = () => resolve(); // don't block printing if it fails
        img.src = u;
      }catch(e){ resolve(); }
    })));
  }

  async function waitForImgsIn(node){
    try{
      const imgs = Array.from((node || document).querySelectorAll('img'));
      const pending = imgs.filter(im => !im.complete);
      if(!pending.length) return;
      await Promise.all(pending.map(im => new Promise((resolve) => {
        im.addEventListener('load', resolve, {once:true});
        im.addEventListener('error', resolve, {once:true});
      })));
    }catch(e){}
  }

  // Fonts can change line metrics after pagination. If we paginate before
  // webfonts resolve, the layout can reflow and overflow/crop at page bottoms
  // (exactly the issue you're seeing). So we always wait for fonts+images
  // before building A4 pages (both on initial load and before printing).
  async function waitForFontsAndImages(node=document){
    try{
      if(document.fonts && document.fonts.status !== 'loaded'){
        await document.fonts.ready;
      }
    }catch(e){}
    await waitForImgsIn(node);
    // Let the browser apply font metrics + layout twice.
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
  }
// NOTE: This file is wrapped in an IIFE at the top: (function(){ ... })();
// A previous hotfix accidentally injected a stray arrow-function opener here
// which broke all JS execution (pagination, mode toggle, PDF rendering).
// Keep all code in the existing wrapper.
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function toast(msg) {
    try {
      const t = document.createElement('div');
      t.className = 'toast';
      t.textContent = msg;
      document.body.appendChild(t);
      requestAnimationFrame(() => t.classList.add('is-on'));
      setTimeout(() => {
        t.classList.remove('is-on');
        setTimeout(() => t.remove(), 250);
      }, 1700);
    } catch (e) {
      // worst case
      console.log(msg);
    }
  }

  // -----------------------------
  // Toolbar buttons (screen only)
  // -----------------------------
  function setupToolbar() {
    const btnPrint = $('#btnPrint');
    const btnCopy = $('#btnCopy');
    const btnMode = $('#btnMode');

    
    if (btnMode) {
      const mode = getPreferredMode();
      btnMode.textContent = mode === 'mobile' ? 'A4 view' : 'Mobile view';
      btnMode.addEventListener('click', () => {
        const current = getPreferredMode();
        const next = current === 'mobile' ? 'a4' : 'mobile';
        reloadWithMode(next);
      });
    }

if (btnPrint) {
      btnPrint.addEventListener('click', async () => {
        toast('Tip: In the print dialog, enable “Background graphics” for best results.');
        const current = (document.body.dataset.mode || 'a4').toLowerCase();
        const profile = current === 'mobile' ? 'mobile' : 'a4';
        try { await prepareForPrint(profile); } catch(e) {}
        // Allow layout/pagination and print-profile CSS to fully apply before
        // opening the print dialog. On some browsers (esp. mobile), printing
        // immediately can capture the *previous* layout (old font sizes + stale
        // pagination). Two rAF ticks is generally more reliable than a fixed delay.
        const doPrint = () => { try { window.print(); } catch (e) {} };
        requestAnimationFrame(() => requestAnimationFrame(doPrint));
      });
    }

    if (btnCopy) {
      btnCopy.addEventListener('click', async () => {
        const url = ($('#shareUrl')?.value || '').trim() || window.location.href;
        try {
          await navigator.clipboard.writeText(url);
          toast('Link copied ✅');
        } catch (e) {
          // Fallback
          const ta = document.createElement('textarea');
          ta.value = url;
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); toast('Link copied ✅'); }
          catch (e2) { toast('Copy failed — you can copy from the address bar.'); }
          ta.remove();
        }
      });
    }
  }

  // -----------------------------
  // Discussion jump buttons
  // -----------------------------
  function setupJumpButtons() {
    $$('[data-jump]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const sel = btn.getAttribute('data-jump');
        const target = sel ? $(sel) : null;
        if (!target) return;

        // active state
        const bar = btn.closest('.gd-nav');
        if (bar) {
          $$('.tabs__btn', bar).forEach((b) => b.classList.toggle('is-active', b === btn));
        }

        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        target.classList.add('pulse');
        setTimeout(() => target.classList.remove('pulse'), 900);
      });
    });
  }

  // -----------------------------
  // Pagination
  //   - page 1 is the cover (already in HTML)
  //   - flow blocks are measured and moved into real A4 pages (page 2+)
  //   - blocks never cross a page break
  // -----------------------------
  function makePage(n) {
    const sheet = document.createElement('section');
    sheet.className = 'sheet page';
    sheet.setAttribute('aria-label', `Page ${n}`);
    sheet.dataset.page = String(n);

    const inner = document.createElement('div');
    inner.className = 'page__inner';
    sheet.appendChild(inner);

    return sheet;
  }

  function splitListBlock(block, container) {
    const splitMode = (block.getAttribute('data-split') || '').toLowerCase();
    if (splitMode !== 'list') return null;

    const list = block.querySelector('ul,ol');
    if (!list) return null;

    const items = Array.from(list.children).filter((n) => n && n.nodeType === 1);
    // We can only split a list across pages if it has at least 2 items.
    // (If it has 1 huge item, we'll fall back to generic splitting.)
    if (items.length < 2) return null;

    const isOrdered = list.tagName === 'OL';
    const startBase = isOrdered ? (parseInt(list.getAttribute('start') || '1', 10) || 1) : 1;

    const remainder = block.cloneNode(true);
    // Avoid duplicate IDs once we insert continuation fragments into the DOM.
    try { if (remainder && remainder.removeAttribute && remainder.getAttribute('id')) remainder.removeAttribute('id'); } catch (e) {}
    const remList = remainder.querySelector('ul,ol');
    if (!remList) return null;
    remList.innerHTML = '';

    // Mark continuation (only if there is a visible heading)
    const heading = remainder.querySelector('.block__title, .block__subtitle');
    if (heading && !heading.textContent.includes('(cont.)')) {
      heading.textContent = `${heading.textContent} (cont.)`;
    }

    // Move list items from the end into the remainder until it fits.
    // Keep at least 1 item in the first block.
    let moved = 0;
    while (overflows(container) && list.children.length > 1) {
      const last = list.lastElementChild;
      if (!last) break;
      remList.insertBefore(last, remList.firstChild);
      moved += 1;
    }

    // If we didn't move anything, abort.
    if (remList.children.length === 0) return null;

    // Safety: If we still overflow after moving items, ROLLBACK.
    // This prevents accidental content loss in edge cases.
    if (overflows(container)) {
      try {
        while (remList.firstElementChild) {
          list.appendChild(remList.firstElementChild);
        }
      } catch (e) {}
      return null;
    }

    // Preserve ordered list numbering when the list is split.
    if (isOrdered && moved > 0 && remList.tagName === 'OL') {
      const remainingCount = list.children.length;
      remList.setAttribute('start', String(startBase + remainingCount));
    }

    return remainder;
  }

  function removeEmptyPages() {
    try {
      const paged = document.getElementById('paged');
      if (!paged) return;
      const pages = Array.from(paged.querySelectorAll('.page'));
      pages.forEach((pg) => {
        const inner = pg.querySelector('.page__inner');
        if (inner && inner.children && inner.children.length === 0) {
          pg.remove();
        }
      });

      // Renumber remaining pages (cover is page 1).
      let n = 2;
      Array.from(paged.querySelectorAll('.page')).forEach((pg) => {
        try {
          pg.dataset.page = String(n);
          pg.setAttribute('aria-label', `Page ${n}`);
        } catch (e) {}
        n += 1;
      });
    } catch (e) {}
  }

  // ------------------------------------------------------------
  // Pagination (A4) — robust splitting so “glass blocks” never
  // run past the page boundary.
  //
  // Design constraints from user:
  // - Safe block area is enforced via CSS padding (12.5mm top/bottom)
  // - We keep visual consistency with an 80mm threshold:
  //   if a page has <=80mm remaining, continue on the same page; otherwise start a new page.
  // - If a block doesn't fit, we split it across pages (lists first,
  //   then by moving child elements, then (as a last resort) splitting
  //   a long paragraph by words).
  // ------------------------------------------------------------

  const A4_H_MM = 297;
  const SAME_PAGE_CONTINUE_MAX_MM = 80; // if remaining space is below this, prefer moving to next page
  // Be strict: if we paginate "too early" (before fonts settle) or allow even
  // a small overflow, Chromium's PDF renderer can crop the bottom line.
  // We keep this at 0 and instead rely on the explicit 12.5mm top/bottom safe
  // padding for whitespace.
  const FIT_FUZZ_PX = 3;


function overflows(container, fuzzPx = FIT_FUZZ_PX){
  if(!container) return false;
  const r = container.getBoundingClientRect();
  const last = container.lastElementChild;
  if(!last) return false;
  const lr = last.getBoundingClientRect();
  return lr.bottom > (r.bottom + (fuzzPx || 0));
}

  function getPxPerMm() {
    // Prefer the cover page (always present) because it is exactly A4 height.
    const probe = document.querySelector('.sheet.cover') || document.querySelector('.sheet');
    const rect = probe ? probe.getBoundingClientRect() : null;
    if (rect && rect.height) return rect.height / A4_H_MM;
    // Fallback: CSS reference px/mm (96dpi). Not perfect but reasonable.
    return 96 / 25.4;
  }

  function mmToPx(mm) {
    return mm * getPxPerMm();
  }

  function _innerGapPx(inner) {
    try {
      const cs = getComputedStyle(inner);
      const g = cs.rowGap || cs.gap || '0px';
      const v = parseFloat(g);
      return Number.isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  function remainingPx(inner) {
    // IMPORTANT:
    // For fixed-height flex containers, scrollHeight is often >= clientHeight even when there's *plenty* of empty space.
    // That makes (clientHeight - scrollHeight) return 0 and breaks our "80mm start rule".
    //
    // So we compute remaining room using actual geometry:
    // remaining = inner.bottom - lastChild.bottom (minus the flex gap that will be inserted before the next block).
    const innerRect = inner.getBoundingClientRect();
    if (!innerRect || !innerRect.height) return 0;

    const kids = inner.children;
    if (!kids || kids.length === 0) return innerRect.height;

    const last = kids[kids.length - 1];
    const lastRect = last.getBoundingClientRect();
    if (!lastRect) return 0;

    let rem = innerRect.bottom - lastRect.bottom;

    // account for the gap that will be added before the NEXT block
    const gap = _innerGapPx(inner);
    if (gap > 0) rem -= gap;

    return Math.max(0, rem);
  }
function getHeaderEl(block){
  if(!block) return null;
  const kids = Array.from(block.children||[]);
  return kids.find(ch => ch && ch.classList && (ch.classList.contains('block__head') || ch.classList.contains('kp__top'))) || null;
}
function headerSelectorIn(container){
  return container.querySelector('.block__head, .kp__top');
}

function cloneBlockShell(block, markCont=false){
  // Shallow clone keeps attributes/classes but avoids copying huge DOM trees
  const clone = block.cloneNode(false);

  // Avoid duplicate ids in the DOM when we create continuation fragments
  if(markCont && clone.getAttribute && clone.getAttribute('id')){
    clone.removeAttribute('id');
  }

  const head = getHeaderEl(block);
  if(head){
    const headClone = head.cloneNode(true);

    if(markCont){
      // Mark continuation in the most relevant title element
      const t = headClone.querySelector('.block__title, .kp__title');
      if(t && !t.textContent.includes('(cont.')) t.textContent = (t.textContent + ' (cont.)').trim();
    }

    clone.appendChild(headClone);
  } else if(markCont){
    // Fallback: if there is no recognizable header, add a tiny continuation cue
    clone.setAttribute('data-cont', '1');
  }
  return clone;
}

  function insertAfterHeader(container, node){
  const head = headerSelectorIn(container);
  if(head && head.nextSibling) head.parentNode.insertBefore(node, head.nextSibling);
  else if(head) head.parentNode.appendChild(node);
  else container.appendChild(node);
}

  function splitParagraphByWords(p, container) {
    const full = (p.textContent || '').trim();
    if (!full) return null;

    const words = full.split(/\s+/g);
    if (words.length < 40) return null;

    const original = full;
    let lo = 10;
    let hi = words.length - 10;
    let best = 0;

    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      p.textContent = words.slice(0, mid).join(' ');
      if (!overflows(container, FIT_FUZZ_PX)) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (!best || best >= words.length) {
      p.textContent = original;
      return null;
    }

    const rest = words.slice(best).join(' ');
    const remP = p.cloneNode(false);
    remP.textContent = rest;
    // Optional: add a subtle continuation indicator
    p.textContent = p.textContent.replace(/\s+$/, '') + ' …';

    return remP;
  }

  function splitBlockAuto(block){
  if(!block || !block.parentElement) return null;
  const inner = block.parentElement;

  const headEl = getHeaderEl(block);
  const contentChildren = () => Array.from(block.children||[]).filter(ch => ch !== headEl);

  const remainder = cloneBlockShell(block, true);

  // Move whole child nodes from the *end* into the remainder until the current page fits.
  // Keep at least ONE content child in the current fragment to avoid "header-only" boxes.
  while(overflows(inner) && contentChildren().length > 1){
    const kids = contentChildren();
    const last = kids[kids.length-1];
    insertAfterHeader(remainder, last);
  }

  // If we still overflow, try splitting the longest paragraph by words
  // (works well for long explanations and prevents awkward huge gaps).
  if(overflows(inner)){
    const paras = Array.from(block.querySelectorAll('p'))
      .filter(p => p.textContent && p.textContent.trim().length > 40)
      .sort((a,b)=> (b.textContent||'').length - (a.textContent||'').length);

    for(const p of paras){
      const remP = splitParagraphByWords(p, inner);
      if(remP){
        insertAfterHeader(remainder, remP);
        break;
      }
    }
  }

  // If we STILL overflow, rollback and tell the caller we can't split.
  if(overflows(inner)){
    // rollback moved nodes
    const moved = Array.from(remainder.children||[]).filter(ch=>{
      const head = headerSelectorIn(remainder);
      return ch !== head;
    });
    moved.forEach(ch => block.appendChild(ch));
    remainder.remove();
    return null;
  }

  // Safety: if the first fragment ended up with *no* body content, it's not a useful split.
  // In that case, rollback and let the caller move the whole block to the next page.
  if(contentChildren().length === 0){
    const moved = Array.from(remainder.children||[]).filter(ch=>{
      const head = headerSelectorIn(remainder);
      return ch !== head;
    });
    moved.forEach(ch => block.appendChild(ch));
    remainder.remove();
    return null;
  }

  // Only return remainder if it has BODY content (not just a header).
  const remBody = Array.from(remainder.children||[]).filter(ch=>{
    const head = headerSelectorIn(remainder);
    return ch !== head;
  });
  return remBody.length ? remainder : null;
}

  function paginate() {
    const flow = $('#flow');
    const paged = $('#paged');
    if (!flow || !paged) return;

    const blocks = Array.from(flow.querySelectorAll('.flow-block'));

    // Apply alternating glass backgrounds (gives the pages more visual rhythm)
    blocks.forEach((b, i) => {
      if (i % 2 === 1) b.classList.add('block--alt');
      else b.classList.remove('block--alt');
    });

    // Alternating glass shade for nicer visual rhythm
    blocks.forEach((b, i) => {
      if (i % 2 === 1) b.classList.add('block--alt');
      else b.classList.remove('block--alt');
    });
    if (!blocks.length) {
      flow.remove();
      return;
    }

    let pageNum = 2;
    let page = makePage(pageNum);
    paged.appendChild(page);
    let inner = page.querySelector('.page__inner');

    const continueSamePageMaxPx = mmToPx(SAME_PAGE_CONTINUE_MAX_MM);

    function newPage() {
      pageNum += 1;
      page = makePage(pageNum);
      paged.appendChild(page);
      inner = page.querySelector('.page__inner');
    }

    function ensureStartRoom(el) {
      if (inner.children.length === 0) return;
      const rem = remainingPx(inner);

      // If the next block already fits fully in the remaining space, allow it
      // even when rem < minStartPx. This packs small blocks and reduces big blanks.
      if (el) {
        try {
          const h = (el.getBoundingClientRect && el.getBoundingClientRect().height) ? el.getBoundingClientRect().height : 0;
          if (h > 0 && h <= rem) return;
        } catch (e) {}
      }

      // Pagination policy: if there is too little room left, start a fresh page;
      // otherwise, continue on this page and let splitting maximize space usage.
      if (rem < continueSamePageMaxPx) newPage();
    }

    function appendAndCheck(el) {
      inner.appendChild(el);
      return !overflows(inner, FIT_FUZZ_PX);
    }

    function splitSmart(el) {
      // Prefer list-aware splitting for blocks that declare data-split="list".
      // This is critical for MOBILE PDFs where Scripture Reading / question lists
      // can exceed a single page.
      let rem = null;
      try {
        const mode = (el && el.getAttribute) ? (el.getAttribute('data-split') || '').toLowerCase() : '';
        if (mode === 'list') rem = splitListBlock(el, inner);
      } catch (e) {}
      if (!rem) rem = splitBlockAuto(el);
      return rem;
    }

    function place(el) {
      ensureStartRoom(el);

      const hadContent = inner.children.length > 0;
      if (appendAndCheck(el)) return;

      // Overflow: try to split the block to fill the remaining space.
      let remainder = splitSmart(el);
      if (remainder && !overflows(inner, FIT_FUZZ_PX)) {
        // Place remainder on next pages
        while (remainder) {
          newPage();
          // Try to place remainder; it may need further splitting.
          appendAndCheck(remainder);
          if (!overflows(inner, FIT_FUZZ_PX)) {
            remainder = null;
          } else {
            remainder = splitSmart(remainder);
            if (!remainder) {
              console.warn('Continuation block still too tall and cannot be split:', el.id || el.className);
              break;
            }
          }
        }
        return;
      }

      // Splitting didn't help (or produced an unusable split). Roll back.
      try { inner.removeChild(el); } catch (e) {}

      // If we already had content on this page, move the whole block to a new page.
      if (hadContent) {
        newPage();
        // Now it should fit better; if not, we split on the fresh page.
        appendAndCheck(el);
        if (overflows(inner, FIT_FUZZ_PX)) {
          remainder = splitSmart(el);
          if (remainder) {
            while (remainder) {
              newPage();
              appendAndCheck(remainder);
              if (!overflows(inner, FIT_FUZZ_PX)) {
                remainder = null;
              } else {
                remainder = splitSmart(remainder);
              }
            }
          } else {
            console.warn('Block exceeds one page and cannot be split:', el.id || el.className);
          }
        }
        return;
      }

      // Page was empty: keep as much as we can (best effort), then continue.
      appendAndCheck(el);
      remainder = splitSmart(el);
      if (remainder) {
        while (remainder) {
          newPage();
          appendAndCheck(remainder);
          if (!overflows(inner, FIT_FUZZ_PX)) {
            remainder = null;
          } else {
            remainder = splitSmart(remainder);
          }
        }
      } else if (overflows(inner, FIT_FUZZ_PX)) {
        console.warn('Block exceeds one page and cannot be split:', el.id || el.className);
      }
    }

    for (let i = 0; i < blocks.length; i++) {
      place(blocks[i]);
    }

    // Remove the off-screen flow source to avoid double content
    flow.remove();

    // Final safety: never keep a completely empty page in the PDF.
    // (This can happen if a very large list block fails to split on first pass
    // due to font-metric reflow in headless Chromium.)
    removeEmptyPages();
  }

  // -----------------------------
// Print/PDF preparation
//   - When user is in Mobile mode, printing would otherwise be blank because
//     pages 2+ are only built in A4 mode.
//   - We build the paged layout on demand, then trigger print.
//   - In Mobile mode, we reload after printing to restore the reading view
//     (because pagination moves DOM nodes out of #flow).
// -----------------------------
let __printedFromMobile = false;

  async function prepareForPrint(profile = 'a4') {
    // IMPORTANT: printing happens in a separate layout pass. If we paginate
    // before fonts have loaded, layout can reflow later and overflow/crop.
    try {
      const body = document.body;
      const currentMode = (body.dataset.mode || 'a4').toLowerCase();
      if (currentMode === 'mobile') __printedFromMobile = true;

      body.dataset._prevMode = currentMode;
      body.dataset.print = '1';
      body.dataset.printProfile = (profile || 'a4').toLowerCase();

      // The PDF renderer uses @media print, which hides #flow. Therefore we
      // ALWAYS print the paginated layout (#paged). The "mobile" profile just
      // applies a larger type scale before paginating.
      body.dataset.mode = 'a4';

      // Ensure alternating block styling is applied before pagination.
      try {
        const flow = document.getElementById('flow');
        if (flow) {
          const blocks = Array.from(flow.querySelectorAll('.flow-block'));
          blocks.forEach((b, i) => {
            if (i % 2 === 1) b.classList.add('block--alt');
            else b.classList.remove('block--alt');
          });
        }
      } catch (e) {}

      // Wait for fonts + images so pagination measurements are stable.
      await waitForFontsAndImages(document);

      // Build pages if they don't exist yet (typical when the user is in
      // mobile reading mode, or when Playwright loads ?mode=mobile).
      const hasPages = !!document.querySelector('#paged .page');
      if (!hasPages && document.getElementById('flow')) {
        paginate();
      }

      // Preload background templates before printing (helps PDF export reliability)
      try {
        const cs = getComputedStyle(body);
        const bg1 = extractUrl(cs.getPropertyValue('--bg-cover'));
        const bg2 = extractUrl(cs.getPropertyValue('--bg-page'));
        await preloadImages([bg1, bg2]);
        const paged = document.getElementById('paged');
        if (paged) await waitForImgsIn(paged);
      } catch (e) {}

      // Let layout settle.
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    } catch (e) {
      console.error(e);
    }
  }

// Expose for Playwright / automated printing
window.__J2D_PREPARE_PRINT = prepareForPrint;

// Best-effort safety net for Ctrl+P / browser menu printing
window.addEventListener('beforeprint', () => {
  // If a toolbar button already prepared the document, don't override the chosen profile.
  if (document.body.dataset.print === '1' && document.body.dataset.printProfile) return;
  const mode = (document.body.dataset.mode || 'a4').toLowerCase();
  const profile = mode === 'mobile' ? 'mobile' : 'a4';
  // fire-and-forget; browsers won't await this
  prepareForPrint(profile);
});

window.addEventListener('afterprint', () => {
  try {
    if (__printedFromMobile) {
      // Restore Mobile view (pagination removed #flow)
      location.reload();
      return;
    }
    delete document.body.dataset.print;
    delete document.body.dataset.printProfile;
  } catch (e) {}
});

// -----------------------------
  // Boot
  // -----------------------------

  // ------------------------------------------------------------
  // Mode: A4 (print-ready) vs Mobile (reading)
  // ------------------------------------------------------------
  function getPreferredMode() {
    try {
      const qs = new URLSearchParams(window.location.search || '');
      const m = (qs.get('mode') || '').toLowerCase();
      if (m === 'mobile' || m === 'a4') return m;
      const saved = (localStorage.getItem('j2d_mode') || '').toLowerCase();
      if (saved === 'mobile' || saved === 'a4') return saved;
    } catch (e) {}
    return window.matchMedia && window.matchMedia('(max-width: 700px)').matches ? 'mobile' : 'a4';
  }

  function setPreferredMode(mode) {
    try { localStorage.setItem('j2d_mode', mode); } catch (e) {}
  }

  function reloadWithMode(mode) {
    setPreferredMode(mode);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('mode', mode);
      window.location.href = url.toString();
    } catch (e) {
      // Fallback: just reload
      window.location.reload();
    }
  }

  function enableMobileMode() {
    document.body.dataset.mode = 'mobile';
    const flow = document.getElementById('flow');
    if (flow) {
      const blocks = Array.from(flow.querySelectorAll('.flow-block'));

    // Apply alternating glass backgrounds (gives the pages more visual rhythm)
    blocks.forEach((b, i) => {
      if (i % 2 === 1) b.classList.add('block--alt');
      else b.classList.remove('block--alt');
    });
}
    // We keep the content in #flow (CSS will make it visible) and hide paged sheets.
    // This makes text comfortably readable on phones without zooming.
  }

  async function boot() {
    try {
      const mode = getPreferredMode();
      document.body.dataset.mode = mode;

      // CRITICAL: paginate only after webfonts resolve; otherwise the layout
      // can reflow later and overflow/crop at page bottoms in PDF.
      if (mode === 'a4') {
        // Apply alternating block styling before pagination so pages keep the rhythm.
        try {
          const flow = document.getElementById('flow');
          if (flow) {
            const blocks = Array.from(flow.querySelectorAll('.flow-block'));
            blocks.forEach((b, i) => {
              if (i % 2 === 1) b.classList.add('block--alt');
              else b.classList.remove('block--alt');
            });
          }
        } catch (e) {}

        await waitForFontsAndImages(document);
        paginate();
      } else {
        enableMobileMode();
      }

      setupJumpButtons();
      setupToolbar();
    } catch (e) {
      console.error(e);
    }

    // Signal readiness for Playwright printing:
    // Wait for 2 animation frames after building the layout.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__J2D_MANUAL_READY = true;
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
