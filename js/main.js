(() => {
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function bindNavigation() {
    const menu = document.querySelector('.menu-toggle');
    const nav = document.getElementById('site-nav');
    const links = [...nav.querySelectorAll('a')];
    const sections = [...document.querySelectorAll('section[id]')];
    const progress = document.querySelector('.reading-progress');
    const closeMenu = () => {
      menu.setAttribute('aria-expanded', 'false');
      nav.classList.remove('open');
    };
    menu.addEventListener('click', () => {
      const open = menu.getAttribute('aria-expanded') !== 'true';
      menu.setAttribute('aria-expanded', String(open));
      nav.classList.toggle('open', open);
    });
    links.forEach(link => link.addEventListener('click', closeMenu));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && nav.classList.contains('open')) {
        closeMenu();
        menu.focus();
      }
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('.site-header')) closeMenu();
    });
    window.matchMedia('(min-width: 761px)').addEventListener('change', event => {
      if (event.matches) closeMenu();
    });
    let pending = false;
    function update() {
      const top = window.scrollY + 130;
      let current = '';
      sections.forEach(section => { if (section.offsetTop <= top) current = section.id; });
      links.forEach(link => {
        const active = link.hash === `#${current}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
      const total = document.documentElement.scrollHeight - window.innerHeight;
      progress.style.transform = `scaleX(${total > 0 ? Math.min(1, window.scrollY / total) : 0})`;
      pending = false;
    }
    const schedule = () => {
      if (!pending) { pending = true; requestAnimationFrame(update); }
    };
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule, { passive: true });
    update();
  }

  function bindTabs(container) {
    const tabs = [...container.querySelectorAll('[data-tab]')];
    const targets = [...document.querySelectorAll(container.dataset.tabTargets)];
    container.setAttribute('role', 'group');
    container.setAttribute('aria-label', 'Filter failure examples');
    const select = tab => {
      tabs.forEach(other => {
        const active = other === tab;
        other.classList.toggle('active', active);
        other.setAttribute('aria-pressed', String(active));
      });
      targets.forEach(target => {
        target.hidden = target.dataset.key !== tab.dataset.tab;
        if (target.hidden) target.querySelectorAll('video').forEach(video => video.pause());
      });
    };
    tabs.forEach((tab, index) => {
      const count = targets.filter(target => target.dataset.key === tab.dataset.tab).length;
      const badge = document.createElement('span');
      badge.className = 'tab-count';
      badge.textContent = String(count).padStart(2, '0');
      badge.setAttribute('aria-hidden', 'true');
      tab.appendChild(badge);
      tab.addEventListener('click', () => select(tab));
      tab.addEventListener('keydown', event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 :
          (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        select(tabs[next]);
        tabs[next].focus();
      });
    });
    targets.forEach(target => { target.style.removeProperty('display'); });
    select(tabs.find(tab => tab.classList.contains('active')) || tabs[0]);
  }

  function bindVideos() {
    const videos = [...document.querySelectorAll('video[data-autoplay]:not([data-sequence-source])')];
    const visible = new Set();
    const pausedByUser = new WeakSet();
    const pausedAutomatically = new WeakSet();
    const pause = video => {
      if (!video.paused) { pausedAutomatically.add(video); video.pause(); }
    };
    const play = video => {
      if (SiteMedia.autoAllowed() && !pausedByUser.has(video)) { SiteMedia.hydrate(video); video.play().catch(() => {}); }
    };
    videos.forEach(video => {
      const warning = document.createElement('div');
      warning.className = 'media-status'; warning.hidden = true;
      warning.setAttribute('role', 'status');
      const retry = document.createElement('button');
      retry.type = 'button'; retry.textContent = 'Retry video';
      warning.append(document.createTextNode('Video could not load. '), retry);
      video.parentElement.appendChild(warning);
      video.addEventListener('error', () => { warning.hidden = false; });
      video.addEventListener('loadeddata', () => { warning.hidden = true; });
      retry.addEventListener('click', () => { SiteMedia.hydrate(video); video.load(); video.play().catch(() => {}); });
      video.addEventListener('pause', () => {
        if (pausedAutomatically.has(video)) pausedAutomatically.delete(video);
        else if (visible.has(video) && !video.closest('[hidden]')) pausedByUser.add(video);
      });
      video.addEventListener('play', () => pausedByUser.delete(video));
    });
    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && !entry.target.closest('[hidden]')) {
            visible.add(entry.target);
            SiteMedia.hydrate(entry.target);
            play(entry.target);
          } else {
            visible.delete(entry.target);
            pause(entry.target);
          }
        });
      }, { threshold: 0.2 });
      videos.forEach(video => observer.observe(video));
    }
    document.addEventListener('visibilitychange', () => {
      videos.forEach(video => {
        if (document.hidden) pause(video);
        else if (visible.has(video)) play(video);
      });
    });
    document.addEventListener('site:motion', () => videos.forEach(video => {
      if (!SiteMedia.autoAllowed()) pause(video);
      else if (visible.has(video)) play(video);
    }));
  }

  function bindCitation() {
    const button = document.querySelector('.copy-bib');
    const citation = document.getElementById('citation');
    const status = document.querySelector('.citation-status');
    let reset;
    button.addEventListener('click', async () => {
      const value = citation.textContent.trim();
      try {
        if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
        else {
          const field = document.createElement('textarea');
          field.value = value;
          field.style.cssText = 'position:fixed;left:-9999px;top:0';
          document.body.appendChild(field);
          field.select();
          let copied;
          try { copied = document.execCommand('copy'); } finally { field.remove(); button.focus(); }
          if (!copied) throw new Error('Clipboard unavailable');
        }
        button.textContent = 'Copied ✓';
        status.textContent = 'Citation copied to clipboard.';
        clearTimeout(reset);
        reset = setTimeout(() => { button.textContent = 'Copy citation ↗'; status.textContent = ''; }, 2500);
      } catch {
        const range = document.createRange();
        range.selectNodeContents(citation);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        status.textContent = 'Citation selected. Press Ctrl+C or ⌘C to copy.';
      }
    });
  }

  window.addEventListener('DOMContentLoaded', () => {
    bindNavigation();
    document.querySelectorAll('[data-tabs]').forEach(bindTabs);
    bindVideos();
    bindCitation();
  });
})();
