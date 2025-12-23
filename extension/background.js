// background.js

const BACKEND_URL = 'http://localhost:3000/profiles';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // ----- PROFILE SCRAPING -----
  if (request.action === 'scrapeProfiles') {
    const urls = (request.urls || []).filter(Boolean);
    if (!urls.length) {
      sendResponse({ success: 0, total: 0, failed: 0 });
      return;
    }

    let currentIndex = 0;
    let successCount = 0;
    let failedCount = 0;
    let tabId = null;

    function moveToNext() {
      if (currentIndex >= urls.length) {
        if (tabId !== null) chrome.tabs.remove(tabId);
        sendResponse({ success: successCount, total: urls.length, failed: failedCount });
        return;
      }

      const url = urls[currentIndex];

      const openOrUpdate = () => {
        chrome.tabs.update(tabId, { url, active: false }, () => {
          waitForLoadAndScrape(tabId, url);
        });
      };

      if (tabId === null) {
        chrome.tabs.create({ url, active: false }, (tab) => {
          tabId = tab.id;
          waitForLoadAndScrape(tab.id, url);
        });
      } else {
        openOrUpdate();
      }
    }

    function waitForLoadAndScrape(tabIdToUse, url) {
      const listener = (updatedTabId, info) => {
        if (updatedTabId === tabIdToUse && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);

          chrome.tabs.sendMessage(
            tabIdToUse,
            { action: 'extractProfile', url },
            async (response) => {
              try {
                if (response && response.data) {
                  await sendToBackend([response.data]);
                  successCount++;
                } else {
                  failedCount++;
                }
              } catch (e) {
                console.error('Error sending to backend:', e);
                failedCount++;
              } finally {
                currentIndex++;
                moveToNext();
              }
            }
          );
        }
      };

      chrome.tabs.onUpdated.addListener(listener);
    }

    moveToNext();
    return true; // async
  }

  // ----- FEED ENGAGEMENT -----
  if (request.action === 'engageFeed') {
    const { reactions, comments } = request;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (!activeTab || !activeTab.url) {
        sendResponse({ started: false, reason: 'no_active_tab' });
        return;
      }

      const url = activeTab.url;

      if (!url.startsWith('https://www.linkedin.com/')) {
        console.warn('Active tab is not LinkedIn, cannot engage feed.');
        sendResponse({ started: false, reason: 'not_on_linkedin' });
        return;
      }

      const doEngage = (tabId) => {
        chrome.tabs.sendMessage(
          tabId,
          {
            action: 'engageFeed',
            reactions,
            comments,
          },
          (resp) => {
            if (chrome.runtime.lastError) {
              console.error('Error sending engageFeed:', chrome.runtime.lastError.message);
              sendResponse({ started: false, reason: 'no_content_script' });
            } else {
              sendResponse(resp || { started: true });
            }
          }
        );
      };

      // Ensure /feed/ in same tab
      if (!url.startsWith('https://www.linkedin.com/feed/')) {
        chrome.tabs.update(activeTab.id, { url: 'https://www.linkedin.com/feed/' }, () => {
          const listener = (updatedTabId, info) => {
            if (updatedTabId === activeTab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              doEngage(activeTab.id);
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
      } else {
        doEngage(activeTab.id);
      }
    });

    return true; // async sendResponse
  }
});

async function sendToBackend(profiles) {
  try {
    const res = await fetch(BACKEND_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(profiles),
    });
    return res.json();
  } catch (err) {
    console.error('Backend error:', err);
  }
}
