// Figure 1 teaser: prediction results at each selectable training-data scale.
// Clip idx112, Nano baseline at 300 h / 3k h / 30k h.
// Fill in `video` / `poster` for each scale. A scale
// with `video: null` falls back to `placeholder` and shows a "pending" chip.
const TEASER_SCALING = Object.freeze({
  default: 30000,
  model: 'Nano',
  stops: {
    300: { name: '300', video: 'videos/scaling-idx112-300.mp4', poster: 'img/scaling-idx112-300.jpg' },
    3000: { name: '3k', video: 'videos/scaling-idx112-3k.mp4', poster: 'img/scaling-idx112-3k.jpg' },
    30000: { name: '30k', video: 'videos/scaling-idx112-30k.mp4', poster: 'img/scaling-idx112-30k.jpg' },
  },
  placeholder: { video: 'videos/scaling-idx112-30k.mp4', poster: 'img/scaling-idx112-30k.jpg' },
});

(() => {
  const SCORES = () => (typeof PAPER_PLOTS !== 'undefined' ? PAPER_PLOTS.overview : null);
  function scoreAt(key, hours) {
    const point = SCORES()?.[key]?.points.find(([h]) => h === hours);
    return point ? point[1].toFixed(3) : '–';
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('hero-comparison');
    if (!root) return;
    const prediction = root.querySelector('video[data-comparison-model="ours"]');
    const leader = root.querySelector('video[data-comparison-model="gt"]');
    const frame = prediction?.closest('.comparison-video-frame');
    if (!prediction || !leader || !frame) return;
    const names = root.querySelectorAll('[data-scale-name]');
    const agent = root.querySelector('[data-scale-agent]');
    const object = root.querySelector('[data-scale-object]');
    const playButton = root.querySelector('[data-comparison-play]');
    const pending = document.createElement('span');
    pending.className = 'scale-pending';
    pending.textContent = 'Result pending';
    pending.hidden = true;
    frame.appendChild(pending);

    function apply(hours, initial = false) {
      const stop = TEASER_SCALING.stops[hours];
      if (!stop) return;
      names.forEach(el => { el.textContent = stop.name; });
      if (agent) agent.textContent = scoreAt('overview_agent', hours);
      if (object) object.textContent = scoreAt('overview_object', hours);
      prediction.setAttribute('aria-label', `${TEASER_SCALING.model} prediction trained on ${stop.name} hours`);
      const source = stop.video ? stop : TEASER_SCALING.placeholder;
      pending.hidden = Boolean(stop.video);
      if (prediction.getAttribute('src') === source.video) { if (!initial && !active) playFromStart(); return; }
      const wasPlaying = !leader.paused;
      if (source.poster) prediction.poster = source.poster;
      prediction.src = source.video;
      if (initial) return;
      frame.classList.add('is-swapping');
      prediction.load();
      // Safari may not fire 'loadeddata' for a paused video, so accept any sign of
      // progress and never leave the frame dimmed for more than 1.5 s.
      let settled = false;
      const ready = () => {
        if (settled) return; settled = true;
        events.forEach(type => prediction.removeEventListener(type, ready));
        clearTimeout(fallback);
        frame.classList.remove('is-swapping');
        if (Number.isFinite(leader.currentTime) && Number.isFinite(prediction.duration))
          prediction.currentTime = Math.min(leader.currentTime, Math.max(0, prediction.duration - .08));
        if ((wasPlaying && !leader.paused) || playButton?.dataset.playing === 'true') prediction.play().catch(() => {});
        if (!active) playFromStart();
      };
      const events = ['loadeddata', 'canplay', 'playing', 'error'];
      events.forEach(type => prediction.addEventListener(type, ready));
      const fallback = setTimeout(ready, 1500);
    }

    apply(TEASER_SCALING.default, true);
    document.addEventListener('teaser:scale', event => apply(event.detail.hours));

    // Opening story: the scaling plot unfolds one data point at a time. It
    // stops at 300 h and plays that sample, then continues to 3k, then 30k.
    // Any interaction with the plot or the videos ends the story.
    let run = 0, active = false, driving = false;
    function cancel() {
      if (!active) return;
      active = false; run++;
      window.teaserPlot?.finish();
    }
    function sampleEnded(token) {
      return new Promise(resolve => {
        const limit = Math.max(9, (Number.isFinite(leader.duration) ? leader.duration : 8) + 3) * 1000;
        const done = () => { clearTimeout(timer); leader.removeEventListener('ended', done); resolve(token === run); };
        const timer = setTimeout(done, limit);
        leader.addEventListener('ended', done);
      });
    }
    function playFromStart() {
      [leader, prediction].forEach(video => { if (video.readyState >= 1) video.currentTime = 0; });
      ensurePlaying();
    }
    function ensurePlaying() {
      if (playButton && playButton.dataset.playing !== 'true') { driving = true; playButton.click(); driving = false; }
    }
    async function story(token) {
      const plot = window.teaserPlot;
      const steps = [[300, 500], [3000, 1700], [30000, 1700]];
      for (let i = 0; i < steps.length; i++) {
        const [hours, duration] = steps[i];
        if (token !== run) return;
        plot.select(hours, { fromStory: true });
        await plot.revealTo(hours, duration);
        if (token !== run) return;
        // Each step plays its sample once from the beginning; the comparison holds
        // the last frame (data-loop="once"), and the final 30k sample does not repeat.
        playFromStart();
        if (!(await sampleEnded(token))) return;
      }
      if (token === run) active = false;
    }
    window.teaserStory = {
      start(svg) {
        if (!window.teaserPlot || !(window.SiteMedia?.autoAllowed?.() ?? true)) return false;
        cancel();
        svg.querySelectorAll('.trace-reveal').forEach(rect => rect.setAttribute('width', 0));
        svg._onTrace?.(0);
        active = true;
        story(++run);
        return true;
      },
      cancel,
      isActive: () => active,
    };
    ['click', 'input'].forEach(type => root.addEventListener(type, event => {
      if (event.isTrusted && !driving) cancel();
    }, true));
  });
})();
