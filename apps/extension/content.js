/**
 * Form filler. Injected on demand (activeTab) — never runs without a click.
 * Green outline = filled from your data. Orange outline = found but not
 * confidently fillable; review it yourself. In Assist mode this never touches
 * submit buttons; only __trackerAutoApply submits, and only after opt-in.
 */
function trackerFillCore(profile, drafts, coverLetterB64, resumeB64, resumeFilename) {
  const FILLED = "2px solid #34c759";
  const REVIEW = "2px solid #ff9f0a";
  let filled = 0;
  let answers = 0;
  let unfilled = 0;
  let choices = 0;
  let coverLetterAttached = false;
  let resumeAttached = false;

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
    return options.find((o) => {
      const t = optionLabelText(o).toLowerCase();
      return t === target || t.startsWith(target);
    });
  }

  function isYesNoGroup(options) {
    const texts = options.map((o) => optionLabelText(o).toLowerCase());
    return texts.some((t) => t === "yes") && texts.some((t) => t === "no");
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
      const answer = rule[1].trim().toLowerCase();
      const option = [...el.options].find((o) => o.textContent.trim().toLowerCase().includes(answer));
      if (option) {
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
        setter.call(el, option.value);
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.style.outline = FILLED;
        choices++;
        continue;
      }
    }
    if (isRequired(label, el)) {
      el.style.outline = REVIEW;
      unfilled++;
    }
  }

  return { filled, answers, unfilled, choices, coverLetterAttached, resumeAttached };
}

// Assist entry point: fill only, never submit.
window.__trackerFill = trackerFillCore;

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

/**
 * Full Auto-Apply entry point (opt-in only). Detects blockers FIRST and refuses
 * to touch the form if present; fills; refuses to submit if required fields are
 * unfilled; otherwise clicks the submit control once and reports.
 */
window.__trackerAutoApply = function autoApply(profile, drafts, coverLetterB64, resumeB64, resumeFilename) {
  const blocker = trackerDetectBlocker();
  if (blocker) return { outcome: "blocked", detail: blocker };

  const result = trackerFillCore(profile, drafts, coverLetterB64, resumeB64, resumeFilename);
  if (result.unfilled > 0) return { outcome: "incomplete", ...result };

  // Prefer a real submit control; fall back to a button whose text reads like one.
  const visible = (el) => el && el.offsetParent !== null && !el.disabled;
  let submit = [...document.querySelectorAll('button[type="submit"], input[type="submit"]')].find(
    visible,
  );
  if (!submit) {
    submit = [...document.querySelectorAll("button")].find(
      (b) => visible(b) && /^(submit|apply|send application)/i.test((b.textContent || "").trim()),
    );
  }
  if (!submit) return { outcome: "failed", detail: "no submit button found" };

  submit.click();
  return new Promise((resolve) => {
    setTimeout(() => resolve({ outcome: "submitted", ...result }), 2500);
  });
};
