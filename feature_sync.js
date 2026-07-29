

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('hideFollowersToggle');
  const togglemoot = document.getElementById('hideMutualsToggle');

  if (!toggle) {
    console.error('Error: hideFollowersToggle element not found in DOM.');
    return;
  }

  if (!togglemoot) {
    console.error('Error: hideMutualsToggle element not found in DOM.');
    return;
  }


  chrome.storage.sync.get({ hideFollowers: false }, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage Read Error:', chrome.runtime.lastError);
      return;
    }
    toggle.checked = result.hideFollowers;
    console.log('Loaded hideFollowers state:', result.hideFollowers);
  });

  chrome.storage.sync.get({ hideMoots: false }, (result) => {
    if (chrome.runtime.lastError) {
      console.error('Storage Read Error:', chrome.runtime.lastError);
      return;
    }
    togglemoot.checked = result.hideMoots;
    console.log('Loaded hideMoots state:', result.hideMoots);
  });

  function saveSettings() {
    chrome.storage.sync.set({
        hideFollowers: toggle.checked,
        hideMoots: togglemoot.checked
    }, () => {
        if (chrome.runtime.lastError) {
            console.error("Storage Write Error:", chrome.runtime.lastError);
        } else {
            console.log("Settings saved.");
        }
    });
  }

  toggle.addEventListener("change", saveSettings);
  togglemoot.addEventListener("change", saveSettings);
});