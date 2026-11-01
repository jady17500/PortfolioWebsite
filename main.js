// Site behaviour: navigation, contact form, entrance and scroll reveals.
// Content is always visible without JS; motion only enhances it.

const root = document.documentElement;
const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const EASE = "cubic-bezier(0.2, 0.7, 0.2, 1)";
const STAGGER_CAP = 240;

/* ---------- Navigation ---------- */
const nav = document.querySelector("[data-nav]");
const toggle = nav?.querySelector(".nav__toggle");
const menu = nav?.querySelector(".nav__menu");

function setMenu(open, { focusToggle = false } = {}) {
  if (!nav || !toggle) return;
  nav.toggleAttribute("data-open", open);
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  if (!open && focusToggle) toggle.focus();
}

toggle?.addEventListener("click", () => setMenu(!nav.hasAttribute("data-open")));
menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => setMenu(false)));
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && nav?.hasAttribute("data-open")) setMenu(false, { focusToggle: true });
});
document.addEventListener("click", (e) => {
  if (nav?.hasAttribute("data-open") && !nav.contains(e.target)) setMenu(false);
});
window.matchMedia("(min-width: 900px)").addEventListener("change", (e) => {
  if (e.matches) setMenu(false);
});

// Highlight the section currently in view (home page only).
const sectionLinks = [...document.querySelectorAll(".nav__link[data-section]")];
if (sectionLinks.length && "IntersectionObserver" in window) {
  const byId = new Map(sectionLinks.map((a) => [a.dataset.section, a]));
  const sectionObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        sectionLinks.forEach((a) => a.removeAttribute("aria-current"));
        byId.get(entry.target.id)?.setAttribute("aria-current", "true");
      });
    },
    { rootMargin: "-45% 0px -50% 0px" }
  );
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) sectionObserver.observe(section);
  });
}

/* ---------- Contact form (opens the visitor's mail app, as before) ---------- */
const form = document.getElementById("contact-form");
form?.addEventListener("submit", (e) => {
  e.preventDefault();
  if (!form.reportValidity()) return;
  const subject = encodeURIComponent(form.subject.value);
  const body = encodeURIComponent(form.message.value);
  window.location.href = `mailto:marco.piamonte04@gmail.com?subject=${subject}&body=${body}`;
});

/* ---------- Motion ---------- */
const ownedAnimations = new Set();
let revealObserver = null;

function play(el, keyframes, options) {
  if (!el.animate) return null;
  const anim = el.animate(keyframes, { easing: EASE, fill: "backwards", ...options });
  ownedAnimations.add(anim);
  anim.finished.then(() => ownedAnimations.delete(anim), () => ownedAnimations.delete(anim));
  return anim;
}

const fadeUp = (distance) => [
  { opacity: 0, transform: `translateY(${distance}px)` },
  { opacity: 1, transform: "none" },
];
const growX = [{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }];

function stopAllMotion() {
  ownedAnimations.forEach((a) => a.cancel());
  ownedAnimations.clear();
  revealObserver?.disconnect();
  revealObserver = null;
  root.classList.remove("js-hero-pending");
  document.querySelectorAll("[data-reveal-pending]").forEach((el) => el.removeAttribute("data-reveal-pending"));
}

/* Hero entrance: runs once on load when the hero is on screen. */
function heroEntrance() {
  const hero = document.querySelector("[data-bg-hero]");
  const pending = root.classList.contains("js-hero-pending");
  root.classList.remove("js-hero-pending");
  if (!hero || !pending || reducedQuery.matches) return;
  if (hero.getBoundingClientRect().bottom < window.innerHeight * 0.4) return;

  const items = [...hero.querySelectorAll("[data-hero-item]")];
  const step = Math.min(70, STAGGER_CAP / Math.max(items.length - 1, 1));
  items.forEach((el, i) => play(el, fadeUp(16), { duration: 620, delay: Math.round(i * step) }));
  hero.querySelectorAll("[data-hero-rule]").forEach((el, i) =>
    play(el, growX, { duration: 640, delay: i * 80 })
  );
}

/* Scroll reveals: observe individual groups, run once, never reset. */
const revealers = {
  up(el, delay) {
    play(el, fadeUp(14), { duration: 560, delay });
  },
  rule(el, delay) {
    play(el, growX, { duration: 600, delay: delay + 80 });
  },
  photo(el, delay) {
    play(el, [{ opacity: 0, transform: "translateX(24px)" }, { opacity: 1, transform: "none" }], { duration: 640, delay });
    const img = el.querySelector("img");
    if (img) play(img, [{ transform: "scale(1.04)" }, { transform: "none" }], { duration: 760, delay });
  },
  card(el, delay) {
    play(el, fadeUp(24), { duration: 640, delay });
    const img = el.querySelector(".project__media img");
    if (img) play(img, [{ transform: "scale(1.04)" }, { transform: "none" }], { duration: 760, delay });
  },
};

function initReveals() {
  if (reducedQuery.matches || !("IntersectionObserver" in window)) return;

  // Only hide what is still below the viewport; anything already visible stays visible.
  const targets = [...document.querySelectorAll("[data-reveal]")].filter(
    (el) => el.getBoundingClientRect().top > window.innerHeight
  );
  if (!targets.length) return;

  const reveal = (elements, animate = true) => {
    elements
      .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1))
      .forEach((el, i) => {
        if (!el.hasAttribute("data-reveal-pending")) return;
        revealObserver?.unobserve(el);
        el.removeAttribute("data-reveal-pending");
        if (animate) (revealers[el.dataset.reveal] || revealers.up)(el, Math.min(i * 80, STAGGER_CAP));
      });
  };

  revealObserver = new IntersectionObserver(
    (entries) => reveal(entries.filter((e) => e.isIntersecting).map((e) => e.target)),
    { threshold: 0, rootMargin: "0px 0px 10% 0px" }
  );

  targets.forEach((el) => {
    el.setAttribute("data-reveal-pending", "");
    revealObserver.observe(el);
  });

  // Safety sweep for very fast scrolling/resizing: anything now on screen reveals,
  // anything that was skipped past entirely just becomes visible (no backlog).
  let sweepQueued = false;
  const sweep = () => {
    sweepQueued = false;
    const pending = [...document.querySelectorAll("[data-reveal-pending]")];
    if (!pending.length) {
      window.removeEventListener("scroll", queueSweep);
      window.removeEventListener("resize", queueSweep);
      return;
    }
    const vh = window.innerHeight;
    const onScreen = [], passed = [];
    pending.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.bottom <= 0) passed.push(el);
      else if (r.top < vh) onScreen.push(el);
    });
    reveal(passed, false);
    reveal(onScreen);
  };
  const queueSweep = () => {
    if (!sweepQueued) { sweepQueued = true; requestAnimationFrame(sweep); }
  };
  window.addEventListener("scroll", queueSweep, { passive: true });
  window.addEventListener("resize", queueSweep);
}

// Hero waits for the web fonts (max 600ms) so lines don't reflow mid-animation.
const fontsReady = document.fonts?.ready ?? Promise.resolve();
Promise.race([fontsReady, new Promise((r) => setTimeout(r, 600))]).then(heroEntrance);

// Reveals start after load so restored scroll positions are respected.
if (document.readyState === "complete") requestAnimationFrame(initReveals);
else window.addEventListener("load", () => requestAnimationFrame(initReveals), { once: true });

reducedQuery.addEventListener("change", (e) => {
  if (e.matches) stopAllMotion();
});
