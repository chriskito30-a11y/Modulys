import { db, ref, onValue } from "./firebase-config.js";

const FALLBACK_MODULES = {
  improvote: {
    id: "improvote",
    name: "ImproVote",
    url: "https://improvote.modulys.top",
    active: true,
    order: 10,
    description: "Votes en direct pour matchs d’impro, battles et spectacles.",
    badge: "Vote public",
    ctaLabel: "Voir ImproVote",
    icon: "🎭",
    illustrationUrl: "assets/img/module-improvote.svg"
  },
  blindtestmaster: {
    id: "blindtestmaster",
    name: "BlindTestMaster",
    url: "https://blindtestmaster.modulys.top",
    active: true,
    order: 20,
    description: "Blind test live avec équipes, réponses mobile et classement en direct.",
    badge: "Musique",
    ctaLabel: "Voir BlindTestMaster",
    icon: "🎵",
    illustrationUrl: "assets/img/module-blindtest.svg"
  },
  quizmaster: {
    id: "quizmaster",
    name: "QuizMaster",
    url: "https://quizmaster.modulys.top",
    active: true,
    order: 30,
    description: "Quiz interactif avec timer, QR code, écran public et scores automatiques.",
    badge: "Quiz live",
    ctaLabel: "Voir QuizMaster",
    icon: "❓",
    illustrationUrl: "assets/img/module-quizmaster.svg"
  },
  partageo: {
    id: "partageo",
    name: "Partageo",
    url: "https://partageo.modulys.top",
    active: true,
    order: 40,
    description: "Gestion simple des inscriptions et contributions pour repas partagés.",
    badge: "Repas partagé",
    ctaLabel: "Voir Partageo",
    icon: "🍽️",
    illustrationUrl: "assets/img/module-partageo.svg"
  },
  photoboothlive: {
    id: "photoboothlive",
    name: "PhotoboothLive",
    url: "https://photoboothlive.modulys.top",
    active: true,
    order: 50,
    description: "Galerie photo collaborative avec QR code, envoi mobile, modération et mur photo live.",
    badge: "Souvenirs live",
    ctaLabel: "Voir PhotoboothLive",
    icon: "📸",
    illustrationUrl: "assets/img/module-photoboothlive.svg"
  },
  glowup: {
    id: "glowup",
    name: "GlowUp",
    url: "https://glowup.modulys.top",
    active: true,
    order: 60,
    description: "Show lumineux interactif avec les téléphones du public, simplement grâce à un QR code.",
    badge: "Show lumineux",
    ctaLabel: "Voir GlowUp",
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

function moduleIllustration(module = {}) {
  const explicit = module.illustrationUrl || module.imageUrl || module.image || "";
  if (explicit) return explicit;
  return {
    improvote: "assets/img/module-improvote.svg",
    blindtestmaster: "assets/img/module-blindtest.svg",
    quizmaster: "assets/img/module-quizmaster.svg",
    partageo: "assets/img/module-partageo.svg",
    photoboothlive: "assets/img/module-photoboothlive.svg",
    glowup: "assets/img/module-glowup.svg"
  }[module.id] || "assets/img/module-coming-soon.svg";
}

function renderRevealAgain() {
  document.querySelectorAll(".reveal:not(.is-visible)").forEach((node) => {
    node.classList.add("is-visible");
  });
}

function renderHomeModules(modules = {}) {
  const listNode = document.querySelector("#homeModulesList");
  if (!listNode) return;

  const list = Object.values(modules || {})
    .filter((module) => module && module.active !== false)
    .sort((a, b) => Number(a.order || 999) - Number(b.order || 999));

  if (!list.length) {
    listNode.innerHTML = `<article class="module-card reveal is-visible"><div class="module-content"><span class="module-status">Bientôt</span><h3>Modules en préparation</h3><p>Les prochains outils Modulys seront affichés ici dès qu’ils seront disponibles.</p></div></article>`;
    return;
  }

  listNode.innerHTML = list.map((module) => {
    const illustration = moduleIllustration(module);
    const url = module.url || "mes-modules.html";
    const label = module.ctaLabel || `Voir ${module.name || "le module"}`;
    return `<article class="module-card reveal is-visible">
      <div class="module-visual">
        <img src="${escapeHtml(illustration)}" alt="Illustration du module ${escapeHtml(module.name || module.id || "Modulys")}" loading="lazy" onerror="this.src='assets/img/module-coming-soon.svg';">
      </div>
      <div class="module-content">
        <span class="module-status">Disponible</span>
        <h3>${escapeHtml(module.name || module.id || "Module Modulys")}</h3>
        <p>${escapeHtml(module.description || "Un outil Modulys simple et prêt à l’emploi pour vos événements.")}</p>
        <ul class="feature-list">
          <li>Utilisation depuis un navigateur</li>
          <li>Accès mobile pour les participants</li>
          <li>Partage par lien ou QR code</li>
          <li>Interface pensée pour les événements</li>
        </ul>
        <div class="module-actions">
          <a class="btn btn-primary" href="${escapeHtml(url)}">${escapeHtml(label)}</a>
          <a class="btn btn-secondary" href="mes-modules.html">Accéder via mon compte</a>
        </div>
      </div>
    </article>`;
  }).join("");

  renderRevealAgain();
}

renderHomeModules(FALLBACK_MODULES);

onValue(ref(db, "modules"), (snap) => {
  renderHomeModules(snap.val() || FALLBACK_MODULES);
}, () => {
  renderHomeModules(FALLBACK_MODULES);
});
