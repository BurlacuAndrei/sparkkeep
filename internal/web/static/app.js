// sparkkeep dashboard: vanilla JS, fetch + DOM. One render(state) and event
// delegation — no framework. ponytail: single file app.js, DOM-built cards; a
// framework only if the dashboard grows past one route.
(function () {
  const state = { horizon: '', status: '', tag: '', q: '', tags: [] };

  const $ = (sel) => document.querySelector(sel);

  async function api(path, opts) {
    const res = await fetch(path, opts);
    const body = await res.json();
    if (!body.ok) throw new Error(body.error || 'HTTP ' + res.status);
    return body;
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  let flashTimer;
  function flash(msg) {
    const f = $('#flash');
    f.textContent = msg;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { f.textContent = ''; }, 3000);
  }

  function cardEl(c) {
    const el = document.createElement('article');
    el.className = 'card';
    el.dataset.id = c.id;
    const failed = c.title === 'Analysis failed';
    el.innerHTML =
      '<div class="card-top">' +
        '<span class="horizon ' + esc(c.horizon) + '">' + esc(c.horizon) + '</span>' +
        '<span class="status">' + esc(c.status) + '</span>' +
      '</div>' +
      '<h3>' + esc(c.title) + '</h3>' +
      '<p>' + esc(c.summary) + '</p>' +
      '<div class="card-tags">' + (c.tags || []).map((t) => '<span class="tag">#' + esc(t) + '</span>').join('') + '</div>' +
      '<div class="acts">' +
        '<button data-act="doing">\u2192 Doing</button>' +
        '<button data-act="done">\u2192 Done</button>' +
        '<button data-act="shelve">Shelve</button>' +
        '<button data-act="research">Research</button>' +
        (failed ? '<button data-act="retry">Retry</button>' : '') +
      '</div>';
    return el;
  }

  function renderGrid(grid, cards) {
    grid.textContent = '';
    if (!cards || !cards.length) { grid.textContent = 'No cards.'; return; }
    cards.forEach((c) => grid.appendChild(cardEl(c)));
  }

  function renderRail() {
    const box = $('#rail-tags');
    box.querySelectorAll('.chip').forEach((el) => el.remove());
    state.tags.forEach((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (state.tag === t.name ? ' active' : '');
      b.dataset.tag = t.name;
      b.textContent = '#' + t.name + ' (' + t.count + ')';
      box.appendChild(b);
    });
  }

  async function loadTags() {
    try {
      const d = await api('/api/v1/tags');
      state.tags = d.tags || [];
      renderRail();
    } catch (e) { flash(e.message); }
  }

  async function loadMain() {
    const p = new URLSearchParams();
    if (state.horizon) p.set('horizon', state.horizon);
    if (state.status) p.set('status', state.status);
    if (state.tag) p.set('tag', state.tag);
    if (state.q) p.set('q', state.q);
    try {
      const d = await api('/api/v1/cards?' + p.toString());
      renderGrid($('#main-grid'), d.cards || []);
    } catch (e) { flash(e.message); }
  }

  async function loadBoards() {
    try {
      const [action, bucket] = await Promise.all([
        api('/api/v1/cards?horizon=short-term'),
        api('/api/v1/cards?horizon=lifetime'),
      ]);
      renderGrid($('#action-board'), action.cards || []);
      renderGrid($('#bucket-board'), bucket.cards || []);
    } catch (e) { flash(e.message); }
  }

  async function refresh() {
    await Promise.all([loadTags(), loadMain(), loadBoards()]);
  }

  // --- events ----------------------------------------------------------------

  document.addEventListener('click', async (e) => {
    const actBtn = e.target.closest('button[data-act]');
    if (actBtn) {
      const id = Number(actBtn.closest('[data-id]').dataset.id);
      const act = actBtn.dataset.act;
      try {
        if (act === 'research') {
          await api('/api/v1/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card_id: id }) });
          flash('Research accepted for card ' + id);
        } else if (act === 'retry') {
          await api('/api/v1/cards/' + id + '/retry', { method: 'POST' });
          flash('Retried card ' + id);
        } else {
          await api('/api/v1/cards/' + id, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: act }) });
        }
        refresh();
      } catch (err) { flash(err.message); }
      return;
    }
    if (e.target.closest('#new-card-btn')) {
      $('#new-card-form').classList.toggle('hidden');
      return;
    }
    if (e.target.closest('#cancel-new')) {
      $('#new-card-form').classList.add('hidden');
      return;
    }
    const chip = e.target.closest('.chip');
    if (chip) {
      state.tag = state.tag === chip.dataset.tag ? '' : chip.dataset.tag;
      renderRail();
      loadMain();
    }
  });

  $('#q').addEventListener('input', (e) => { state.q = e.target.value.trim(); loadMain(); });
  $('#horizon').addEventListener('change', (e) => { state.horizon = e.target.value === 'all' ? '' : e.target.value; loadMain(); });
  $('#status').addEventListener('change', (e) => { state.status = e.target.value === 'all' ? '' : e.target.value; loadMain(); });

  $('#research-btn').addEventListener('click', async () => {
    const id = $('#research-id').value;
    $('#research-id').value = '';
    if (!id) return;
    try {
      await api('/api/v1/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ card_id: Number(id) }) });
      flash('Research accepted for card ' + id);
    } catch (err) { flash(err.message); }
  });

  $('#new-card-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const title = f.title.value.trim();
    if (!title) return;
    const body = {
      title: title,
      summary: f.summary.value.trim(),
      horizon: f.horizon.value,
      status: f.status.value,
      source_url: f.source_url.value.trim(),
      source_note: f.source_note.value.trim(),
      tags: f.tags.value.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      await api('/api/v1/cards', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      f.reset();
      $('#new-card-form').classList.add('hidden');
      refresh();
    } catch (err) { flash(err.message); }
  });

  refresh();
})();