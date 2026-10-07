// Dataset totals, presented without arbitrary comparison scales.
(() => {
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('.dataset-totals');
    if (!root) return;
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const cards = [...root.querySelectorAll('.metric-card')];
    const running = new WeakMap();
    const format = el => Number(el.dataset.count).toLocaleString('en-US', {
      minimumFractionDigits: Number(el.dataset.decimals), maximumFractionDigits: Number(el.dataset.decimals),
    });
    function reveal(card) {
      const number = card.querySelector('[data-count]');
      cancelAnimationFrame(running.get(number));
      card.classList.add('metric-visible');
      if (motion.matches) { number.textContent = format(number); return; }
      const target = Number(number.dataset.count), decimals = Number(number.dataset.decimals);
      const start = performance.now();
      const tick = now => {
        const progress = Math.min((now - start) / 1500, 1);
        number.textContent = (target * (1 - (1 - progress) ** 3)).toLocaleString('en-US', {
          minimumFractionDigits: decimals, maximumFractionDigits: decimals,
        });
        if (progress < 1) running.set(number, requestAnimationFrame(tick));
      };
      running.set(number, requestAnimationFrame(tick));
    }
    root.classList.add('metrics-ready');
    if ('IntersectionObserver' in window && !motion.matches) {
      const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) { reveal(entry.target); observer.unobserve(entry.target); }
        });
      }, { threshold: .4 });
      cards.forEach(card => observer.observe(card));
    } else cards.forEach(card => reveal(card));
    root.querySelector('.replay-metrics').addEventListener('click', () => cards.forEach(card => reveal(card)));
    motion.addEventListener('change', () => {
      if (motion.matches) cards.forEach(card => {
        reveal(card);
      });
    });
  });
})();
