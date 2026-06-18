(function () {
  const body = document.body;
  const toggle = document.querySelector('[data-menu-toggle]');
  const mobileMenu = document.querySelector('[data-mobile-menu]');

  if (toggle && mobileMenu) {
    toggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('is-open');
      body.classList.toggle('menu-open', isOpen);
      toggle.setAttribute('aria-expanded', String(isOpen));
    });

    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('is-open');
        body.classList.remove('menu-open');
        toggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  const yearNode = document.querySelector('[data-year]');
  if (yearNode) yearNode.textContent = new Date().getFullYear();

  const revealNodes = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealNodes.forEach((node) => observer.observe(node));
  } else {
    revealNodes.forEach((node) => node.classList.add('is-visible'));
  }

  const contactForm = document.querySelector('[data-contact-form]');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const data = new FormData(contactForm);
      const subject = encodeURIComponent('Demande Modulys - ' + (data.get('need') || 'Contact'));
      const body = encodeURIComponent(
        'Nom : ' + (data.get('name') || '') + '\n' +
        'Email : ' + (data.get('email') || '') + '\n' +
        'Besoin : ' + (data.get('need') || '') + '\n\n' +
        'Message :\n' + (data.get('message') || '')
      );
      window.location.href = 'mailto:contact@modulys.top?subject=' + subject + '&body=' + body;
    });
  }
})();
