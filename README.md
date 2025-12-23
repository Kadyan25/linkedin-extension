# LinkedIn Profile Scraper & Feed Engagement (Chrome Extension)

A Manifest V3 Chrome extension that:

- Scrapes basic data from a list of LinkedIn profile URLs
- Performsengagement on your LinkedIn feed (likes + comments) in a more human‑like way
---

## Features

### 1. Profile scraping

- Input a comma‑separated list of LinkedIn profile URLs in the popup
- Background script opens a **single hidden tab** and:
  - Navigates through each profile
  - Injects a content script to extract:
    - Name
    - Headline
    - Location
    - About
    - Followers count
    - Connections count
    - Profile URL
  - Sends the data to a backend API (`http://localhost:3000/profiles`) via `fetch` (JSON body)

### 2. Feed engagement

- From the popup:
  - Enter desired number of **reactions** and **comments**
  - Click **Start Feed Engagement**
- Extension:
  - Ensures active tab is on `https://www.linkedin.com/feed/`
  - Content script scans visible posts and:
    - Likes posts up to the requested count
    - Opens comment boxes, types a fixed comment (`CFBR`), and clicks the Post button
- Engagement is:
  - Limited (hard‑capped likes/comments per run)
  - Delayed with **random intervals** between actions (seconds range)
  - Reports final attempted counts back to the popup

---

## Architecture Overview

### Files

- `manifest.json`
  - Manifest V3 configuration
  - Declares:
    - Permissions: `activeTab`, `tabs`, `storage`
    - `host_permissions` for LinkedIn + backend
    - `background.service_worker = background.js`
    - `content_scripts` on `https://www.linkedin.com/*`
    - `action.default_popup = popup.html`

- `background.js`
  - Listens for popup messages:
    - `scrapeProfiles` – orchestrates profile scraping via a hidden tab
    - `engageFeed` – ensures active LinkedIn feed tab, then forwards to content script
  - Communicates with:
    - `content-script.js` via `chrome.tabs.sendMessage`
    - Backend via `fetch(BACKEND_URL, { method: 'POST', body: JSON.stringify(...) })`

- `content-script.js`
  - Auto‑loaded on all `https://www.linkedin.com/*` pages
  - Handles:
    - `extractProfile` – DOM scraping on profile pages
    - `engageFeed` – engagement loop on feed (`/feed`)
  - Engagement logic:
    - Loops through feed posts
    - For each post:
      - Optionally clicks **Like**
      - Optionally:
        - Clicks **Comment**
        - Waits for editor
        - Types comment text character‑by‑character
        - Dispatches `input`/`change` events
        - Finds the correct **Post/Comment** button (within same form)
        - Clicks it
    - Uses random delays between actions
    - Stores summary in `chrome.storage.local.engagementResult`

- `popup.html`
  - Simple UI with three sections:
    1. Current Tab Title
    2. Profile Scraping (textarea + button + progress bar)
    3. Feed Engagement (inputs for likes/comments, status, counters)

- `popup.js`
  - Wires popup UI to background:
    - `scrapeProfiles`:
      - Reads URLs from textarea
      - Sends `{ action: 'scrapeProfiles', urls }`
      - Displays success/failed counts and a progress bar
    - `engageFeed`:
      - Reads like/comment counts
      - Sends `{ action: 'engageFeed', reactions, comments }`
      - Polls `chrome.storage.local.engagementResult` up to ~60s
      - Updates counters + status when engagement finishes

---

## How It Works (End‑to‑End)

### Scraping flow

1. User pastes profile URLs into popup and clicks **Start Profile Scraping**.
2. Popup sends `scrapeProfiles` with URL array to background.
3. Background:
   - Opens one hidden tab (or reuses it)
   - For each URL:
     - Navigates hidden tab to profile URL
     - Waits for `tabs.onUpdated` `status === 'complete'`
     - Sends `{ action: 'extractProfile' }` to content script
4. Content script:
   - Runs `extractProfileData()` on the profile DOM
   - Returns scraped object `{ name, url, headline, location, about, follower_count, connection_count }`
5. Background:
   - Sends an array of profiles to backend via `POST /profiles`
   - Tracks success/failed counts and returns summary to popup

### Engagement flow

1. User opens LinkedIn feed in current tab.
2. In popup, user enters reactions/comments and clicks **Start Feed Engagement**.
3. Popup sends `engageFeed` message to background.
4. Background:
   - Verifies active tab URL starts with `https://www.linkedin.com/`
   - If not on `/feed`, updates tab to `https://www.linkedin.com/feed/` and waits for load
   - Sends `{ action: 'engageFeed', reactions, comments }` to content script on that tab
5. Content script:
   - Checks `location.pathname.startsWith('/feed')`
   - Runs `runFeedEngagement()`:
     - Iterates through feed posts
     - Uses `submitCommentForPost()` and `fillCommentField()` to:
       - Open comment editor
       - Type text with per‑character delays
       - Dispatch input events
       - Click the correct Post/Comment button
     - Applies random delays between likes/comments/scrolls
     - Stops when requested counts (or safety limits) are reached
   - Saves result to `chrome.storage.local.engagementResult`
6. Popup:
   - Polls `chrome.storage.local.get('engagementResult')`
   - Once available, updates “Liked X/Y” and “Commented X/Y” and re‑enables the button

---

## Running Locally

1. Clone or copy the project folder containing:
   - `manifest.json`
   - `background.js`
   - `content-script.js`
   - `popup.html`
   - `popup.js`

2. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable **Developer mode**
   - Click **Load unpacked**
   - Select the project folder (where `manifest.json` is)

3. (Optional) Run backend API:
   - Start your backend on `http://localhost:3000/profiles` to receive scraped data.

4. Use the extension:
   - Pin the extension icon (optional).
   - For scraping:
     - Paste LinkedIn profile URLs (comma‑separated) into the popup
     - Click **Start Profile Scraping**
   - For engagement:
     - Open `https://www.linkedin.com/feed/` in the active tab
     - Enter small numbers of reactions/comments
     - Click **Start Feed Engagement**

---

## Customization

- Scraping:
  - Update `extractProfileData()` in `content-script.js` if LinkedIn DOM changes.
  - Modify backend URL in `background.js` (`BACKEND_URL` constant).

- Engagement:
  - Change fixed comment text (`'CFBR'`) in `submitCommentForPost`.
  - Adjust delay ranges inside `runFeedEngagement` and `submitCommentForPost` in `content-script.js`.
  - Adjust hard caps via `maxReactions` / `maxComments`.

---

## Tech Stack

- **Chrome Extension**: Manifest V3
- **Languages**: JavaScript, HTML, CSS
- **APIs**:
  - `chrome.tabs`
  - `chrome.runtime`
  - `chrome.storage`
  - `chrome.tabs.onUpdated`
- **Backend**: Any HTTP server accepting `POST /profiles` with JSON arrays
