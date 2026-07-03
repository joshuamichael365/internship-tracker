const content = document.getElementById("content");

function render(html) {
  content.innerHTML = html;
}

async function init() {
  const { appUrl, token } = await chrome.storage.sync.get(["appUrl", "token"]);
  if (!appUrl || !token) {
    render(`<h3>Setup needed</h3><p>Set the app URL and token first.</p>
      <button id="opts">Open settings</button>`);
    document.getElementById("opts").onclick = () => chrome.runtime.openOptionsPage();
    return;
  }

  const version = chrome.runtime.getManifest().version;
  let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url && !tab?.pendingUrl) {
    [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  }
  const pageUrl = tab?.url || tab?.pendingUrl || "";
  if (!pageUrl.startsWith("http")) {
    render(
      pageUrl
        ? `<p>This is a browser page (<code>${pageUrl.split(":")[0]}://…</code>), not a website. Switch to a normal webpage tab, then click here.</p><p style="color:#a1a1a6">v${version}</p>`
        : `<p><b>Chrome didn't share this tab's address.</b></p><p>Reload the extension on chrome://extensions (↻ on the card), then try again from a normal webpage.</p><p style="color:#a1a1a6">v${version} · debug: ${tab ? "tab found, url hidden" : "no active tab"}</p>`,
    );
    return;
  }

  let data;
  try {
    const res = await fetch(`${appUrl}/api/assist/packet?url=${encodeURIComponent(pageUrl)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (err) {
    render(`<h3>Can't reach the app</h3><p>${err.message}. Is the tracker running at ${appUrl}?</p>`);
    return;
  }

  if (!data.match) {
    render(`<h3>No tracked application</h3>
      <p>This page doesn't match anything in your tracker. Add it there first (paste the link), pick a mode, and come back.</p>`);
    return;
  }

  const m = data.match;
  const modeLabel = m.mode === "assist" ? "Assisted" : m.mode === "manual" ? "Manual" : m.mode === "auto" ? "Auto-Apply" : "Mode not chosen";
  const canFill = m.mode === "assist";
  const isAuto = m.mode === "auto";
  const autoApproved = isAuto && m.autoApply && m.autoApply.approved;

  let modeBlock;
  if (canFill) {
    modeBlock = `<button id="fill">Fill this page</button>
      <p>Fills standard fields, drafted answers, and attaches your cover letter. Anything it can't fill is highlighted — <b>you review and click Submit yourself.</b></p>`;
  } else if (isAuto && !autoApproved) {
    modeBlock = `<p style="margin-top:10px">Approve Auto-Apply in the tracker first.</p>`;
  } else if (autoApproved) {
    modeBlock = `<button id="auto" style="background:#8b5cf6">Auto-Apply now</button>
      <p>This will fill AND submit — no final click. Blockers stop it safely.</p>`;
  } else {
    modeBlock = `<p style="margin-top:10px">Set this application to <b>Agentic Assist</b> in the tracker to enable filling.</p>`;
  }

  render(`
    <h3>${m.company}</h3>
    <p>${m.roleTitle}</p>
    <span class="badge">${modeLabel}</span>
    ${modeBlock}
    <div id="result"></div>
  `);

  const result = () => document.getElementById("result");

  // Fetch the cover letter PDF bytes here (content scripts can't send our auth header cross-origin).
  async function fetchCoverLetterB64() {
    if (!m.coverLetterPdfUrl) return null;
    try {
      const pdfRes = await fetch(`${appUrl}${m.coverLetterPdfUrl}`, {
        headers: { authorization: `Bearer ${token}` },
      });
      if (pdfRes.ok) {
        const buf = await pdfRes.arrayBuffer();
        return btoa(String.fromCharCode(...new Uint8Array(buf)));
      }
    } catch {}
    return null;
  }

  async function report(event, detail) {
    try {
      await fetch(`${appUrl}/api/assist/report`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ applicationId: m.applicationId, event, detail }),
      });
    } catch {}
  }

  if (canFill) {
    document.getElementById("fill").onclick = async () => {
      const coverLetterB64 = await fetchCoverLetterB64();
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"],
      });
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (profile, drafts, pdfB64) => window.__trackerFill(profile, drafts, pdfB64),
        args: [data.profile, m.drafts || {}, coverLetterB64],
      });
      const r = res?.result;
      result().textContent = r
        ? `Filled ${r.filled} field(s)` +
          (r.answers ? `, ${r.answers} answer(s)` : "") +
          (r.coverLetterAttached ? ", cover letter attached" : "") +
          (r.unfilled > 0 ? `\n${r.unfilled} field(s) highlighted orange need your attention.` : "") +
          `\n\nReview everything, then submit yourself.`
        : "Fill script didn't report back — check the page.";
      void injection;
    };
    return;
  }

  if (!autoApproved) return;

  document.getElementById("auto").onclick = async () => {
    document.getElementById("auto").disabled = true;
    const coverLetterB64 = await fetchCoverLetterB64();

    async function runOnce() {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
      const [res] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (profile, drafts, pdfB64) => window.__trackerAutoApply(profile, drafts, pdfB64),
        args: [data.profile, m.drafts || {}, coverLetterB64],
      });
      return res?.result || { outcome: "failed", detail: "auto-apply script didn't report back" };
    }

    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    // Blockers get bounded retries with backoff (3 attempts total: 0s, 5s, 15s).
    const BACKOFF = [0, 5, 15];
    let r;
    for (let attempt = 0; attempt < BACKOFF.length; attempt++) {
      if (BACKOFF[attempt] > 0) {
        for (let s = BACKOFF[attempt]; s > 0; s--) {
          result().textContent = `Blocked by the portal. Retrying in ${s}s… (attempt ${attempt + 1} of ${BACKOFF.length})`;
          await wait(1000);
        }
      } else {
        result().textContent = "Auto-applying…";
      }
      r = await runOnce();
      if (r.outcome !== "blocked") break;
    }

    if (r.outcome === "submitted") {
      await report("submitted");
      result().textContent = "Submitted ✓ — receipt sent";
    } else if (r.outcome === "blocked") {
      await report("blocked", r.detail);
      result().textContent =
        "Blocked by the portal (CAPTCHA). You'll get a notification — finish manually.";
    } else if (r.outcome === "incomplete") {
      await report("failed", "unfilled required fields");
      result().textContent = `${r.unfilled} field(s) couldn't be filled — review the orange highlights and submit yourself (downgraded to Assist behavior).`;
    } else {
      await report("failed", r.detail);
      result().textContent = r.detail || "Auto-apply failed.";
    }
  };
}

init();
