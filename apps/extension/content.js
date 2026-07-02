/**
 * Form filler. Injected on demand (activeTab) — never runs without a click.
 * Green outline = filled from your data. Orange outline = found but not
 * confidently fillable; review it yourself. Never touches submit buttons.
 */
window.__trackerFill = function fill(profile, drafts, coverLetterB64) {
  const FILLED = "2px solid #34c759";
  const REVIEW = "2px solid #ff9f0a";
  let filled = 0;
  let answers = 0;
  let unfilled = 0;
  let coverLetterAttached = false;

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
    } else if (/\brequired\b|\*/.test(label)) {
      el.style.outline = REVIEW;
      unfilled++;
    }
  }

  // Cover letter attachment: any file input whose context mentions cover letter.
  if (coverLetterB64) {
    for (const el of document.querySelectorAll('input[type="file"]')) {
      const label = labelFor(el);
      if (/cover\s*letter/i.test(label)) {
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
        break;
      }
    }
  }

  return { filled, answers, unfilled, coverLetterAttached };
};
