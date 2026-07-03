/**
 * Form filler. Injected on demand (activeTab) — never runs without a click.
 * Green outline = filled from your data. Orange outline = found but not
 * confidently fillable; review it yourself. In Assist mode this never touches
 * submit buttons; only __trackerAutoApply submits, and only after opt-in.
 */
// Registry of choice groups whose literal match failed, keyed by pendingId.
// Kept on window (not a closure var) because each fill/resolve step is a
// separate chrome.scripting.executeScript() call into the page — a fresh
// script injection with no memory of prior closures. Elements are also
// tagged with a data-tracker-pending="N" attribute so they can be found even
// if the DOM has re-rendered the group between calls.
window.__trackerPending = window.__trackerPending || new Map();
window.__trackerPendingSeq = window.__trackerPendingSeq || 0;
// Count of required choice groups still outlined REVIEW after resolution —
// __trackerFinishAutoApply checks this before allowing a submit.
window.__trackerUnresolvedRequired = window.__trackerUnresolvedRequired || 0;

function trackerFillCore(profile, drafts, coverLetterB64, resumeB64, resumeFilename) {
  const FILLED = "2px solid #34c759";
  const REVIEW = "2px solid #ff9f0a";
  let filled = 0;
  let answers = 0;
  let unfilled = 0;
  let choices = 0;
  let coverLetterAttached = false;
  let resumeAttached = false;
  const pendingChoices = [];

  const name = (profile.fullName || "").trim();
  const [firstName, ...rest] = name.split(/\s+/);
  const lastName = rest.join(" ");

  // label-pattern → value (ordered; first match wins per field)
  const RULES = [
    [/first\s*name|given\s*name/i, firstName],
    [/last\s*name|family\s*name|surname/i, lastName],
    [/full\s*name|^name$|your\s*name/i, name],
    [/e-?mail/i, profile.email],
    [/phone|mobile/i, profile.phone],
    [/linkedin/i, profile.linkedin],
    [/github/i, profile.github],
    [/portfolio|personal\s*(web)?site|other\s*website/i, profile.website],
    [/school|university|college|institution/i, profile.school],
    [/degree/i, profile.degree],
    [/major|field\s*of\s*study/i, profile.degree],
    [/graduat/i, profile.gradDate],
    [/gpa/i, profile.gpa],
    [/(city|location)/i, profile.location],
    [/pronoun/i, profile.pronouns],
  ];

  // question-pattern → answer, for radio groups / checkbox groups / selects.
  const ANSWER_RULES = [
    [/sponsor/i, profile.requiresSponsorship],
    [/authoriz/i, profile.authorizedToWork],
    [/currently (enrolled|pursuing)|enrolled in a .*(college|university|degree)/i, profile.currentlyEnrolled],
    [/relocat/i, profile.willingToRelocate],
    [/pronoun/i, profile.pronouns],
    [/gender/i, profile.gender],
    [/race|ethnicit/i, profile.raceEthnicity],
    [/veteran/i, profile.veteranStatus],
    [/disabilit/i, profile.disabilityStatus],
    [/how did you hear|hear about/i, profile.howDidYouHear],
  ];

  function labelFor(el) {
    const bits = [];
    if (el.labels) for (const l of el.labels) bits.push(l.textContent);
    bits.push(el.getAttribute("aria-label"), el.placeholder, el.name, el.id);
    const wrapper = el.closest("[class*='field'],[class*='question'],li,fieldset,div");
    if (wrapper) {
      const lbl = wrapper.querySelector("label, legend, [class*='label']");
      if (lbl) bits.push(lbl.textContent);
    }
    return bits.filter(Boolean).join(" ").slice(0, 300);
  }

  function setValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    ).set;
    setter.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function isRequired(text, el) {
    return /\brequired\b|\*/.test(text) || el?.getAttribute?.("aria-required") === "true";
  }

  const inputs = [...document.querySelectorAll("input, textarea")].filter(
    (el) =>
      !["hidden", "submit", "button", "checkbox", "radio", "file", "password"].includes(el.type) &&
      el.offsetParent !== null &&
      !el.value,
  );

  const qas = (drafts.answers || []).map((a) => ({
    ...a,
    words: a.prompt.toLowerCase().split(/\W+/).filter((w) => w.length > 3),
    used: false,
  }));

  for (const el of inputs) {
    const label = labelFor(el);

    // Long-form question → match a drafted answer by keyword overlap.
    if (el.tagName === "TEXTAREA" || /essay|answer|describe|why|tell us/i.test(label)) {
      const best = qas
        .filter((q) => !q.used)
        .map((q) => ({
          q,
          score: q.words.filter((w) => label.toLowerCase().includes(w)).length / (q.words.length || 1),
        }))
        .sort((a, b) => b.score - a.score)[0];
      if (best && best.score >= 0.4) {
        setValue(el, best.q.answer);
        best.q.used = true;
        el.style.outline = FILLED;
        answers++;
        continue;
      }
      if (el.tagName === "TEXTAREA") {
        el.style.outline = REVIEW;
        unfilled++;
        continue;
      }
    }

    const rule = RULES.find(([re, v]) => v && re.test(label));
    if (rule) {
      setValue(el, rule[1]);
      el.style.outline = FILLED;
      filled++;
    } else if (isRequired(label)) {
      el.style.outline = REVIEW;
      unfilled++;
    }
  }

  // File attachments: cover letter and resume. Cover-letter match is checked
  // FIRST on every file input so a field labeled "cover letter" never gets
  // the resume, even if it also loosely matches /resume/.
  for (const el of document.querySelectorAll('input[type="file"]')) {
    const label = labelFor(el);

    if (coverLetterB64 && !coverLetterAttached && /cover\s*letter/i.test(label)) {
      try {
        const bytes = Uint8Array.from(atob(coverLetterB64), (c) => c.charCodeAt(0));
        const file = new File([bytes], "CoverLetter.pdf", { type: "application/pdf" });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.outline = FILLED;
        coverLetterAttached = true;
      } catch {
        el.style.outline = REVIEW;
        unfilled++;
      }
      continue;
    }

    if (resumeB64 && !resumeAttached && /resume|\bcv\b/i.test(label) && !/cover/i.test(label)) {
      try {
        const name = resumeFilename || "Resume.pdf";
        const ext = (name.split(".").pop() || "pdf").toLowerCase();
        const type = ext === "pdf" ? "application/pdf" : "application/octet-stream";
        const bytes = Uint8Array.from(atob(resumeB64), (c) => c.charCodeAt(0));
        const file = new File([bytes], name, { type });
        const dt = new DataTransfer();
        dt.items.add(file);
        el.files = dt.files;
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.outline = FILLED;
        resumeAttached = true;
      } catch {
        el.style.outline = REVIEW;
        unfilled++;
      }
    }
  }

  // Choice fields: radio groups, checkbox groups, and selects.
  function outlineGroup(container, style) {
    (container.querySelectorAll ? container.querySelectorAll("label") : []).forEach((l) => {
      l.style.outline = style;
    });
    if (container.style) container.style.outline = style;
  }

  function optionLabelText(el) {
    if (el.labels && el.labels[0]) return el.labels[0].textContent.trim();
    const wrapper = el.closest("label");
    if (wrapper) return wrapper.textContent.trim();
    const id = el.id;
    if (id) {
      const lbl = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    return (el.value || "").trim();
  }

  function groupContainer(members) {
    if (members.length === 1) return members[0].closest("fieldset, [class*='question'], [class*='field']") || members[0].parentElement;
    let el = members[0];
    const others = members.slice(1);
    while (el) {
      if (others.every((o) => el.contains(o))) return el;
      el = el.parentElement;
    }
    return members[0].parentElement;
  }

  function questionText(container) {
    if (!container) return "";
    const bits = [];
    if (container.tagName === "FIELDSET") {
      const legendEl = container.querySelector("legend");
      if (legendEl) bits.push(legendEl.textContent);
    }
    const heading = container.querySelector?.("[class*='label'], [class*='question'], h1, h2, h3, h4, h5");
    if (heading) bits.push(heading.textContent);
    // Look upward for a preceding heading/label if nothing found inside.
    if (!bits.length) {
      let sib = container.previousElementSibling;
      let hops = 0;
      while (sib && hops < 3) {
        if (/^(h[1-6]|label|legend|p)$/i.test(sib.tagName) && sib.textContent.trim()) {
          bits.push(sib.textContent);
          break;
        }
        sib = sib.previousElementSibling;
        hops++;
      }
    }
    bits.push(container.getAttribute?.("aria-label"));
    return bits.filter(Boolean).join(" ").slice(0, 300);
  }

  function findMatchingOption(options, answer) {
    const target = answer.trim().toLowerCase();
    // Short answers (e.g. "Yes"/"No") must match on a word boundary or
    // equality/starts-with — never a bare substring, which would let "No"
    // match inside "Not currently enrolled". Longer answers keep the more
    // permissive contains-matching, since they're specific enough already.
    if (target.length <= 4) {
      const boundary = new RegExp(`(^|\\W)${target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`);
      return options.find((o) => {
        const t = optionLabelText(o).toLowerCase();
        return t === target || t.startsWith(target) || boundary.test(t);
      });
    }
    return options.find((o) => {
      const t = optionLabelText(o).toLowerCase();
      return t === target || t.startsWith(target) || t.includes(target);
    });
  }

  function isYesNoGroup(options) {
    const texts = options.map((o) => optionLabelText(o).toLowerCase());
    return texts.some((t) => t === "yes") && texts.some((t) => t === "no");
  }

  // Records a choice group whose literal match failed, so the popup can ask
  // the backend to semantically resolve it. `elements` are the actual option
  // nodes (radio/checkbox inputs, or the single <select> element) — tagged
  // with data-tracker-pending so __trackerResolvePending can find them again
  // even across a fresh script injection.
  function recordPending(kind, container, qText, answer, options, elements, required) {
    const pendingId = `p${window.__trackerPendingSeq++}`;
    elements.forEach((el) => el.setAttribute("data-tracker-pending", pendingId));
    const optionTexts =
      kind === "select"
        ? [...elements[0].options].map((o) => o.textContent.trim())
        : options.map((o) => optionLabelText(o));
    window.__trackerPending.set(pendingId, { kind, container, elements, required });
    pendingChoices.push({ kind, question: qText, storedAnswer: answer, options: optionTexts, pendingId, required });
    if (required) window.__trackerUnresolvedRequired++;
  }

  // Radio groups (by name).
  const radios = [...document.querySelectorAll('input[type="radio"]')].filter(
    (el) => el.offsetParent !== null,
  );
  const radioGroups = new Map();
  for (const el of radios) {
    // Group by name when present; otherwise each radio is its own "group" of one
    // (the element itself is a stable Map key even without a name attribute).
    const groupKey = el.name || el;
    if (!radioGroups.has(groupKey)) radioGroups.set(groupKey, []);
    radioGroups.get(groupKey).push(el);
  }
  for (const options of radioGroups.values()) {
    const alreadyAnswered = options.some((o) => o.checked);
    const container = groupContainer(options);
    const qText = questionText(container) || labelFor(options[0]);
    if (alreadyAnswered) continue;

    const rule = ANSWER_RULES.find(([re, v]) => v && re.test(qText));
    if (rule) {
      const answer = rule[1];
      const isYesNo = /^(yes|no)$/i.test(answer);
      if (!isYesNo || isYesNoGroup(options)) {
        const match = findMatchingOption(options, answer);
        if (match) {
          match.click();
          outlineGroup(container, FILLED);
          choices++;
          continue;
        }
        // Rule matched the question but no option matched the stored answer —
        // defer to semantic resolution instead of giving up immediately.
        recordPending("radio", container, qText, answer, options, options, isRequired(qText, container));
        continue;
      }
    }
    if (isRequired(qText, container)) {
      outlineGroup(container, REVIEW);
      unfilled++;
    }
  }

  // Checkbox groups (by name, excluding lone checkboxes with no siblings sharing a name —
  // those are typically consent boxes, not multi-choice questions, and are left alone).
  const checkboxes = [...document.querySelectorAll('input[type="checkbox"]')].filter(
    (el) => el.offsetParent !== null && el.name,
  );
  const checkboxGroups = new Map();
  for (const el of checkboxes) {
    if (!checkboxGroups.has(el.name)) checkboxGroups.set(el.name, []);
    checkboxGroups.get(el.name).push(el);
  }
  for (const options of checkboxGroups.values()) {
    if (options.length < 2) continue;
    const alreadyAnswered = options.some((o) => o.checked);
    const container = groupContainer(options);
    const qText = questionText(container) || labelFor(options[0]);
    if (alreadyAnswered) continue;

    const rule = ANSWER_RULES.find(([re, v]) => v && re.test(qText));
    if (rule) {
      const answer = rule[1];
      const isYesNo = /^(yes|no)$/i.test(answer);
      if (!isYesNo || isYesNoGroup(options)) {
        const match = findMatchingOption(options, answer);
        if (match) {
          match.click();
          outlineGroup(container, FILLED);
          choices++;
          continue;
        }
        recordPending("checkbox", container, qText, answer, options, options, isRequired(qText, container));
        continue;
      }
    }
    if (isRequired(qText, container)) {
      outlineGroup(container, REVIEW);
      unfilled++;
    }
  }

  // Selects.
  const selects = [...document.querySelectorAll("select")].filter(
    (el) => el.offsetParent !== null && !el.value,
  );
  for (const el of selects) {
    const label = labelFor(el);
    const rule = ANSWER_RULES.find(([re, v]) => v && re.test(label));
    if (rule) {
      const rawAnswer = rule[1];
      const answer = rawAnswer.trim().toLowerCase();
      const optionEls = [...el.options];
      let option;
      if (answer.length <= 4) {
        const boundary = new RegExp(`(^|\\W)${answer.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\W|$)`);
        option = optionEls.find((o) => {
          const t = o.textContent.trim().toLowerCase();
          return t === answer || t.startsWith(answer) || boundary.test(t);
        });
      } else {
        option = optionEls.find((o) => o.textContent.trim().toLowerCase().includes(answer));
      }
      if (option) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(el, option.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.outline = FILLED;
        choices++;
        continue;
      }
      recordPending("select", el, label, rawAnswer, optionEls, [el], isRequired(label, el));
      continue;
    }
    if (isRequired(label, el)) {
      el.style.outline = REVIEW;
      unfilled++;
    }
  }

  return { filled, answers, unfilled, choices, coverLetterAttached, resumeAttached, pendingChoices };
}

// Assist entry point: fill only, never submit.
window.__trackerFill = trackerFillCore;

/**
 * Applies semantic-match resolutions from the backend to previously-recorded
 * pending choice groups. `resolutions` is [{pendingId, index|null}]. index !=
 * null clicks/selects that option using the same mechanics as the literal
 * path (real click for radio/checkbox, native setter + change for selects);
 * index null leaves/re-marks the group REVIEW orange. Returns
 * {resolved, stillUnfilled} where stillUnfilled only counts REQUIRED groups
 * that remain unresolved.
 */
window.__trackerResolvePending = function trackerResolvePending(resolutions) {
  const FILLED = "2px solid #34c759";
  const REVIEW = "2px solid #ff9f0a";
  let resolved = 0;
  let stillUnfilled = 0;

  function outlineGroup(container, style) {
    (container?.querySelectorAll ? container.querySelectorAll("label") : []).forEach((l) => {
      l.style.outline = style;
    });
    if (container?.style) container.style.outline = style;
  }

  for (const { pendingId, index } of resolutions || []) {
    const pending = window.__trackerPending.get(pendingId);
    if (!pending) continue;
    const { kind, container, elements, required } = pending;

    // Elements may have been detached/re-rendered; fall back to the DOM
    // attribute lookup if the held reference is stale.
    const liveElements = elements.filter((el) => el.isConnected);
    const els = liveElements.length
      ? liveElements
      : [...document.querySelectorAll(`[data-tracker-pending="${pendingId}"]`)];

    if (index != null && els.length) {
      if (kind === "select") {
        const el = els[0];
        const option = [...el.options][index];
        if (option) {
          const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
          setter.call(el, option.value);
          el.dispatchEvent(new Event("change", { bubbles: true }));
          el.style.outline = FILLED;
          resolved++;
          if (required) window.__trackerUnresolvedRequired--;
          window.__trackerPending.delete(pendingId);
          continue;
        }
      } else {
        const target = els[index];
        if (target) {
          target.click();
          outlineGroup(container, FILLED);
          resolved++;
          if (required) window.__trackerUnresolvedRequired--;
          window.__trackerPending.delete(pendingId);
          continue;
        }
      }
    }

    // No confident match (index null, out of range, or elements gone) —
    // leave it for the human.
    if (kind === "select" && els[0]) {
      els[0].style.outline = REVIEW;
    } else {
      outlineGroup(container, REVIEW);
    }
    if (required) stillUnfilled++;
  }

  return { resolved, stillUnfilled };
};

/** True if the page shows a CAPTCHA / bot-check that would block a submit. */
function trackerDetectBlocker() {
  const BLOCKER_SEL =
    'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[src*="turnstile"],' +
    '.g-recaptcha, .h-captcha, .cf-turnstile, #cf-challenge-running, [class*="cf-challenge"]';
  if (document.querySelector(BLOCKER_SEL)) return "CAPTCHA or bot-check on the page";
  if (/verify you are human/i.test(document.body?.innerText || "")) {
    return "human-verification challenge on the page";
  }
  return null;
}

/** Finds a real submit control, falling back to a button that reads like one. */
function trackerFindSubmit() {
  const visible = (el) => el && el.offsetParent !== null && !el.disabled;
  let submit = [...document.querySelectorAll('button[type="submit"], input[type="submit"]')].find(
    visible,
  );
  if (!submit) {
    submit = [...document.querySelectorAll("button")].find(
      (b) => visible(b) && /^(submit|apply|send application)/i.test((b.textContent || "").trim()),
    );
  }
  return submit || null;
}

/**
 * Full Auto-Apply entry point (opt-in only). Detects blockers FIRST and refuses
 * to touch the form if present, then fills. If any choice questions need
 * semantic resolution (pendingChoices), it stops here and hands control back
 * to the popup — it must NOT submit until those are resolved. Otherwise, if
 * required fields are still unfilled, it downgrades to Assist behavior.
 */
window.__trackerAutoApply = function autoApply(profile, drafts, coverLetterB64, resumeB64, resumeFilename) {
  const blocker = trackerDetectBlocker();
  if (blocker) return { outcome: "blocked", detail: blocker };

  // Fresh fill pass — reset pending state so stale entries from a prior
  // attempt on this page don't linger.
  window.__trackerPending = new Map();
  window.__trackerUnresolvedRequired = 0;

  const result = trackerFillCore(profile, drafts, coverLetterB64, resumeB64, resumeFilename);

  if (result.pendingChoices && result.pendingChoices.length) {
    return { outcome: "pending", ...result };
  }
  if (result.unfilled > 0) return { outcome: "incomplete", ...result };

  const submit = trackerFindSubmit();
  if (!submit) return { outcome: "failed", detail: "no submit button found" };

  submit.click();
  return new Promise((resolve) => {
    setTimeout(() => resolve({ outcome: "submitted", ...result }), 2500);
  });
};

/**
 * Called after the popup has resolved all pendingChoices via
 * __trackerResolvePending. Re-checks blockers (the page may have changed),
 * verifies no required choice group is still outlined REVIEW, then submits
 * exactly like __trackerAutoApply's tail end used to.
 */
window.__trackerFinishAutoApply = function trackerFinishAutoApply() {
  const blocker = trackerDetectBlocker();
  if (blocker) return { outcome: "blocked", detail: blocker };

  if (window.__trackerUnresolvedRequired > 0) {
    return { outcome: "failed", detail: "unfilled required fields" };
  }

  const submit = trackerFindSubmit();
  if (!submit) return { outcome: "failed", detail: "no submit button found" };

  submit.click();
  return new Promise((resolve) => {
    setTimeout(() => resolve({ outcome: "submitted" }), 2500);
  });
};
