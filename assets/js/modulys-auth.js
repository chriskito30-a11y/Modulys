import { app, db, ref, set, update, onValue, get } from "./firebase-config.js";
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
  if (module.accessMode === "free_authenticated") return { allowed: true, label: "Gratuit", reason: "free_authenticated" };
  if (isActiveGrant(access?.allModules)) return { allowed: true, label: "Pack complet", reason: "all_modules" };
  if (isActiveGrant(access?.modules?.[module.id])) return { allowed: true, label: "Module actif", reason: "module_grant" };
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
    partageo: "assets/img/module-partageo.svg"
  }[module.id];
  return fallback || "assets/img/module-coming-soon.svg";
}

function renderModules(modules = {}, access = {}, subscription = null) {
  const grid = $("#modulesGrid");
  if (!grid) return;
  const list = Object.values(modules || {})
    .filter((module) => module && module.active !== false)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  if (!list.length) {
    grid.innerHTML = `<article class="account-card"><h3>Aucun module déclaré</h3><p>Importez le JSON de démarrage dans Firebase Realtime Database, chemin <code>/modules</code>.</p></article>`;
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

  onValue(ref(db, "modules"), (snap) => {
    lastModules = snap.val() || FALLBACK_MODULES;
    renderModules(lastModules, lastAccess, lastSubscription);
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
    setStatus("#signupStatus", error.message || "Impossible de créer le compte.", "error");
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
    setStatus("#loginStatus", error.message || "Connexion impossible.", "error");
  }
});

$("#resetPasswordBtn")?.addEventListener("click", async () => {
  const email = $("#loginEmail")?.value?.trim();
  if (!email) return setStatus("#loginStatus", "Indiquez votre email dans le formulaire de connexion.", "error");
  try {
    await sendPasswordResetEmail(auth, email);
    setStatus("#loginStatus", "Email de réinitialisation envoyé.", "success");
  } catch (error) {
    setStatus("#loginStatus", error.message || "Impossible d’envoyer l’email.", "error");
  }
});

$("#logoutBtn")?.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await upsertUserProfile(user); } catch (error) { console.warn("Profil non synchronisé", error); }
  }
  bootDashboard(user);
});
