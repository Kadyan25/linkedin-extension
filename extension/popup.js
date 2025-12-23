// popup.js

document.addEventListener('DOMContentLoaded', () => {
  const getTitleBtn = document.getElementById('getTitleBtn');
  const titleResult = document.getElementById('titleResult');

  const profileUrls = document.getElementById('profileUrls');
  const scrapeBtn = document.getElementById('scrapeBtn');
  const scrapeStatus = document.getElementById('scrapeStatus');
  const progressBar = document.getElementById('progressBar');
  const scrapeProgress = document.getElementById('scrapeProgress');

  const reactionCount = document.getElementById('reactionCount');
  const commentCount = document.getElementById('commentCount');
  const engageBtn = document.getElementById('engageBtn');
  const engageStatus = document.getElementById('engageStatus');
  const counters = document.getElementById('counters');
  const likedCounter = document.getElementById('likedCounter');
  const commentedCounter = document.getElementById('commentedCounter');

  // 1. Current tab title
  getTitleBtn.onclick = () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      titleResult.textContent = tabs[0]?.title || 'No title found';
    });
  };

  // 2. Profile scraping
  scrapeBtn.onclick = async () => {
    const urls = profileUrls.value
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length < 3) {
      scrapeStatus.textContent = 'Error: Need at least 3 URLs';
      return;
    }

    scrapeBtn.disabled = true;
    scrapeStatus.textContent = 'Starting...';
    scrapeProgress.style.display = 'block';
    progressBar.style.width = '0%';

    try {
      const result = await chrome.runtime.sendMessage({
        action: 'scrapeProfiles',
        urls,
      });

      const success = result?.success || 0;
      const total = result?.total || urls.length;
      const failed = result?.failed || 0;

      scrapeStatus.textContent = `Done. Success: ${success}, Failed: ${failed}, Total: ${total}`;
      const percent = total ? (success / total) * 100 : 0;
      progressBar.style.width = `${percent}%`;
    } catch (err) {
      console.error(err);
      scrapeStatus.textContent = `Error: ${err.message}`;
    } finally {
      scrapeBtn.disabled = false;
    }
  };

  // 3. Feed engagement
  function validateEngagement() {
    const reactions = parseInt(reactionCount.value) || 0;
    const comments = parseInt(commentCount.value) || 0;
    return reactions > 0 || comments > 0;
  }

  reactionCount.oninput = commentCount.oninput = () => {
    engageBtn.disabled = !validateEngagement();
  };

  engageBtn.onclick = async () => {
    const reactions = parseInt(reactionCount.value) || 0;
    const comments = parseInt(commentCount.value) || 0;

    if (!validateEngagement()) {
      engageStatus.textContent = 'Enter at least 1 like or 1 comment.';
      return;
    }

    engageBtn.disabled = true;
    counters.style.display = 'flex';
    likedCounter.textContent = `Liked 0/${reactions}`;
    commentedCounter.textContent = `Commented 0/${comments}`;
    engageStatus.textContent = 'Starting... (keep LinkedIn feed tab active)';

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'engageFeed',
        reactions,
        comments,
      });

      console.log('engageFeed response from background:', resp);

      if (!resp || resp.started === false) {
        if (resp?.reason === 'not_on_linkedin') {
          engageStatus.textContent = 'Open LinkedIn in current tab, then click Engage.';
        } else if (resp?.reason === 'no_active_tab') {
          engageStatus.textContent = 'No active tab found.';
        } else if (resp?.reason === 'not_on_feed') {
          engageStatus.textContent = 'Waiting for /feed/ to load – try again.';
        } else if (resp?.reason === 'no_content_script') {
          engageStatus.textContent = 'Content script not loaded on this page.';
        } else if (resp?.reason === 'error') {
          engageStatus.textContent = 'Error inside engagement script (check console).';
        } else {
          engageStatus.textContent = 'Could not start engagement.';
        }
        engageBtn.disabled = false;
        return;
      }

      engageStatus.textContent = 'Running';

      let tries = 0;
      const maxTries = 60; // allow up to ~60s

      const interval = setInterval(async () => {
        tries++;
        const result = await chrome.storage.local.get('engagementResult');

        if (result.engagementResult || tries >= maxTries) {
          clearInterval(interval);

          const r = result.engagementResult?.reactionsAttempted || 0;
          const c = result.engagementResult?.commentsAttempted || 0;

          likedCounter.textContent = `Liked ${r}/${reactions}`;
          commentedCounter.textContent = `Commented ${c}/${comments}`;
          engageStatus.textContent = 'Engagement finished.';

          chrome.storage.local.remove('engagementResult');
          engageBtn.disabled = false;
        }
      }, 1000);
    } catch (e) {
      console.error(e);
      engageStatus.textContent = `Error: ${e.message}`;
      engageBtn.disabled = false;
    }
  };
});
