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
  render(`
    <h3>${m.company}</h3>
    <p>${m.roleTitle}</p>
    <span class="badge">${modeLabel}</span>
    ${canFill
      ? `<button id="fill">Fill this page</button>
         <p>Fills standard fields, drafted answers, and attaches your cover letter. Anything it can't fill is highlighted — <b>you review and click Submit yourself.</b></p>`
      : `<p style="margin-top:10px">Set this application to <b>Agentic Assist</b> in the tracker to enable filling.</p>`}
    <div id="result"></div>
  `);

  if (!canFill) return;
  document.getElementById("fill").onclick = async () => {
    // Fetch the cover letter PDF bytes here (content scripts can't send our auth header cross-origin).
    let coverLetterB64 = null;
    if (m.coverLetterPdfUrl) {
      try {
        const pdfRes = await fetch(`${appUrl}${m.coverLetterPdfUrl}`, {
          headers: { authorization: `Bearer ${token}` },
        });
        if (pdfRes.ok) {
          const buf = await pdfRes.arrayBuffer();
          coverLetterB64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
        }
      } catch {}
    }

    const [injection] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: (profile, drafts, pdfB64) => window.__trackerFill(profile, drafts, pdfB64),
      args: [data.profile, m.drafts || {}, coverLetterB64],
    });
    const r = result?.result;
    document.getElementById("result").textContent = r
      ? `Filled ${r.filled} field(s)` +
        (r.answers ? `, ${r.answers} answer(s)` : "") +
        (r.coverLetterAttached ? ", cover letter attached" : "") +
        (r.unfilled > 0 ? `\n${r.unfilled} field(s) highlighted orange need your attention.` : "") +
        `\n\nReview everything, then submit yourself.`
      : "Fill script didn't report back — check the page.";
    void injection;
  };
}

init();
