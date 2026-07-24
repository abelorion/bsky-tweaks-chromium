(function (root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (typeof window !== 'undefined') {
    window.BskyEmojiShortcodes = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const emojiShortcodes = {};

  let isBound = false;
  let emojiShortcodesLoaded = false;
  let suggestionBox = null;
  let activeSuggestionEditor = null;
  let selectedIndex = 0;

  async function loadEmojiShortcodes() {
    if (emojiShortcodesLoaded) {
      return;
    }

    emojiShortcodesLoaded = true;

    if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) {
      return;
    }

    try {
      const response = await fetch(chrome.runtime.getURL('joypixels_shortcodes.json'));
      if (!response.ok) {
        throw new Error(`Failed to load emoji shortcodes: ${response.status}`);
      }

      const data = await response.json();
      Object.assign(emojiShortcodes, data);
    } catch (error) {
      console.debug('[BSKY Emoji]', error);
    }
  }

  function normalizeShortcode(name) {
    return String(name).toLowerCase().trim().replace(/[-\s]+/g, '_');
  }

  function getShortcodeSuggestions(query) {
    const normalizedQuery = normalizeShortcode(query || '').replace(/^:/, '');

    const filtered = Object.entries(emojiShortcodes).filter(([name]) => {
      if (!normalizedQuery) {
        return true;
      }
      return name.startsWith(normalizedQuery) || name.includes(normalizedQuery);
    });

    return filtered
      .sort((a, b) => {
        const aStarts = a[0].startsWith(normalizedQuery) ? 0 : 1;
        const bStarts = b[0].startsWith(normalizedQuery) ? 0 : 1;

        if (aStarts !== bStarts) {
          return aStarts - bStarts;
        }

        return a[0].length - b[0].length || a[0].localeCompare(b[0]);
      })
      .slice(0, 8)
      .map(([shortcode, emoji]) => ({ shortcode, emoji }));
  }

  function getEditableTarget(target) {
    if (!target || typeof target !== 'object') {
      return null;
    }

    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      return target;
    }

    if (target.isContentEditable) {
      return target;
    }

    if (target.closest) {
      return target.closest('[contenteditable="true"], [contenteditable="plaintext-only"], [role="textbox"]');
    }

    return null;
  }

  function hideSuggestions() {
    if (suggestionBox) {
      suggestionBox.remove();
      suggestionBox = null;
    }
    activeSuggestionEditor = null;
    selectedIndex = 0;
  }

  function positionSuggestions(editable) {
    if (!suggestionBox || !editable) return;
    const rect = editable.getBoundingClientRect();
    suggestionBox.style.top = `${rect.bottom + window.scrollY + 4}px`;
    suggestionBox.style.left = `${rect.left + window.scrollX}px`;
  }

  function updateActiveSelectionView() {
    if (!suggestionBox) return;
    const buttons = suggestionBox.querySelectorAll('.emoji-shortcode-suggestion');
    buttons.forEach((btn, index) => {
      if (index === selectedIndex) {
        btn.style.backgroundColor = 'rgb(34, 46, 63)';
        btn.setAttribute('aria-selected', 'true');
      } else {
        btn.style.backgroundColor = 'transparent';
        btn.setAttribute('aria-selected', 'false');
      }
    });
  }

  function getActiveShortcodeContext(editable) {
    if (editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement) {
      const cursor = editable.selectionStart;
      const text = editable.value.slice(0, cursor);
      const lastNewlineIndex = text.lastIndexOf('\n');
      const currentLineBeforeCursor = lastNewlineIndex !== -1 
        ? text.slice(lastNewlineIndex + 1) 
        : text;

      const matchWithColon = currentLineBeforeCursor.match(/:([a-z0-9_+-]+):$/i);
      if (matchWithColon) {
        return {
          query: matchWithColon[1],
          matchLength: matchWithColon[0].length,
          isCompleted: true
        };
      }

      const matchPartial = currentLineBeforeCursor.match(/:([a-z0-9_+-]+)$/i);
      if (matchPartial) {
        return {
          query: matchPartial[1],
          matchLength: matchPartial[0].length,
          isCompleted: false
        };
      }

      return null;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    
    const range = selection.getRangeAt(0);
    
    let blockNode = range.endContainer;
    while (blockNode && blockNode !== editable && !['DIV', 'P', 'LI', 'TR', 'BLOCKQUOTE', 'SECTION', 'ARTICLE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(blockNode.nodeName)) {
      blockNode = blockNode.parentNode;
    }
    if (!blockNode) blockNode = editable;

    const preCaretRange = range.cloneRange();
    try {
      preCaretRange.setStart(blockNode, 0);
    } catch (e) {
      preCaretRange.selectNodeContents(editable);
      preCaretRange.setEnd(range.endContainer, range.endOffset);
    }
    
    const textBeforeCursor = preCaretRange.toString();
    const lastNewlineIndex = textBeforeCursor.lastIndexOf('\n');
    const currentLineBeforeCursor = lastNewlineIndex !== -1 
      ? textBeforeCursor.slice(lastNewlineIndex + 1) 
      : textBeforeCursor;

    const matchWithColon = currentLineBeforeCursor.match(/:([a-z0-9_+-]+):$/i);
    if (matchWithColon) {
      return {
        query: matchWithColon[1],
        matchLength: matchWithColon[0].length,
        isCompleted: true
      };
    }

    const matchPartial = currentLineBeforeCursor.match(/:([a-z0-9_+-]+)$/i);
    if (matchPartial) {
      return {
        query: matchPartial[1],
        matchLength: matchPartial[0].length,
        isCompleted: false
      };
    }

    return null;
  }

  function insertEmojiAtContext(editable, matchLength, emoji) {
    if (editable instanceof HTMLTextAreaElement || editable instanceof HTMLInputElement) {
      const cursor = editable.selectionStart;
      const val = editable.value;
      const start = cursor - matchLength;
      const newVal = val.slice(0, start) + emoji + val.slice(cursor);
      editable.value = newVal;
      const newPos = start + emoji.length;
      editable.setSelectionRange(newPos, newPos);
      editable.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }

    editable.focus();
    const selection = window.getSelection();
    
    if (!selection.isCollapsed) {
      selection.collapseToEnd();
    }

    for (let i = 0; i < matchLength; i++) {
      selection.modify('extend', 'backward', 'character');
    }

    if (document.queryCommandSupported('insertText')) {
      document.execCommand('insertText', false, emoji);
    } else {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const textNode = document.createTextNode(emoji);
      range.insertNode(textNode);
      
      range.setStartAfter(textNode);
      range.collapse(true);
      
      selection.removeAllRanges();
      selection.addRange(range);
    }
    editable.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function updateSuggestions(editable) {
    //V1.0.1
    //Hide suggestions in chat messages which have this fweature even tho the rest of the website doesn't
    if (location.pathname.startsWith("/messages")) {
      hideSuggestions();
      return;
    }


    const context = getActiveShortcodeContext(editable);
    if (!context) {
      hideSuggestions();
      return;
    }



    const normalizedQuery = normalizeShortcode(context.query);

    if (context.isCompleted) {
      if (emojiShortcodes[normalizedQuery]) {
        insertEmojiAtContext(editable, context.matchLength, emojiShortcodes[normalizedQuery]);
        hideSuggestions();
        return;
      }
    }

    const suggestions = getShortcodeSuggestions(context.query);
    if (!suggestions.length) {
      hideSuggestions();
      return;
    }

    if (!suggestionBox) {
      suggestionBox = document.createElement('div');
      suggestionBox.className = 'emoji-shortcode-suggestions';
      document.body.appendChild(suggestionBox);
    }

    activeSuggestionEditor = editable;
    if (selectedIndex >= suggestions.length) {
      selectedIndex = suggestions.length - 1;
    }
    if (selectedIndex < 0) {
      selectedIndex = 0;
    }

    suggestionBox.innerHTML = '';

    suggestions.forEach((suggestion, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'emoji-shortcode-suggestion';
      button.innerHTML = `<span class="emoji-shortcode-suggestion__name">:${suggestion.shortcode}:</span><span class="emoji-shortcode-suggestion__emoji">${suggestion.emoji}</span>`;
      
      button.addEventListener('mousedown', (e) => {
        e.preventDefault(); 
      });

      button.addEventListener('click', () => {
        insertEmojiAtContext(editable, context.matchLength, suggestion.emoji);
        hideSuggestions();
      });

      suggestionBox.appendChild(button);
    });

    updateActiveSelectionView();
    positionSuggestions(editable);
  }

  function handleInput(event) {
    const target = event.target;
    const editable = getEditableTarget(target);
    if (!editable) return;

    if (event.type === 'keydown') {
      if (event.key === 'Escape' && suggestionBox) {
        hideSuggestions();
        return;
      }

      if (suggestionBox) {
        const suggestions = getShortcodeSuggestions(getActiveShortcodeContext(editable)?.query || '');
        
        if (event.key === 'ArrowDown') {
          if (suggestions.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            selectedIndex = (selectedIndex + 1) % suggestions.length;
            updateActiveSelectionView();
            return;
          }
        }

        if (event.key === 'ArrowUp') {
          if (suggestions.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            selectedIndex = (selectedIndex - 1 + suggestions.length) % suggestions.length;
            updateActiveSelectionView();
            return;
          }
        }

        if (event.key === 'Enter' && event.shiftKey) {
          hideSuggestions();
          return;
        }

        if (event.key === 'Enter' && !event.shiftKey) {
          const context = getActiveShortcodeContext(editable);
          if (context && suggestions.length > 0) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const chosen = suggestions[selectedIndex] || suggestions[0];
            insertEmojiAtContext(editable, context.matchLength, chosen.emoji);
            hideSuggestions();
            return;
          }
        }
      }

      if (event.key === ' ' || (event.key === 'Enter' && !suggestionBox)) {
        const context = getActiveShortcodeContext(editable);
        if (context) {
          const normalized = normalizeShortcode(context.query);
          if (emojiShortcodes[normalized]) {
            event.preventDefault();
            event.stopPropagation();
            event.stopImmediatePropagation();
            const replacement = emojiShortcodes[normalized];
            const finalEmoji = event.key === ' ' ? replacement + ' ' : replacement;
            insertEmojiAtContext(editable, context.matchLength, finalEmoji);
            hideSuggestions();
            return;
          }
        }
      }
    }

    window.setTimeout(() => {
      updateSuggestions(editable);
    }, 0);
  }

  function initEmojiShortcodes() {
    if (typeof document === 'undefined') return;

    if (!document.body) {
        window.setTimeout(initEmojiShortcodes, 100);
        return;
    }

    void loadEmojiShortcodes();
    bindEvents();
  }

  function scanEditors() {
    // Replace this sometime
  }

  function bindEvents() {
    if (isBound || typeof document === 'undefined' || !document.documentElement) return;

    isBound = true;
    document.addEventListener('keydown', handleInput, true);
    document.addEventListener('input', handleInput, true);

    document.addEventListener('focusin', (e) => {
      if (!suggestionBox) return;
      const newTarget = e.target;
      if (activeSuggestionEditor && !activeSuggestionEditor.contains(newTarget) && !suggestionBox.contains(newTarget)) {
        hideSuggestions();
      }
    });

    document.addEventListener('click', (e) => {
      if (suggestionBox && !suggestionBox.contains(e.target) && e.target !== activeSuggestionEditor) {
        hideSuggestions();
      }
    });

    window.addEventListener('resize', hideSuggestions);
    window.addEventListener('scroll', hideSuggestions, true);

    const observer = new MutationObserver(() => {
      if (suggestionBox && activeSuggestionEditor) {
        const rect = activeSuggestionEditor.getBoundingClientRect();
        if (!document.contains(activeSuggestionEditor) || (rect.width === 0 && rect.height === 0)) {
          hideSuggestions();
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
  }

  initEmojiShortcodes();

  return {
    replaceEmojiShortcodes: (text) => text.replace(/:([a-z0-9_+-]+):/gi, (m, code) => emojiShortcodes[normalizeShortcode(code)] || m),
    getShortcodeSuggestions,
    initEmojiShortcodes
  };
});