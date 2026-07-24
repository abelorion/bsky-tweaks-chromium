(function () {
  'use strict';

  function getStorageSavedGifs() {
    try {
      const data = localStorage.getItem('dcSavedGifs');
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function setStorageSavedGifs(gifs) {
    localStorage.setItem('dcSavedGifs', JSON.stringify(gifs));
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

    savedWrapper.style.display = 'flex';
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
      tileBtn.setAttribute('aria-label', `Select GIF "${gif.title || 'Saved'}"`);
      tileBtn.setAttribute('aria-pressed', 'false');
      tileBtn.style.cssText = 'flex-direction: row; align-items: center; justify-content: center; width: 100%; position: relative; border: none; background: transparent; padding: 0; cursor: pointer;';

      tileBtn.innerHTML = `
        <div data-expoimage="true" class="css-g5y9jx" style="overflow: hidden; width: 100%; border-radius: 8px; background-color: rgb(28, 39, 54); aspect-ratio: ${gif.aspectRatio || '1 / 1'}; opacity: 1; transform: scale(1); position: relative;">
            <div>
                <img alt="${gif.title || ''}" fetchpriority="auto" src="${gif.preview || gif.url}" style="object-position: left 50% top 50%; width: 100%; height: 100%; position: absolute; left: 0px; top: 0px; object-fit: cover; transition-duration: 0ms; transition-timing-function: linear;">
            </div>
            <div class="klipy-save-btn" style="position: absolute; top: 4px; right: 4px; z-index: 30; background: rgba(21, 29, 40, 0.7); border-radius: 50%; padding: 4px; cursor: pointer; color: rgb(241, 196, 15); display: flex; align-items: center; justify-content: center; transition: transform 0.2s;">
                ${ICONS.filledStar}
            </div>
        </div>
      `;

      tileBtn.addEventListener('click', (e) => {
        if (!e.target.closest('.klipy-save-btn')) {
          selectSavedGifNatively(gif);
        }
      });

      const unsaveBtn = tileBtn.querySelector('.klipy-save-btn');
      unsaveBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentSaved = getStorageSavedGifs().filter(g => g.id !== gif.id);
        setStorageSavedGifs(currentSaved);
        applySavedGridView();
      });

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
    }
  }

  function selectSavedGifNatively(savedGif) {
    const recentBtn = document.querySelector('button[aria-label="Recent GIFs"]');
    if (recentBtn) {
      recentBtn.click();
    }

    setTimeout(() => {
      const nativeTiles = document.querySelectorAll('button[aria-label^="Select GIF"]');
      let targetNativeTile = Array.from(nativeTiles).find(tile => {
        const img = tile.querySelector('img');
        return img && (img.src === savedGif.url || img.alt === savedGif.title);
      });

      if (targetNativeTile) {
        targetNativeTile.click();
      } else {
        const searchInput = document.querySelector('input[type="text"], input[placeholder*="Search"]');
        if (searchInput && savedGif.title) {
          searchInput.value = savedGif.title;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));

          setTimeout(() => {
            const updatedTiles = document.querySelectorAll('button[aria-label^="Select GIF"]');
            const found = Array.from(updatedTiles).find(tile => {
              const img = tile.querySelector('img');
              return img && img.src === savedGif.url;
            });
            if (found) {
              found.click();
            } else if (updatedTiles.length > 0) {
              updatedTiles[0].click();
            }
          }, 400);
        }
      }
    }, 100);
  }

  function processGifTiles() {
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
      
      // Secondary check to override any race conditions when another tab was loading
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