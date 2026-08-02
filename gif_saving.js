// @grant        GM_getValue
// @grant        GM_setValue

(function () {
  'use strict';

  const STORAGE_KEY = 'dcSavedGifs';

  function persistToBrowserStorage(stringifiedValue) {
    try {
      // prefer chrome.storage for chromium-based browsers
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.set({ [STORAGE_KEY]: stringifiedValue });
        } catch (e) {
          // ignore chrome.storage failures
        }
      }
    } catch (e) {
      // ignore
    }
  }

  function getStorageSavedGifs() {
    try {
      // prefer userscript storage if available
      if (typeof GM_getValue !== 'undefined') {
        const gmData = GM_getValue(STORAGE_KEY);
        if (gmData) {
          return JSON.parse(gmData);
        }
      }

      // use localStorage as the fallback
      const localData = localStorage.getItem(STORAGE_KEY);
      if (localData) {
        if (typeof GM_setValue !== 'undefined') {
          GM_setValue(STORAGE_KEY, localData);
        }
        return JSON.parse(localData);
      }

      return [];
    } catch (e) {
      console.error('Klipy: Error reading saved GIFs', e);
      return [];
    }
  }

  function setStorageSavedGifs(gifs) {
    const stringified = JSON.stringify(gifs);
    try {
      if (typeof GM_setValue !== 'undefined') {
        GM_setValue(STORAGE_KEY, stringified);
      }

      // update localStorage synchronously
      localStorage.setItem(STORAGE_KEY, stringified);

      // update chrome.storage asynchronously if available
      persistToBrowserStorage(stringified);
    } catch (e) {
      console.error('Klipy: Error saving GIFs', e);
    }
  }

  const ICONS = {
    emptyStar: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    filledStar: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`
  };

  let activeTabState = 'native';

  function getGridContainers() {
    const recentBtn = document.querySelector('button[aria-label="Recent GIFs"]');
    if (!recentBtn) return null;
    try {
      const categoryBar = recentBtn.parentNode;
      if (!categoryBar) return null;
      const headerBlockContainer = categoryBar.parentNode;
      if (!headerBlockContainer) return null;
      const headerBlockWrapper = headerBlockContainer.parentNode;
      if (!headerBlockWrapper) return null;
      const gridContainer = headerBlockWrapper.nextElementSibling;
      if (!gridContainer) return null;
      const nativeGrid = gridContainer.firstElementChild;
      return { gridContainer, nativeGrid };
    } catch (e) {
      return null;
    }
  }

  function handleTabSwitch(clickedBtn) {
    const categoryBar = clickedBtn.parentNode;
    if (!categoryBar) return;
    Array.from(categoryBar.children).forEach((btn) => {
      btn.setAttribute('aria-pressed', 'false');
      btn.style.backgroundColor = 'rgb(34, 46, 63)';
      const innerSvg = btn.querySelector('svg path');
      if (innerSvg) innerSvg.setAttribute('fill', '#ABB8C9');
    });
    clickedBtn.setAttribute('aria-pressed', 'true');
    clickedBtn.style.backgroundColor = 'rgb(226, 231, 238)';
    const activeSvg = clickedBtn.querySelector('svg path');
    if (activeSvg) activeSvg.setAttribute('fill', '#151D28');
  }

  // helper: elementsFromPoint stack (peek through layers)
  function elementsFromPoint(x, y, maxDepth = 16) {
    const found = [];
    const restored = [];
    for (let i = 0; i < maxDepth; i++) {
      const el = document.elementFromPoint(x, y);
      if (!el || el === document.documentElement || el === document.body) break;
      found.push(el);
      const prev = el.style.pointerEvents;
      restored.push({ el, prev });
      el.style.pointerEvents = 'none';
    }
    for (let i = restored.length - 1; i >= 0; i--) {
      const { el, prev } = restored[i];
      el.style.pointerEvents = prev || '';
    }
    return found;
  }

  function getTopNativeButtonAtPoint(x, y) {
    const nativeSelector = 'button[aria-label^="Select GIF"]:not(.klipy-saved-tile)';
    const stack = elementsFromPoint(x, y, 16);
    console.debug('Klipy: elementsFromPoint stack', stack.map(el => ({
      tag: el.tagName,
      cls: el.className,
      id: el.id || null,
      aria: el.getAttribute && el.getAttribute('aria-label')
    })));
    for (const el of stack) {
      const btn = el.closest && el.closest(nativeSelector);
      if (btn) return btn;
    }
    return null;
  }

  function applySavedGridView() {
    if (activeTabState !== 'saved') return;
    const containers = getGridContainers();
    if (!containers || !containers.nativeGrid || !containers.gridContainer) return;

    containers.nativeGrid.style.opacity = '0';
    containers.nativeGrid.style.position = 'absolute';
    containers.nativeGrid.style.pointerEvents = 'none';
    containers.nativeGrid.style.zIndex = '-1';
    containers.nativeGrid.style.width = '100%';

    let savedWrapper = document.getElementById('klipy-saved-grid-wrapper');
    if (!savedWrapper) {
      savedWrapper = document.createElement('div');
      savedWrapper.id = 'klipy-saved-grid-wrapper';
      savedWrapper.style.cssText = 'display: flex; flex-direction: row; gap: 8px; width: 100%; height: 100%;';
      containers.gridContainer.appendChild(savedWrapper);
    }

    // ensure wrapper is interactive and install delegated pointerdown handler once
    savedWrapper.style.display = 'flex';
    savedWrapper.style.pointerEvents = 'auto';
    if (!savedWrapper._klipyDelegated) {
      savedWrapper.addEventListener('pointerdown', savedWrapperPointerDownHandler, true);
      savedWrapper._klipyDelegated = true;
    }

    savedWrapper.innerHTML = '';

    const savedGifs = getStorageSavedGifs();

    if (savedGifs.length === 0) {
      savedWrapper.innerHTML = '<div style="color: rgb(171, 184, 201); text-align: center; padding: 40px 20px; font-size: 15px; width: 100%;">No saved GIFs yet. Click the star on any GIF to save it!</div>';
      return;
    }

    const cols = [
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div')
    ];

    cols.forEach(col => {
      col.className = 'css-g5y9jx';
      col.style.cssText = 'flex: 1 1 0%; gap: 8px; min-width: 0px; display: flex; flex-direction: column;';
      savedWrapper.appendChild(col);
    });

    savedGifs.forEach((gif, index) => {
      const colIndex = index % 3;
      const tileBtn = document.createElement('button');
      tileBtn.type = 'button';
      tileBtn.role = 'button';
      tileBtn.tabIndex = 0;
      tileBtn.className = 'css-g5y9jx r-1loqt21 r-1otgn73 klipy-saved-tile';
      // avoid native "Select GIF" prefix so we don't accidentally match native tiles
      tileBtn.setAttribute('aria-label', `Saved GIF "${gif.title || 'Saved'}"`);
      tileBtn.setAttribute('aria-pressed', 'false');
      tileBtn.style.cssText = 'flex-direction: row; align-items: center; justify-content: center; width: 100%; position: relative; border: none; background: transparent; padding: 0; cursor: pointer;';

      // data attributes for delegated handler
      tileBtn.dataset.klipyId = gif.id || gif.url;
      tileBtn.dataset.klipyUrl = gif.url || '';
      tileBtn.dataset.klipyPreview = gif.preview || '';
      tileBtn.dataset.klipyTitle = gif.title || '';
      tileBtn.dataset.klipyAspect = gif.aspectRatio || '1 / 1';

      tileBtn.innerHTML = `
        <div data-expoimage="true" class="css-g5y9jx" style="overflow: hidden; width: 100%; border-radius: 8px; background-color: rgb(28, 39, 54); aspect-ratio: ${gif.aspectRatio || '1 / 1'}; opacity: 1; transform: scale(1); position: relative;">
            <div>
                <img alt="${gif.title || ''}" fetchpriority="auto" src="${gif.preview || gif.url}" style="object-position: left 50% top 50%; width: 100%; height: 100%; position: absolute; left: 0px; top: 0px; object-fit: cover; transition-duration: 0ms; transition-timing-function: linear;">
            </div>
            <div class="klipy-save-btn" style="position: absolute; top: 6px; right: 6px; z-index: 99999; background: rgba(21, 29, 40, 0.85); border-radius: 50%; padding: 6px; cursor: pointer; color: rgb(241, 196, 15); display: flex; align-items: center; justify-content: center; transition: transform 0.2s; box-shadow: 0 4px 10px rgba(0,0,0,0.35); pointer-events: auto;">
                ${ICONS.filledStar}
            </div>
        </div>
      `;

      cols[colIndex].appendChild(tileBtn);
    });
  }

  function restoreNativeGrid() {
    activeTabState = 'native';
    const containers = getGridContainers();
    if (containers && containers.nativeGrid) {
      containers.nativeGrid.style.opacity = '';
      containers.nativeGrid.style.position = '';
      containers.nativeGrid.style.pointerEvents = '';
      containers.nativeGrid.style.zIndex = '';
      containers.nativeGrid.style.width = '';
    }
    const savedWrapper = document.getElementById('klipy-saved-grid-wrapper');
    if (savedWrapper) {
      savedWrapper.style.display = 'none';
      savedWrapper.style.pointerEvents = '';
    }
  }

  // centralized selection: forwarding is default, observer fallback remains
  function selectSavedGifNatively(savedGif, event) {
    console.debug('Klipy: selectSavedGifNatively start', savedGif && (savedGif.title || savedGif.url));
    const nativeButtonSelector = 'button[aria-label^="Select GIF"]:not(.klipy-saved-tile)';

    function findInNativeGrid() {
      const containers = getGridContainers();
      const nativeRoot = containers && containers.nativeGrid ? containers.nativeGrid : document;
      const nativeTiles = nativeRoot.querySelectorAll(nativeButtonSelector);
      return Array.from(nativeTiles).find(tile => {
        const img = tile.querySelector('img');
        if (!img) return false;
        if (savedGif.url && img.src === savedGif.url) return true;
        if (savedGif.preview && img.src === savedGif.preview) return true;
        if (savedGif.title && img.alt && img.alt.trim() === savedGif.title.trim()) return true;
        if (savedGif.title && img.alt && img.alt.includes(savedGif.title)) return true;
        return false;
      });
    }

    // try synchronous forwarding if we have pointer coords
    if (event && typeof event.clientX === 'number') {
      try {
        const tileElem = event.currentTarget || event.target;
        const rect = tileElem && tileElem.getBoundingClientRect ? tileElem.getBoundingClientRect() : { left: 0, top: 0, width: 0, height: 0 };
        const x = (event.clientX && event.clientX !== 0) ? event.clientX : (rect.left + rect.width / 2);
        const y = (event.clientY && event.clientY !== 0) ? event.clientY : (rect.top + rect.height / 2);

        const nativeButton = getTopNativeButtonAtPoint(x, y);
        if (nativeButton) {
          console.debug('Klipy: forwarded click via layered elementFromPoint — clicking', nativeButton);
          try { nativeButton.click(); } catch (err) { console.error('Klipy: error clicking forwarded native button', err); }
          return;
        } else {
          console.debug('Klipy: forwarding found no native button at point; will fall back to observer');
        }
      } catch (err) {
        console.error('Klipy: forwarding attempt failed', err);
      }
    }

    // immediate match attempt
    const immediate = findInNativeGrid();
    if (immediate) {
      console.debug('Klipy: immediate native tile found — clicking', immediate);
      try { immediate.click(); } catch (err) { console.error('Klipy: error clicking immediate tile', err); }
      return;
    }

    // ask host to show recent, restore native grid, hide our overlay, then observe
    const recentBtn = document.querySelector('button[aria-label="Recent GIFs"]');
    if (recentBtn) {
      try {
        recentBtn.click();
        console.debug('Klipy: clicked Recent GIFs to surface native grid');
      } catch (err) {
        console.error('Klipy: error clicking Recent button', err);
      }
    }
    restoreNativeGrid();

    const savedWrapper = document.getElementById('klipy-saved-grid-wrapper');
    if (savedWrapper) {
      savedWrapper.style.display = 'none';
      savedWrapper.style.pointerEvents = 'none';
    }

    const containers = getGridContainers();
    const observeTarget = (containers && containers.gridContainer) ? containers.gridContainer : document.body;
    console.debug('Klipy: observing for native tiles on', observeTarget);

    let observer;
    let finished = false;
    const timeoutMs = 5000;
    const startTime = Date.now();

    function cleanupAndRestore() {
      try {
        if (observer) observer.disconnect();
      } catch (e) {}
      if (savedWrapper) {
        savedWrapper.style.pointerEvents = '';
        const stillHasGrid = !!getGridContainers();
        if (stillHasGrid) savedWrapper.style.display = 'flex';
      }
      finished = true;
    }

    try {
      observer = new MutationObserver((mutations) => {
        if (finished) return;
        const found = findInNativeGrid();
        if (found) {
          console.debug('Klipy: observer found native tile — clicking', { elapsed: Date.now() - startTime });
          cleanupAndRestore();
          try {
            found.click();
            console.debug('Klipy: clicked native tile', found);
          } catch (err) {
            console.error('Klipy: error clicking found native tile', err);
          }
        }
      });

      observer.observe(observeTarget, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'alt', 'aria-pressed'] });
    } catch (err) {
      console.error('Klipy: observer setup failed', err);
    }

    // timeout fallback
    const timeoutId = setTimeout(() => {
      if (finished) return;
      console.debug('Klipy: observer timeout — attempting fallback', { elapsed: Date.now() - startTime });
      const containersNow = getGridContainers();
      const nativeRoot = containersNow && containersNow.nativeGrid ? containersNow.nativeGrid : document;
      const nativeTilesNow = nativeRoot.querySelectorAll(nativeButtonSelector);
      if (nativeTilesNow.length > 0) {
        console.debug('Klipy: fallback clicking first native tile');
        try {
          nativeTilesNow[0].click();
        } catch (err) {
          console.error('Klipy: error clicking fallback tile', err);
        }
      } else {
        console.debug('Klipy: fallback found no native tiles');
      }
      cleanupAndRestore();
    }, timeoutMs);

    // small delayed re-check
    setTimeout(() => {
      if (finished) return;
      const found = findInNativeGrid();
      if (found) {
        console.debug('Klipy: delayed immediate check found tile — clicking', { elapsed: Date.now() - startTime });
        clearTimeout(timeoutId);
        cleanupAndRestore();
        try {
          found.click();
        } catch (err) {
          console.error('Klipy: error clicking tile found in delayed check', err);
        }
      }
    }, 120);
  }

  // delegated handlers 
  function toggleSavedByData(tile) {
    const id = tile.dataset.klipyId;
    if (!id) return;
    const url = tile.dataset.klipyUrl || '';
    const preview = tile.dataset.klipyPreview || url;
    const title = tile.dataset.klipyTitle || 'GIF';
    const aspect = tile.dataset.klipyAspect || '1 / 1';
    let current = getStorageSavedGifs();
    const already = current.some(g => g.id === id);
    if (already) {
      current = current.filter(g => g.id !== id);
    } else {
      current.unshift({ id, url, preview, title, aspectRatio: aspect });
    }
    setStorageSavedGifs(current);
  }

  function savedWrapperPointerDownHandler(e) {
    if (e.pointerType && !e.isPrimary) return;
    const savedWrapper = e.currentTarget;
    const saveBtn = e.target.closest('.klipy-save-btn');
    if (saveBtn && savedWrapper.contains(saveBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const tile = saveBtn.closest('.klipy-saved-tile');
      if (!tile) return;
      toggleSavedByData(tile);
      applySavedGridView();
      return;
    }

    const tile = e.target.closest('.klipy-saved-tile');
    if (tile && savedWrapper.contains(tile)) {
      e.preventDefault();
      e.stopPropagation();

      const rect = tile.getBoundingClientRect();
      const x = (typeof e.clientX === 'number' && e.clientX !== 0) ? e.clientX : (rect.left + rect.width / 2);
      const y = (typeof e.clientY === 'number' && e.clientY !== 0) ? e.clientY : (rect.top + rect.height / 2);

      const nativeButton = getTopNativeButtonAtPoint(x, y);
      if (nativeButton) {
        try {
          nativeButton.click();
          return;
        } catch (err) {
          console.error('Klipy: error clicking native button in delegation', err);
        }
      }

      const savedGif = {
        id: tile.dataset.klipyId,
        url: tile.dataset.klipyUrl,
        preview: tile.dataset.klipyPreview,
        title: tile.dataset.klipyTitle,
        aspectRatio: tile.dataset.klipyAspect || '1 / 1'
      };
      selectSavedGifNatively(savedGif, e);
    }
  }

  function processGifTiles() {
    const savedWrapper = document.getElementById('klipy-saved-grid-wrapper');
    if (savedWrapper && savedWrapper.style.display !== 'none') {
      savedWrapper.style.pointerEvents = 'auto';
    }

    const nativeTiles = document.querySelectorAll('button[aria-label^="Select GIF"]:not(.klipy-saved-tile)');
    const savedIds = new Set(getStorageSavedGifs().map(g => g.id));

    nativeTiles.forEach(tile => {
      if (tile.querySelector('.klipy-save-btn')) return;

      const imgWrapper = tile.querySelector('div[data-expoimage="true"]');
      if (!imgWrapper) return;
      imgWrapper.style.position = 'relative';

      const img = imgWrapper.querySelector('img');
      if (!img) return;

      const url = img.src;
      const uniqueId = url;
      const isSaved = savedIds.has(uniqueId);

      const saveBtn = document.createElement('div');
      saveBtn.className = 'klipy-save-btn';
      saveBtn.style.cssText = 'position: absolute; top: 4px; right: 4px; z-index: 30; background: rgba(21, 29, 40, 0.7); border-radius: 50%; padding: 4px; cursor: pointer; color: rgb(241, 196, 15); display: flex; align-items: center; justify-content: center; transition: transform 0.2s;';
      saveBtn.innerHTML = isSaved ? ICONS.filledStar : ICONS.emptyStar;

      saveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        let currentSaved = getStorageSavedGifs();
        const alreadySaved = currentSaved.some(g => g.id === uniqueId);

        if (alreadySaved) {
          currentSaved = currentSaved.filter(g => g.id !== uniqueId);
          saveBtn.innerHTML = ICONS.emptyStar;
        } else {
          currentSaved.unshift({
            id: uniqueId,
            url: url,
            preview: url,
            title: img.alt || 'GIF',
            aspectRatio: imgWrapper.style.aspectRatio || '1 / 1'
          });
          saveBtn.innerHTML = ICONS.filledStar;
        }

        setStorageSavedGifs(currentSaved);
        saveBtn.style.transform = 'scale(1.2)';
        setTimeout(() => saveBtn.style.transform = 'scale(1)', 200);
      });

      imgWrapper.appendChild(saveBtn);
    });

    if (activeTabState === 'saved') {
      applySavedGridView();
    }
  }

  function injectSavedGifTab() {
    const recentBtn = document.querySelector('button[aria-label="Recent GIFs"]');
    if (!recentBtn || document.getElementById('klipy-saved-gifs-btn')) return;

    const savedBtn = recentBtn.cloneNode(true);
    savedBtn.id = 'klipy-saved-gifs-btn';
    savedBtn.setAttribute('aria-label', 'Saved GIFs');
    savedBtn.setAttribute('aria-pressed', 'false');

    const iconContainer = savedBtn.querySelector('div.css-g5y9jx');
    if (iconContainer) {
      iconContainer.innerHTML = `
        <div class="css-g5y9jx" style="position: absolute; width: 18px; height: 18px; top: 50%; left: 50%; transform: translateX(-9px) translateY(-9px);">
            <svg fill="none" width="18" viewBox="0 0 24 24" height="18" style="color: rgb(171, 184, 201); pointer-events: none;">
                <path fill="#ABB8C9" stroke="none" stroke-width="0" stroke-linecap="butt" stroke-linejoin="miter" fill-rule="evenodd" clip-rule="evenodd" d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"></path>
            </svg>
        </div>
      `;
    }

    recentBtn.parentNode.insertBefore(savedBtn, recentBtn);

    savedBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      activeTabState = 'saved';
      handleTabSwitch(savedBtn);
      applySavedGridView();
      
      setTimeout(() => {
        if (activeTabState === 'saved') {
          applySavedGridView();
        }
      }, 150);
    }, true);

    const categoryBar = savedBtn.parentNode;
    if (categoryBar) {
      categoryBar.addEventListener('click', (e) => {
        const targetBtn = e.target.closest('button');
        if (targetBtn && targetBtn !== savedBtn) {
          restoreNativeGrid();
        }
      }, true);
    }
  }

  let timeoutId = null;
  const observer = new MutationObserver(() => {
    if (timeoutId) return;
    timeoutId = setTimeout(() => {
      timeoutId = null;
      if (document.querySelector('button[aria-label="Recent GIFs"]') && !document.getElementById('klipy-saved-gifs-btn')) {
        injectSavedGifTab();
      }
      processGifTiles();
    }, 100);
  });

  observer.observe(document.body, { childList: true, subtree: true });

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    injectSavedGifTab();
    processGifTiles();
  } else {
    window.addEventListener('DOMContentLoaded', () => {
      injectSavedGifTab();
      processGifTiles();
    });
  }
})();