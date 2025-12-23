// content-script.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extractProfile') {
    const data = extractProfileData();
    console.log('Extracted profile data:', data);
    sendResponse({ data });
    return true;
  }

  if (request.action === 'engageFeed') {
    console.log('EngageFeed request in content-script:', request);

    if (!location.pathname.startsWith('/feed')) {
      console.warn('Not on /feed in content script; pathname =', location.pathname);
      sendResponse({ started: false, reason: 'not_on_feed' });
      return true;
    }

    runFeedEngagement(request.reactions, request.comments)
      .then(() => sendResponse({ started: true }))
      .catch((e) => {
        console.error('runFeedEngagement error:', e);
        sendResponse({ started: false, reason: 'error' });
      });

    return true; // async
  }
});

// ----- PROFILE SCRAPING -----

function extractProfileData() {
  try {
    const name =
      document.querySelector('h1')?.textContent?.trim() || '';

    const headline =
      document.querySelector("div[data-view-name='profile-header'] span[dir='ltr']")?.textContent?.trim() ||
      document.querySelector("div.text-body-medium.break-words")?.textContent?.trim() ||
      '';

    const location =
      document.querySelector("span.text-body-small.inline.t-black--light.break-words")?.textContent?.trim() ||
      '';

    const about =
      document.querySelector("section[data-view-name='profile-about'] div[dir='ltr']")?.textContent?.trim() ||
      '';

    const followerText =
      document.querySelector("a[href*='followers'] span")?.textContent?.trim() || '0';

    const connectionText =
      document.querySelector("a[href*='detail/contact-info'] span")?.textContent?.trim() ||
      '0';

    const follower_count = parseInt(followerText.replace(/\D/g, ''), 10) || 0;
    const connection_count = parseInt(connectionText.replace(/\D/g, ''), 10) || 0;

    return {
      name,
      url: window.location.href,
      about,
      bio: about,
      location,
      follower_count,
      connection_count,
      bio_line: headline,
    };
  } catch (e) {
    console.error('Extraction failed:', e);
    return null;
  }
}

// ----- FEED ENGAGEMENT -----

async function runFeedEngagement(targetReactions, targetComments) {
  let reactions = 0;
  let comments = 0;
  let attempts = 0;

  const maxReactions = Math.min(targetReactions || 0, 10);
  const maxComments = Math.min(targetComments || 0, 5);
  const maxAttempts = maxReactions + maxComments + 5;

  console.log('Starting engagement...', { maxReactions, maxComments });

  while ((reactions < maxReactions || comments < maxComments) && attempts < maxAttempts) {
    attempts++;

    const posts = Array.from(
      document.querySelectorAll("div[data-id^='urn:li:activity']")
    );

    if (!posts.length) {
      console.log('No posts, scrolling...');
      window.scrollBy(0, randomInt(600, 1200));
      await waitFor(randomInt(2000, 5000));   // 2–5s
      continue;
    }

    for (const post of posts) {
      // LIKE
      if (reactions < maxReactions) {
        const likeButton =
          post.querySelector("button[aria-pressed='false'][aria-label*='Like']") ||
          post.querySelector("button[aria-label*='Like']");

        if (likeButton) {
          post.scrollIntoView({ behavior: 'smooth', block: 'center' });
          await waitFor(randomInt(700, 1500));

          likeButton.click();
          reactions++;
          console.log('Like attempted. Total likes:', reactions);

          await waitFor(randomInt(3000, 8000)); // 3–8s
        }
      }

      // COMMENT
      if (comments < maxComments) {
        const ok = await submitCommentForPost(post, 'CFBR');
        if (ok) {
          comments++;
          console.log('Comment succeeded. Total comments:', comments);
          await waitFor(randomInt(5000, 12000)); // 5–12s
        } else {
          console.log('Comment attempt failed on this post.');
        }
      }

      if (reactions >= maxReactions && comments >= maxComments) break;
    }

    window.scrollBy(0, randomInt(600, 1200));
    await waitFor(randomInt(2000, 5000));   // 2–5s
  }

  console.log('Engagement finished (best-effort).', {
    reactionsAttempted: reactions,
    commentsAttempted: comments,
    attempts,
  });

  chrome.storage.local.set({
    engagementResult: {
      reactionsAttempted: reactions,
      commentsAttempted: comments,
    },
  });
}

// ----- Single-post comment handler -----

async function submitCommentForPost(post, commentText) {
  const commentButton =
    post.querySelector("button[aria-label*='Comment']") ||
    post.querySelector("button[data-control-name='comment']");

  if (!commentButton) {
    console.log('No comment button found on this post.');
    return false;
  }

  commentButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await waitFor(randomInt(700, 1500));
  commentButton.click();
  console.log('Clicked comment button');

  // Wait for editor
  let editor = null;
  for (let i = 0; i < 10; i++) {
    editor =
      document.querySelector("div.comments-comment-box__editor div[role='textbox'][contenteditable='true']") ||
      post.querySelector("div[role='textbox'][contenteditable='true']") ||
      document.querySelector("div[role='textbox'][contenteditable='true']");
    if (editor) break;
    await waitFor(500);
  }

  if (!editor) {
    console.log('No editor found after clicking comment.');
    return false;
  }

  editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await waitFor(randomInt(700, 1500));

  // Fill text + events
  await fillCommentField(editor, commentText);
  console.log('Typed comment text');

  await waitFor(randomInt(1000, 2500));

  // Find Post / Comment button
  let submitButton = null;
  const form = editor.closest('form');

  for (let i = 0; i < 10; i++) {
    submitButton =
      (form && Array.from(form.querySelectorAll('button')).find(b => {
        const span = b.querySelector('span.artdeco-button__text');
        if (!span) return false;
        const txt = span.innerText.trim().toLowerCase();
        return txt === 'post' || txt === 'comment';
      })) ||
      Array.from(post.querySelectorAll('button')).find(b => {
        const span = b.querySelector('span.artdeco-button__text');
        if (!span) return false;
        const txt = span.innerText.trim().toLowerCase();
        return txt === 'post' || txt === 'comment';
      });

    if (submitButton) break;
    await waitFor(500);
  }

  if (!submitButton) {
    console.log('No submit button found after typing comment.');
    return false;
  }

  submitButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await waitFor(randomInt(500, 1500));
  submitButton.click();
  console.log('Clicked submit button');

  await waitFor(randomInt(1000, 2500));
  return true;
}

// ----- Helpers -----

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function waitFor(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fillCommentField(editor, text) {
  editor.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  selection.removeAllRanges();
  selection.addRange(range);

  editor.innerHTML = '';

  for (const ch of text.split('')) {
    document.execCommand('insertText', false, ch);
    await waitFor(randomInt(70, 220));
  }

  const inputEvent = new Event('input', { bubbles: true });
  editor.dispatchEvent(inputEvent);
  const changeEvent = new Event('change', { bubbles: true });
  editor.dispatchEvent(changeEvent);
}
