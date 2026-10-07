(() => {
  const { motion, ready, hydrate, autoAllowed } = SiteMedia;
  const ease = value => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;
  const playIcon = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path class="playback-play-icon" d="M8 5v14l11-7z"/><path class="playback-pause-icon" d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const replayIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M20 10a8 8 0 1 0 0 5M20 4v6h-6"/></svg>';
  const clock = value => `${Math.floor((value || 0) / 60)}:${String(Math.floor((value || 0) % 60)).padStart(2, '0')}`;
  function addVideoTime(player, seek) {
    const element = document.createElement('span');
    element.className = 'video-time';
    element.setAttribute('aria-hidden', 'true');
    element.innerHTML = '<span class="video-current">0:00</span><span class="video-duration"> / <span>0:00</span></span>';
    player.appendChild(element);
    const currentLabel = element.querySelector('.video-current');
    const durationLabel = element.querySelector('.video-duration span');
    return { element, update(current, duration) {
      currentLabel.textContent = clock(current);
      durationLabel.textContent = clock(duration);
      element.title = `${clock(current)} / ${clock(duration)}`;
      seek.style.setProperty('--seek-progress', `${Number(seek.value) / 10}%`);
    } };
  }
  function setPlayState(button, playing, subject) {
    const action = `${playing ? 'Pause' : 'Play'} ${subject}`;
    button.dataset.playing = String(playing);
    button.setAttribute('aria-label', action);
    button.title = action;
  }
  function bindFullscreen(button, target, name = 'Full screen') {
    button.hidden = !document.fullscreenEnabled;
    button.addEventListener('click', async () => {
      try {
        if (document.fullscreenElement === target) await document.exitFullscreen();
        else await target.requestFullscreen();
      } catch { /* Playback remains available if full screen is denied. */ }
    });
    document.addEventListener('fullscreenchange', () => {
      const action = document.fullscreenElement === target ? 'Exit full screen' : name;
      button.setAttribute('aria-label', action); button.title = action;
    });
  }

  function bindSequence() {
    const root = document.querySelector('[data-sequence]');
    if (!root) return;
    const canvas = root.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const controls = root.parentElement.querySelector('.sequence-controls');
    const atlas = root.querySelector('[data-featured-source]');
    const grid = root.querySelector('[data-grid-source]');
    const playButton = controls.querySelector('[data-sequence-play]');
    const counter = root.querySelector('.sequence-counter b');
    const label = root.querySelector('.sequence-counter > span');
    const { featuredSlots: featured, atlasColumns, gridColumns } = TEASER_MEDIA;
    let elapsed = 0, previous = 0, lastSync = 0, frame, playing = false, visible = false, userPaused = false, lastStage = -1;
    let sourcesStarted = false, request, failed = false;
    const status = root.parentElement.querySelector('.sequence-status');
    const showStatus = message => { status.textContent = message; status.hidden = !message; };
    const updatePlayButton = () => setPlayState(playButton, playing, 'sequence');
    root.classList.add('sequence-ready');
    function resize() {
      canvas.width = Math.min(1920, Math.round(root.clientWidth * Math.min(devicePixelRatio || 1, 2)));
      canvas.height = Math.round(canvas.width * 9 / 16);
      draw();
    }
    function rectAt(position, columns) {
      return { x: (position % columns) / columns, y: Math.floor(position / columns) / columns, w: 1 / columns, h: 1 / columns, rotation: 0 };
    }
    function interpolate(a, b, t, shuffle = false) {
      return {
        x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) - (shuffle ? Math.sin(t * Math.PI) * .06 : 0),
        w: mix(a.w, b.w, t), h: mix(a.h, b.h, t),
        rotation: shuffle ? Math.sin(t * Math.PI) * (a.x > b.x ? -.065 : .065) : 0,
      };
    }
    function tile(index, rect, alpha = 1, useAtlas = true) {
      const source = useAtlas && atlas.readyState >= 2 ? atlas : grid;
      if (source.readyState < 2) return;
      const W = canvas.width, H = canvas.height;
      const x = rect.x * W, y = rect.y * H, width = rect.w * W, height = rect.h * H;
      const columns = source === atlas ? atlasColumns : gridColumns;
      const id = source === atlas ? index : featured[index];
      const sw = source.videoWidth / columns, sh = source.videoHeight / columns;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x + width / 2, y + height / 2);
      ctx.rotate(rect.rotation || 0);
      ctx.drawImage(source, (id % columns) * sw, Math.floor(id / columns) * sh,
        sw, sh, -width / 2, -height / 2, width, height);
      ctx.restore();
    }
    function draw() {
      const t = elapsed;
      const stage = t < 3 ? 0 : t < 9 ? 1 : 2;
      if (stage !== lastStage) {
        lastStage = stage;
        counter.textContent = [1, 9, 256][stage];
        label.textContent = stage === 0 ? 'clip' : 'clips';
      }
      if (atlas.readyState < 2) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#202b25'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      // Keep the opening clip in the center while eight full-resolution views
      // enter around it. Every tile comes from the native-resolution atlas.
      const ninePositions = [4, 0, 1, 2, 3, 5, 6, 7, 8];
      if (t < 3) tile(0, { x: 0, y: 0, w: 1, h: 1 });
      else if (t < 4.6) {
        const p = ease((t - 3) / 1.6);
        for (let i = 8; i >= 1; i--) {
          const target = rectAt(ninePositions[i], 3);
          const outside = { ...target, x: .5 + (target.x - .5) * 2, y: .5 + (target.y - .5) * 2 };
          tile(i, interpolate(outside, target, p), p);
        }
        tile(0, interpolate({ x: 0, y: 0, w: 1, h: 1 }, rectAt(4, 3), p));
      } else if (t < 9) featured.forEach((_, i) => tile(i, rectAt(ninePositions[i], 3)));
      else if (t < 11) {
        const p = ease((t - 9) / 2);
        if (grid.readyState >= 2) {
          ctx.globalAlpha = p;
          ctx.drawImage(grid, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1;
        }
        // Rearrange the nine clips only as they move into the full mosaic.
        featured.forEach((id, i) => tile(i, interpolate(rectAt(ninePositions[i], 3), rectAt(id, gridColumns), p, true), 1 - p * .25, p < .9));
      } else if (grid.readyState >= 2) ctx.drawImage(grid, 0, 0, canvas.width, canvas.height);
    }
    function loop(now) {
      if (!playing) return;
      // Begin choreography only when both sources are ready, so buffering never
      // skips the single-video opening or strands the mosaic on a blank frame.
      if (atlas.readyState >= 2 && grid.readyState >= 2) {
        if (previous) elapsed = Math.min(12, elapsed + Math.min((now - previous) / 1000, .1));
        // Both sources loop over the same 32 source frames with matching phases.
        // Correct drift gradually. Repeated seeks in a 4K stream can starve
        // decoding and freeze the choreography, especially just after a loop.
        if (elapsed < 11 && !grid.seeking && now - lastSync > 250) {
          let drift = atlas.currentTime - grid.currentTime;
          const duration = grid.duration;
          if (drift > duration / 2) drift -= duration;
          if (drift < -duration / 2) drift += duration;
          grid.playbackRate = Math.max(.85, Math.min(1.15, 1 + drift * .5));
          lastSync = now;
        }
        if (elapsed >= 11 && !atlas.paused) { atlas.pause(); grid.playbackRate = 1; }
        draw();
      }
      previous = now;
      frame = requestAnimationFrame(loop);
    }
    function fallback() {
      if (failed) return;
      pause(); failed = true;
      root.classList.remove('sequence-ready');
      controls.hidden = true;
      showStatus('The animated sequence could not load. Use the original video controls.');
      const original = root.querySelector('[data-sequence-source]');
      original.preload = 'metadata'; hydrate(original);
    }
    async function start() {
      if (playing || failed) return;
      request?.abort();
      const controller = request = new AbortController();
      playing = true; previous = 0;
      updatePlayButton();
      root.setAttribute('aria-busy', 'true');
      showStatus('Loading sequence…');
      try {
        sourcesStarted = true;
        await Promise.all([ready(atlas, controller.signal), ready(grid, controller.signal)]);
        if (controller.signal.aborted) return;
        if (elapsed < 11 && Math.abs(grid.currentTime - atlas.currentTime) > .04) grid.currentTime = atlas.currentTime;
        draw();
        await Promise.all([...(elapsed < 11 ? [atlas.play()] : []), grid.play()]);
        if (controller.signal.aborted) return;
        showStatus('');
        root.setAttribute('aria-busy', 'false');
        cancelAnimationFrame(frame); frame = requestAnimationFrame(loop);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (error.name === 'NotAllowedError') {
          pause(); userPaused = true;
          showStatus('Select Play to start the sequence.');
        } else fallback();
      }
    }
    function pause() {
      request?.abort();
      playing = false; cancelAnimationFrame(frame); previous = 0;
      atlas.pause(); grid.pause(); updatePlayButton();
      root.setAttribute('aria-busy', 'false');
      showStatus('');
    }
    playButton.addEventListener('click', () => {
      userPaused = playing;
      if (playing) pause(); else start();
    });
    controls.querySelector('[data-sequence-replay]').addEventListener('click', () => {
      pause();
      elapsed = 0; previous = 0; lastStage = -1; userPaused = false;
      draw();
      if (sourcesStarted) { atlas.currentTime = 0; grid.currentTime = 0; }
      start();
    });
    [atlas, grid].forEach(video => { video.addEventListener('loadeddata', draw); video.addEventListener('error', fallback); });
    if ('IntersectionObserver' in window) new IntersectionObserver(entries => {
      visible = entries[0].isIntersecting;
      if (visible && autoAllowed() && !userPaused) start();
      else pause();
    }, { threshold: .25 }).observe(root);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else if (visible && autoAllowed() && !userPaused) start();
    });
    document.addEventListener('site:motion', () => { if (!autoAllowed()) pause(); else if (visible && !userPaused) start(); });
    if ('ResizeObserver' in window) new ResizeObserver(resize).observe(root);
    else window.addEventListener('resize', resize);
    resize();
  }

  function bindComparison(root) {
    const videos = [...root.querySelectorAll('video')], leader = videos[0];
    const playButton = root.querySelector('[data-comparison-play]');
    const seek = root.querySelector('[data-comparison-seek]');
    const status = root.querySelector('.comparison-status');
    let playing = false, frame, request, position = 0;
    const time = addVideoTime(seek.parentElement, seek);
    const panels = root.querySelector('.comparison-panels');
    panels.style.setProperty('--comparison-columns', videos.length);
    bindFullscreen(root.querySelector('[data-comparison-fullscreen]'), panels, 'Full screen comparison');
    const showStatus = message => { status.textContent = message; status.hidden = !message; };
    function update() {
      const duration = Number.isFinite(leader.duration) ? leader.duration : 0;
      const current = duration ? leader.currentTime : 0;
      seek.value = duration ? Math.round(current / duration * 1000) : position * 1000;
      seek.setAttribute('aria-valuetext', `${clock(current)} of ${clock(duration)}`);
      time.update(current, duration);
    }
    function label() {
      setPlayState(playButton, playing, 'comparison videos together');
      videos.forEach(video => {
        video.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} comparison: ${video.dataset.comparisonModel === 'gt' ? 'ground truth' : video.dataset.comparisonModel === 'cosmos' ? 'Cosmos 3' : 'ours'}`);
      });
    }
    function tick() {
      if (!playing) return;
      videos.slice(1).forEach(video => {
        if (!video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - leader.currentTime) > .08) video.currentTime = leader.currentTime;
      });
      update(); frame = requestAnimationFrame(tick);
    }
    function pause() {
      request?.abort(); playing = false;
      cancelAnimationFrame(frame); videos.forEach(video => video.pause());
      root.setAttribute('aria-busy', 'false'); label(); update();
    }
    async function load(controller) {
      root.setAttribute('aria-busy', 'true'); showStatus('Loading comparison…');
      await Promise.all(videos.map(video => ready(video, controller.signal)));
      if (controller.signal.aborted) return;
      videos.forEach(video => { video.playbackRate = 1; });
      root.setAttribute('aria-busy', 'false'); showStatus('');
    }
    function loadFailure(error, controller) {
      if (controller.signal.aborted) return;
      pause();
      showStatus(error.name === 'NotAllowedError' ? 'Select Play together to start the comparison.' : 'Comparison could not load. Select Play together to retry.');
    }
    async function play() {
      if (playing) return;
      request?.abort();
      const controller = request = new AbortController();
      playing = true; label();
      try {
        await load(controller);
        if (controller.signal.aborted) return;
        const target = leader.ended ? 0 : leader.currentTime;
        videos.forEach(video => { video.currentTime = target; });
        await Promise.all(videos.map(video => video.play()));
        if (controller.signal.aborted) return;
        cancelAnimationFrame(frame); frame = requestAnimationFrame(tick);
      } catch (error) { loadFailure(error, controller); }
    }
    const toggle = () => { if (playing) { pause(); showStatus(''); } else play(); };
    playButton.addEventListener('click', toggle);
    videos.forEach(video => {
      video.setAttribute('role', 'button'); video.tabIndex = 0;
      video.addEventListener('click', toggle);
      video.addEventListener('keydown', event => {
        if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggle(); }
      });
      video.addEventListener('error', () => {
        pause(); showStatus('Comparison could not load. Select Play together to retry.');
      });
      video.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(video.duration)) video.currentTime = position * Math.max(0, video.duration - .001);
        update();
      });
      video.addEventListener('seeked', () => { if (!playing) update(); });
    });
    async function seekTo(fraction) {
      pause(); position = Math.max(0, Math.min(1, fraction));
      const controller = request = new AbortController();
      try {
        await load(controller);
        if (controller.signal.aborted) return;
        videos.forEach(video => { video.currentTime = position * Math.max(0, video.duration - .001); });
        update();
      } catch (error) { loadFailure(error, controller); }
    }
    seek.addEventListener('input', () => { const value = Number(seek.value) / 1000; seekTo(value); });
    root.querySelector('[data-comparison-replay]').addEventListener('click', async () => { await seekTo(0); if (!request?.signal.aborted) play(); });
    leader.addEventListener('ended', () => {
      if (!playing) return;
      // Figure 1 plays each sample once and holds its last frame.
      if (root.dataset.loop === 'once') { pause(); return; }
      pause(); position = 0; videos.forEach(v => { v.currentTime = 0; }); play();
    });
    if ('IntersectionObserver' in window) {
      const loader = new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting) return;
        videos.forEach(video => { hydrate(video); video.preload = 'metadata'; });
        loader.disconnect();
      }, { rootMargin: '250px' });
      loader.observe(root);
      new IntersectionObserver(entries => {
        if (!entries[0].isIntersecting && !root.contains(document.fullscreenElement)) pause();
      }, { threshold: 0 }).observe(root);
    }
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    document.addEventListener('site:motion', () => { if (!autoAllowed()) pause(); });
    label(); update();
  }

  function bindVideoControls(video) {
    const player = document.createElement('div');
    player.className = 'inline-video-player';
    video.replaceWith(player);
    player.appendChild(video);
    const controls = document.createElement('div');
    controls.className = 'video-controls playback-cluster';
    controls.setAttribute('role', 'group');
    controls.setAttribute('aria-label', 'Video playback');
    controls.innerHTML = `<button class="playback-button" type="button" data-video-play>${playIcon}</button><button class="playback-button" type="button" data-video-replay aria-label="Replay video" title="Replay video">${replayIcon}</button><button class="playback-button" type="button" data-video-fullscreen aria-label="Full screen" title="Full screen"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M9 4H4v5m11-5h5v5M4 15v5h5m11-5v5h-5"/></svg></button>`;
    const seek = document.createElement('input');
    seek.className = 'video-seek'; seek.type = 'range'; seek.min = 0; seek.max = 1000; seek.value = 0;
    seek.setAttribute('aria-label', 'Seek video');
    const toolbar = document.createElement('div');
    toolbar.className = 'video-toolbar';
    toolbar.append(controls, seek);
    player.appendChild(toolbar);
    const time = addVideoTime(toolbar, seek);
    const play = controls.querySelector('[data-video-play]');
    const fullscreen = controls.querySelector('[data-video-fullscreen]');
    bindFullscreen(fullscreen, player);
    function update() {
      setPlayState(play, !video.paused && !video.ended, 'video');
      seek.disabled = !Number.isFinite(video.duration) || video.duration <= 0;
      seek.value = seek.disabled ? 0 : Math.round(video.currentTime / video.duration * 1000);
      if (!seek.disabled) seek.setAttribute('aria-valuetext', `${video.currentTime.toFixed(1)} of ${video.duration.toFixed(1)} seconds`);
      time.update(video.currentTime, seek.disabled ? 0 : video.duration);
    }
    function fallback() {
      video.controls = true;
      toolbar.hidden = true;
    }
    async function start(replay = false) {
      hydrate(video);
      if (replay) video.currentTime = 0;
      try { await video.play(); } catch { fallback(); }
    }
    const toggle = () => { if (video.paused) start(); else video.pause(); };
    play.addEventListener('click', toggle);
    video.addEventListener('click', () => { if (!video.controls) toggle(); });
    controls.querySelector('[data-video-replay]').addEventListener('click', () => start(true));
    seek.addEventListener('input', () => {
      if (Number.isFinite(video.duration)) video.currentTime = Number(seek.value) / 1000 * video.duration;
    });
    ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'seeked'].forEach(event => video.addEventListener(event, update));
    video.addEventListener('error', fallback);
    video.addEventListener('loadeddata', () => {
      video.controls = false; toolbar.hidden = false; update();
    });
    video.controls = false;
    update();
  }
  document.addEventListener('DOMContentLoaded', () => {
    bindSequence();
    document.querySelectorAll('[data-comparison]').forEach(bindComparison);
    document.querySelectorAll('.video-wrap video[data-autoplay]').forEach(bindVideoControls);
  });
})();
