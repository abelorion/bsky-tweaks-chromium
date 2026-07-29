(() => {
  if (window.__bskyHideFollowersInjected) return;
  window.__bskyHideFollowersInjected = true;

  let currentUrl = location.href;

  const styleTag = document.createElement('style');
  styleTag.id = 'bsky-hide-followers-styles';

  styleTag.textContent = `
    /* 1. Main profile follower button */
    a[data-testid="profileHeaderFollowersButton"] {
      display: none !important;
    }

    /* 2. Top bar on followers page */
    div[dir="auto"]:has(> div:only-child), 
    div:has(> a[href*="/followers"]) {
      /* Targets sub-headers */
    }

    /* 3. All followers in list */
    div[style*="padding: 12px 20px"] {
      display: none !important;
    }
  `;

  function getLoggedInHandle() {
    const navProfileLink = document.querySelector(
      'a[aria-label*="Profile"], a[data-testid="navProfileButton"], nav a[href^="/profile/"]'
    );
    if (navProfileLink) {
      const href = navProfileLink.getAttribute('href');
      const match = href?.match(/\/profile\/([^\/]+)/);
      if (match) return decodeURIComponent(match[1]).toLowerCase();
    }
    return null;
  }

  function isOwnProfile() {
    const path = window.location.pathname.toLowerCase();
    const match = path.match(/^\/profile\/([^\/]+)/);
    if (!match) return false; // Not on a profile page

    const profileHandle = decodeURIComponent(match[1]);
    const myHandle = getLoggedInHandle();

    if (!myHandle) return false;

    return profileHandle === myHandle;
  }

  function hideHeaderFollowerCount() {
    const elements = document.querySelectorAll('div[dir="auto"]');
    elements.forEach(el => {
      if (el.children.length === 0 && el.textContent) {
        const text = el.textContent.trim().toLowerCase();
        if (/^\d+[\d,.]*[kmb]?\s+followers?$/i.test(text)) {
          el.style.setProperty('display', 'none', 'important');
        }
      }
    });
  }

  function updateState() {
    chrome.storage.sync.get({ hideFollowers: false }, (settings) => {
      const shouldHide = settings.hideFollowers && isOwnProfile();
      const attached = !!document.getElementById('bsky-hide-followers-styles');

      if (shouldHide) {
        if (!attached) {
          (document.head || document.documentElement).appendChild(styleTag);
        }
        hideHeaderFollowerCount();
      } else {
        if (attached) {
          styleTag.remove();
        }
        const elements = document.querySelectorAll('div[dir="auto"]');
        elements.forEach(el => {
          if (el.style.display === 'none') {
            el.style.display = '';
          }
        });
      }
    });
  }

  
  updateState();

  
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.hideFollowers) {
      updateState();
    }
  });

  const observer = new MutationObserver(() => {
    if (location.href !== currentUrl) {
      currentUrl = location.href;
    }
    updateState();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  }
})();