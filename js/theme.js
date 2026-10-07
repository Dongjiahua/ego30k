// Bind immediately: theme switching must not wait for charts, videos, or fonts.
(() => {
  const root = document.documentElement;
  function apply(theme) {
    const dark = theme === 'dark';
    root.dataset.theme = dark ? 'dark' : 'light';
    const button = document.querySelector('.theme-toggle');
    if (button) {
      const action = dark ? 'Switch to light mode' : 'Switch to dark mode';
      button.setAttribute('aria-label', action);
      button.title = action;
      button.querySelector('span').textContent = dark ? 'Light mode' : 'Dark mode';
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? '#171d1c' : '#f8f7f3';
  }
  // Start each visit in light mode; the toggle applies to the current page.
  apply('light');
  document.addEventListener('click', event => {
    if (!event.target.closest('.theme-toggle')) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    apply(next);
  });
  const ready = () => apply(root.dataset.theme);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready, { once: true });
  else ready();
})();
