let mutualHandles = new Set();
let isSyncing = false;

const CACHE_KEY = "bsky_mutuals_cache";
const CACHE_MAX_AGE = 1000 * 60 * 60 * 6; // 6 hours

// 1. Status UI
const statusEl = document.createElement('div');
statusEl.id = 'bsky-mutuals-status';
statusEl.style = "position:fixed; top:15px; right:15px; z-index:99999; background:#000; color:#fff; padding:6px 12px; border-radius:30px; font-size:11px; font-weight:bold; font-family:sans-serif; display:flex; align-items:center; gap:8px; border:1px solid #333; box-shadow: 0 4px 12px rgba(0,0,0,0.5);";
statusEl.innerHTML = '<div id="status-dot" style="width:10px; height:10px; border-radius:50%; background:#777;"></div><span id="status-text">Locating Profile...</span>';
document.body.appendChild(statusEl);

let hideFollowerCounts = false;
let hideBadges = false;

// Initial Settings Read
chrome.storage.sync.get({ hideFollowers: false, hideMoots: false }, (res) => {
    hideFollowerCounts = res.hideFollowers;
    hideBadges = res.hideMoots;
    if (!hideBadges) {
        syncMutuals();
    }
});

function updateStatus(text, color) {
    const dot = document.getElementById('status-dot');
    const label = document.getElementById('status-text');
    if (label) label.innerText = text;
    if (dot) dot.style.background = color;
    console.log(`[BSKY] ${text}`);
}

// 1. Cache helpers
async function loadCachedMutuals(myHandle) {
    return new Promise(resolve => {
        chrome.storage.local.get([CACHE_KEY], result => {
            const cache = result[CACHE_KEY];

            if (
                cache &&
                cache.handle === myHandle &&
                Date.now() - cache.updated < CACHE_MAX_AGE
            ) {
                mutualHandles = new Set(cache.mutuals);
                if (hideFollowerCounts) {
                    updateStatus(`Cached Mutuals`, "#00ccff");
                } else {
                    updateStatus(`${mutualHandles.size} Cached Mutuals`, "#00ccff");
                }
                inject();
            }

            resolve();
        });
    });
}

async function saveCachedMutuals(myHandle) {
    return new Promise(resolve => {
        chrome.storage.local.set({
            [CACHE_KEY]: {
                handle: myHandle,
                updated: Date.now(),
                mutuals: [...mutualHandles]
            }
        }, resolve);
    });
}

// 2. Data Fetching
async function syncMutuals() {
    if (hideBadges) return;
    if (isSyncing) return;

    const profileLink = document.querySelector('nav a[href^="/profile/"]');
    if (!profileLink) { 
        setTimeout(syncMutuals, 1000); 
        return; 
    }

    isSyncing = true;
    const myHandle = profileLink.getAttribute('href').split('/')[2].toLowerCase();
    
    await loadCachedMutuals(myHandle);
    
    // If cache already hydrated mutualHandles, we don't force immediate API re-fetch unless cache missing
    if (mutualHandles.size === 0) {
        updateStatus(`Refreshing moots list...`, "#ffcc00");
    }

    try {
        const fetchAll = async (endpoint) => {
            const list = new Set();
            let cursor = "";

            while (true) {
                const res = await fetch(
                    `https://public.api.bsky.app/xrpc/${endpoint}?actor=${myHandle}&limit=100&cursor=${cursor}`
                );

                const data = await res.json();
                const users = endpoint.includes("Followers")
                    ? data.followers
                    : data.follows;

                if (!users) break;

                users.forEach(u => list.add(u.handle.toLowerCase()));

                if (!data.cursor) break;
                cursor = data.cursor;
            }

            return list;
        };

        const [ing, ers] = await Promise.all([
            fetchAll('app.bsky.graph.getFollows'), 
            fetchAll('app.bsky.graph.getFollowers')
        ]);
        
        mutualHandles = new Set([...ing].filter(h => ers.has(h)));
        await saveCachedMutuals(myHandle);

        if (hideFollowerCounts) {
            updateStatus(`Mutuals Updated`, "#00ff00");
        } else {
            updateStatus(`${mutualHandles.size} Mutuals Updated`, "#00ff00");
        }
        inject();
    } catch (e) { 
        updateStatus("Sync Error", "#ff4444"); 
    }
    isSyncing = false;
}

function removeAllBadges() {
    document.querySelectorAll(".mutual-badge").forEach(el => el.remove());
    document.querySelectorAll('[data-has-mutual-badge="true"]').forEach(post => {
        delete post.dataset.hasMutualBadge;
    });
}

function handleMutualsUpdate() {
    if (hideBadges || mutualHandles.size === 0) return;

    const posts = document.querySelectorAll('[data-testid^="postThreadItem"], [data-testid^="feedItem"]');

    posts.forEach(post => {
        if (post.dataset.hasMutualBadge) return;

        const links = post.querySelectorAll('a[href^="/profile/"]');
        
        for (const link of links) {
            const urlParts = link.getAttribute('href').split('/');
            const handle = urlParts[2]?.toLowerCase();

            if (handle && mutualHandles.has(handle)) {
                // Filter: Only trigger on main author (ignore avatars, timestamps, handles)
                if (link.querySelector('img') || link.innerText.includes('·') || link.innerText.trim().startsWith('@')) {
                    continue;
                }

                const badge = document.createElement('span');
                badge.className = 'mutual-badge';
                badge.innerText = '♡';
                
                post.appendChild(badge);
                post.dataset.hasMutualBadge = "true";
                break; 
            }
        }
    });
}

// Handle Real-Time Popup Toggles
chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;

    if (changes.hideFollowers) {
        hideFollowerCounts = changes.hideFollowers.newValue;
        if (!hideBadges && mutualHandles.size > 0) {
            updateStatus(hideFollowerCounts ? `Mutuals Updated` : `${mutualHandles.size} Mutuals Updated`, "#00ff00");
        }
    }

    if (changes.hideMoots) {
        hideBadges = changes.hideMoots.newValue;
          
        if (hideBadges) {
            removeAllBadges();
            updateStatus("Badges Hidden", "#777");
        } else {
            // Re-enable: clear lock dataset, sync data if empty, and re-inject
            removeAllBadges();
            syncMutuals();
            inject();
        }
    }
});

function inject() {
    if (!hideBadges) {
        handleMutualsUpdate();
    }
}

// Background refresh every 6 hours
setInterval(() => {
    syncMutuals();
}, 1000 * 60 * 60 * 6);

// Observer for React dynamic rendering
const observer = new MutationObserver(() => {
    window.requestAnimationFrame(inject);
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
}

inject();