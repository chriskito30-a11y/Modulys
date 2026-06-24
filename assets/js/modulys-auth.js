import { app, db, ref, set, update, onValue, get, query, orderByChild, equalTo } from "./firebase-config.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

const auth = getAuth(app);
const $ = (selector, root = document) => root.querySelector(selector);

const FALLBACK_MODULES = {
  improvote: {
    id: "improvote",
    name: "ImproVote",
    shortName: "ImproVote",
    url: "https://improvote.modulys.top",
    active: true,
    order: 10,
    accessMode: "free_authenticated",
    description: "Votes en direct pour matchs d’impro, battles et spectacles.",
    badge: "Vote public",
    ctaLabel: "Ouvrir ImproVote",
    icon: "🎭",
    illustrationUrl: "assets/img/module-improvote.svg"
  },
  blindtestmaster: {
    id: "blindtestmaster",
    name: "BlindTestMaster",
    shortName: "BlindTest",
    url: "https://blindtestmaster.modulys.top",
    active: true,
    order: 20,
    accessMode: "free_authenticated",
    description: "Blind test live avec équipes, réponses mobile et classement.",
    badge: "Musique",
    ctaLabel: "Ouvrir BlindTestMaster",
    icon: "🎵",
    illustrationUrl: "assets/img/module-blindtest.svg"
  },
  quizmaster: {
    id: "quizmaster",
    name: "QuizMaster",
    shortName: "Quiz",
    url: "https://quizmaster.modulys.top",
    active: true,
    order: 30,
    accessMode: "free_authenticated",
    description: "Quiz interactif avec timer, QR code, écran public et scores.",
    badge: "Quiz live",
    ctaLabel: "Ouvrir QuizMaster",
    icon: "❓",
    illustrationUrl: "assets/img/module-quizmaster.svg"
  },
  partageo: {
    id: "partageo",
    name: "Partageo",
    shortName: "Partageo",
    url: "https://partageo.modulys.top",
    active: true,
    order: 40,
    accessMode: "free_authenticated",
    description: "Gestion simple des inscriptions et contributions pour repas partagés.",
    badge: "Repas partagé",
    ctaLabel: "Ouvrir Partageo",
    icon: "🍽️",
    illustrationUrl: "assets/img/module-partageo.svg"
  },
  photoboothlive: {
    id: "photoboothlive",
    name: "PhotoboothLive",
    shortName: "Photobooth",
    url: "https://photoboothlive.modulys.top",
    active: true,
    order: 50,
    accessMode: "free_authenticated",
    description: "Galerie photo collaborative avec QR code, envoi mobile, modération et mur photo live.",
    badge: "Souvenirs live",
    ctaLabel: "Ouvrir PhotoboothLive",
    icon: "📸",
    illustrationUrl: "assets/img/module-photoboothlive.svg"
  },
  glowup: {
    id: "glowup",
    name: "GlowUp",
    shortName: "GlowUp",
    url: "https://glowup.modulys.top",
    active: true,
    order: 60,
    accessMode: "free_authenticated",
    description: "Show lumineux interactif avec les téléphones du public, simplement grâce à un QR code.",
    badge: "Show lumineux",
    ctaLabel: "Ouvrir GlowUp",
    icon: "✨",
    illustrationUrl: "assets/img/module-glowup.svg"
  }
};

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeTimestamp(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function isActiveGrant(grant) {
  if (!grant) return false;
  if (grant === true) return true;
  const status = String(grant.status || "active").toLowerCase();
  if (!["active", "trial", "lifetime"].includes(status)) return false;
  if (grant.lifetime === true || status === "lifetime") return true;
  const expiresAt = normalizeTimestamp(grant.expiresAt);
  return !expiresAt || expiresAt > Date.now();
}

function canAccessModule(module, access = {}, subscription = null) {
  if (!module?.active) return { allowed: false, label: "Indisponible", reason: "module_inactive" };
  if (module.accessMode === "public") return { allowed: true, label: "Accès public", reason: "public" };
  if (module.accessMode === "free_authenticated") return { allowed: true, label: "Offre Découverte", reason: "free_authenticated" };
  if (isActiveGrant(access?.allModules)) return { allowed: true, label: "Pack complet", reason: "all_modules" };
  if (isActiveGrant(access?.modules?.[module.id])) return { allowed: true, label: "Accès activé", reason: "module_grant" };
  if (isActiveGrant(subscription) && (subscription.scope === "allModules" || subscription.modules?.[module.id] === true)) {
    return { allowed: true, label: "Abonnement actif", reason: "subscription" };
  }
  return { allowed: false, label: "Non inclus", reason: "no_grant" };
}


async function ensureDefaultFreeAccess(user) {
  const accessRef = ref(db, `userAccess/${user.uid}`);
  const snap = await get(accessRef);
  if (snap.exists()) return;
  const now = Date.now();
  await set(accessRef, {
    planId: "free",
    status: "active",
    allModules: false,
    source: "signup",
    createdAt: now,
    updatedAt: now
  });
}

async function upsertUserProfile(user, displayName = "") {
  const userRef = ref(db, `users/${user.uid}`);
  const snap = await get(userRef);
  const now = Date.now();
  const baseProfile = {
    uid: user.uid,
    email: user.email || "",
    displayName: displayName || user.displayName || "",
    provider: "password",
    accountType: "free",
    planId: "free",
    updatedAt: now
  };
  if (snap.exists()) {
    await update(userRef, baseProfile);
    await ensureDefaultFreeAccess(user);
    return;
  }
  await set(userRef, { ...baseProfile, createdAt: now });
  await ensureDefaultFreeAccess(user);
}


function friendlyAuthMessage(error, fallback = "Une erreur est survenue, veuillez réessayer.") {
  const code = String(error?.code || "").toLowerCase();
  const raw = String(error?.message || "");
  if (code.includes("email-already-in-use")) return "Un compte existe déjà avec cet email.";
  if (code.includes("invalid-email")) return "L’adresse email semble invalide.";
  if (code.includes("weak-password")) return "Choisissez un mot de passe plus solide.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) return "Email ou mot de passe incorrect.";
  if (code.includes("too-many-requests")) return "Trop de tentatives. Réessayez un peu plus tard.";
  const technical = /firebase|permission_denied|permission denied|internal|bad request|missing or insufficient|cannot read properties|undefined|null/i.test(raw);
  return technical ? fallback : (raw || fallback);
}

function setStatus(selector, message = "", type = "") {
  const node = $(selector);
  if (!node) return;
  node.textContent = message;
  node.className = `auth-status ${type}`.trim();
}

function moduleIllustration(module = {}) {
  const explicit = module.illustrationUrl || module.imageUrl || module.image || "";
  if (explicit) return explicit;
  const fallback = {
    improvote: "assets/img/module-improvote.svg",
    blindtestmaster: "assets/img/module-blindtest.svg",
    quizmaster: "assets/img/module-quizmaster.svg",
    partageo: "assets/img/module-partageo.svg",
    photoboothlive: "assets/img/module-photoboothlive.svg",
    glowup: "assets/img/module-glowup.svg"
  }[module.id];
  return fallback || "assets/img/module-coming-soon.svg";
}


const MODULE_EVENT_SOURCES = [
  { moduleId: "improvote", path: "rooms", type: "room", queryOwner: false, idParam: "room" },
  { moduleId: "blindtestmaster", path: "blindRooms", type: "room", queryOwner: false, idParam: "room" },
  { moduleId: "quizmaster", path: "quizRooms", type: "room", queryOwner: false, idParam: "room" },
  { moduleId: "partageo", path: "events", type: "event", queryOwner: false, idParam: "event" },
  { moduleId: "photoboothlive", path: "moduleData/photoboothlive/sessions", type: "session", queryOwner: true, idParam: "session" },
  { moduleId: "glowup", path: "moduleData/glowup/sessions", type: "session", queryOwner: true, idParam: "session" }
];

function normalizeEventRecord(source, id, raw = {}) {
  const moduleId = raw.moduleId || source.moduleId;
  const title = raw.title || raw.config?.title || raw.meta?.title || raw.id || id;
  const subtitle = raw.subtitle || raw.config?.subtitle || raw.description || raw.meta?.subtitle || "";
  const createdAt = Number(raw.createdAt || raw.private?.createdAt || raw.meta?.createdAt || 0);
  const updatedAt = Number(raw.updatedAt || raw.config?.updatedAt || raw.meta?.updatedAt || createdAt || 0);
  const eventDate = raw.eventDate || raw.config?.eventDate || raw.public?.eventDate || "";
  const expiresAt = Number(raw.expiresAt || raw.config?.expiresAt || raw.public?.expiresAt || 0);
  return { id, moduleId, title, subtitle, createdAt, updatedAt, eventDate, expiresAt, raw, source };
}

function eventUrls(event, module = {}) {
  const base = String(module.url || "").replace(/\/$/, "");
  const id = encodeURIComponent(event.id);
  if (!base) return [];
  if (event.moduleId === "improvote") return [
    ["Gérer", `${base}/settings.html?room=${id}`],
    ["Vote public", `${base}/vote.html?room=${id}`],
    ["Grand écran", `${base}/screen.html?room=${id}`]
  ];
  if (event.moduleId === "blindtestmaster") return [
    ["Gérer", `${base}/settings.html?room=${id}`],
    ["Joueurs", `${base}/vote.html?room=${id}`],
    ["Grand écran", `${base}/screen.html?room=${id}`]
  ];
  if (event.moduleId === "quizmaster") return [
    ["Gérer", `${base}/admin.html?room=${id}`],
    ["Participants", `${base}/player.html?room=${id}`],
    ["Grand écran", `${base}/screen.html?room=${id}`]
  ];
  if (event.moduleId === "partageo") return [
    ["Gérer", `${base}/admin.html?event=${id}`],
    ["Lien public", `${base}/index.html?event=${id}`]
  ];
  if (event.moduleId === "photoboothlive") return [
    ["Gérer", `${base}/session.html?session=${id}`],
    ["Invités", `${base}/join.html?session=${id}`],
    ["Mur photo", `${base}/wall.html?session=${id}`]
  ];
  if (event.moduleId === "glowup") return [
    ["Gérer", `${base}/session.html?session=${id}`],
    ["Participants", `${base}/join.html?session=${id}`]
  ];
  return [["Ouvrir", base]];
}

function formatDateLabel(event) {
  const value = event.eventDate || event.updatedAt || event.createdAt;
  if (!value) return "Date non définie";
  const date = typeof value === "number" ? new Date(value) : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

function eventStatusLabel(event) {
  if (event.expiresAt && event.expiresAt < Date.now()) return "Expiré";
  if (event.raw?.status === "closed") return "Fermé";
  if (event.raw?.status === "open") return "Ouvert";
  return "Disponible";
}

async function fetchModuleEvents(user, source) {
  const baseRef = ref(db, source.path);
  const snap = source.queryOwner
    ? await get(query(baseRef, orderByChild("ownerUid"), equalTo(user.uid)))
    : await get(baseRef);
  const rows = snap.val() || {};
  return Object.entries(rows)
    .filter(([, raw]) => raw && (raw.ownerUid === user.uid || raw.meta?.ownerUid === user.uid))
    .map(([id, raw]) => normalizeEventRecord(source, id, raw));
}

async function loadRecentEvents(user, modules = FALLBACK_MODULES) {
  const grid = $("#eventsGrid");
  if (!grid) return;
  grid.innerHTML = `<article class="account-card"><p>Recherche de vos événements…</p></article>`;
  try {
    const results = await Promise.allSettled(MODULE_EVENT_SOURCES.map((source) => fetchModuleEvents(user, source)));
    const events = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
      .sort((a, b) => Number(b.updatedAt || b.createdAt || 0) - Number(a.updatedAt || a.createdAt || 0))
      .slice(0, 18);
    renderRecentEvents(events, modules);
  } catch (error) {
    grid.innerHTML = `<article class="account-card"><h3>Événements indisponibles</h3><p>Impossible de charger vos animations pour le moment.</p></article>`;
  }
}

function renderRecentEvents(events = [], modules = FALLBACK_MODULES) {
  const grid = $("#eventsGrid");
  if (!grid) return;
  if (!events.length) {
    grid.innerHTML = `<article class="account-card"><h3>Aucun événement créé</h3><p>Créez votre première animation depuis un module Modulys. Elle apparaîtra ensuite ici.</p></article>`;
    return;
  }
  grid.innerHTML = events.map((event) => {
    const module = modules[event.moduleId] || FALLBACK_MODULES[event.moduleId] || { name: event.moduleId, badge: "Module", icon: "🧩" };
    const links = eventUrls(event, module);
    return `<article class="event-account-card">
      <div class="event-account-top">
        <span class="module-badge">${escapeHtml(module.icon || "🧩")} ${escapeHtml(module.name || event.moduleId)}</span>
        <span class="access-pill">${escapeHtml(eventStatusLabel(event))}</span>
      </div>
      <h3>${escapeHtml(event.title || event.id)}</h3>
      <p>${escapeHtml(event.subtitle || "Animation Modulys")}</p>
      <p class="event-meta">${escapeHtml(formatDateLabel(event))} · identifiant : <strong>${escapeHtml(event.id)}</strong></p>
      <div class="event-account-actions">
        ${links.map(([label, url], index) => `<a class="btn ${index === 0 ? "btn-primary" : "btn-secondary"}" href="${escapeHtml(url)}">${escapeHtml(label)}</a>`).join("")}
      </div>
    </article>`;
  }).join("");
}

function renderModules(modules = {}, access = {}, subscription = null) {
  const grid = $("#modulesGrid");
  if (!grid) return;
  const list = Object.values(modules || {})
    .filter((module) => module && module.active !== false)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  if (!list.length) {
    grid.innerHTML = `<article class="account-card"><h3>Aucun module disponible</h3><p>Les modules apparaîtront ici dès qu’ils seront disponibles pour votre compte.</p></article>`;
    return;
  }

  grid.innerHTML = list.map((module) => {
    const state = canAccessModule(module, access, subscription);
    const url = module.url || "#";
    const disabled = !state.allowed || !url || url === "#";
    const illustration = moduleIllustration(module);
    return `<article class="module-account-card ${disabled ? "is-locked" : ""}">
      <div class="module-account-visual" aria-hidden="true">
        <img src="${escapeHtml(illustration)}" alt="" loading="lazy" onerror="this.closest('.module-account-visual').classList.add('is-fallback');this.remove();">
        <span class="module-icon module-icon-fallback">${escapeHtml(module.icon || "🧩")}</span>
      </div>
      <div class="module-account-top">
        <span class="module-badge">${escapeHtml(module.badge || "Module")}</span>
        <span class="access-pill">${escapeHtml(state.label)}</span>
      </div>
      <h3>${escapeHtml(module.name || module.id)}</h3>
      <p>${escapeHtml(module.description || "Module Modulys")}</p>
      <div class="module-account-actions">
        ${disabled
          ? `<button class="btn btn-secondary" type="button" disabled>Accès non disponible</button>`
          : `<a class="btn btn-primary" href="${escapeHtml(url)}">${escapeHtml(module.ctaLabel || "Ouvrir le module")}</a>`}
      </div>
    </article>`;
  }).join("");
}

function bootDashboard(user) {
  const authPanel = $("#authPanel");
  const dashboard = $("#dashboardPanel");
  if (authPanel) authPanel.hidden = Boolean(user);
  if (dashboard) dashboard.hidden = !user;

  if (!user) return;
  $("#userEmail").textContent = user.email || "Compte connecté";
  $("#userName").textContent = user.displayName || "Utilisateur Modulys";

  let lastModules = FALLBACK_MODULES;
  let lastAccess = {};
  let lastSubscription = null;
  renderModules(lastModules, lastAccess, lastSubscription);
  loadRecentEvents(user, lastModules);
  $("#refreshEventsBtn")?.addEventListener("click", () => loadRecentEvents(user, lastModules));

  onValue(ref(db, "modules"), (snap) => {
    lastModules = snap.val() || FALLBACK_MODULES;
    renderModules(lastModules, lastAccess, lastSubscription);
    loadRecentEvents(user, lastModules);
  }, () => renderModules(lastModules, lastAccess, lastSubscription));

  onValue(ref(db, `userAccess/${user.uid}`), (snap) => {
    lastAccess = snap.val() || {};
    renderModules(lastModules, lastAccess, lastSubscription);
  });

  onValue(ref(db, `subscriptions/${user.uid}`), (snap) => {
    lastSubscription = snap.val() || null;
    renderModules(lastModules, lastAccess, lastSubscription);
  });
}

$("#signupForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const displayName = form.displayName.value.trim();
  const email = form.email.value.trim();
  const password = form.password.value;
  setStatus("#signupStatus", "Création du compte…");
  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(credential.user, { displayName });
    await upsertUserProfile(credential.user, displayName);
    form.reset();
    setStatus("#signupStatus", "Compte créé. Vos modules sont prêts.", "success");
  } catch (error) {
    setStatus("#signupStatus", friendlyAuthMessage(error, "Impossible de créer le compte."), "error");
  }
});

$("#loginForm")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  setStatus("#loginStatus", "Connexion…");
  try {
    const credential = await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
    await upsertUserProfile(credential.user);
    form.reset();
    setStatus("#loginStatus", "Connexion réussie.", "success");
  } catch (error) {
    setStatus("#loginStatus", friendlyAuthMessage(error, "Connexion impossible."), "error");
  }
});

$("#resetPasswordBtn")?.addEventListener("click", async () => {
  const email = $("#loginEmail")?.value?.trim();
  if (!email) return setStatus("#loginStatus", "Indiquez votre email dans le formulaire de connexion.", "error");
  try {
    await sendPasswordResetEmail(auth, email);
    setStatus("#loginStatus", "Email de réinitialisation envoyé.", "success");
  } catch (error) {
    setStatus("#loginStatus", friendlyAuthMessage(error, "Impossible d’envoyer l’email."), "error");
  }
});

$("#logoutBtn")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await upsertUserProfile(user); } catch (error) { console.warn("Profil non synchronisé", error); }
  }
  bootDashboard(user);
});
