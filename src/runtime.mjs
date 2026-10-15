import { now } from './browser.mjs';

// This is our coordinator. No framework runtime owns the model.
export function start(initial, update, view, subscriptions, perform, actions) {
  let model = initial;
  let processing = false;
  let clockInterval = null;
  const queue = [];
  const $ = id => document.getElementById(id);

  // Even synchronous effects enqueue their responses. Never re-enter update.
  function dispatch(message) {
    queue.push(message);
    if (processing) return;
    processing = true;
    try {
      while (queue.length) {
        const [nextModel, effects] = update(queue.shift())(model);
        model = nextModel;                       // Commit first.
        render(view(model));                    // Derive the screen.
        reconcile(subscriptions(model));        // Maintain ongoing sources.
        for (const effect of effects) perform(effect, dispatch);
      }
    } finally { processing = false; }
  }

  function reconcile(descriptions) {
    const wantsClock = descriptions.toArray().length > 0;
    if (wantsClock && clockInterval === null)
      clockInterval = setInterval(() => dispatch(actions.tick(now())), 1000);
    if (!wantsClock && clockInterval !== null) {
      clearInterval(clockInterval);
      clockInterval = null;
    }
  }

  function render(screen) {
    if ($('query').value !== screen.draft) $('query').value = screen.draft;
    $('search-status').textContent = screen.status;
    $('submitted-query').textContent = screen.query;
    $('clock-value').textContent = screen.clock;
    $('clock-toggle').textContent = screen.clock_action_label;
    $('clock-toggle').setAttribute('aria-pressed', String(screen.clock_mode === 'live'));
    $('clock-dot').classList.toggle('live', screen.clock_mode === 'live');
    $('storage-status').textContent = screen.storage;
    $('clipboard-status').textContent = screen.clipboard;
    $('timer-status').textContent = screen.timer;
    $('timer-button').textContent = screen.timer_action_label;
    const results = screen.stories.toArray();
    $('results').replaceChildren(...results.map(story => {
      const li = document.createElement('li'); const a = document.createElement('a');
      a.textContent = story.title; a.href = story.url; a.target = '_blank'; a.rel = 'noopener noreferrer';
      li.append(a); return li;
    }));
    const entries = screen.history.toArray();
    $('activity-count').textContent = String(entries.length);
    $('activity').replaceChildren(...entries.map((text, i) => {
      const li = document.createElement('li');
      const number = document.createElement('span'); number.textContent = String(entries.length-i).padStart(2,'0');
      const label = document.createElement('code'); label.textContent = text;
      li.append(number, label); return li;
    }));
    $('empty-activity').hidden = entries.length > 0;
    // Inspection is a read-only view of application values, not a second model.
    $('model-value').textContent = JSON.stringify(model, (_, value) =>
      value && typeof value.toArray === 'function' ? value.toArray() : value, 2);
  }

  $('query').addEventListener('input', event => dispatch(actions.edit(event.target.value)));
  $('search-form').addEventListener('submit', event => { event.preventDefault(); dispatch(actions.search); });
  for (const [id, message] of [['read-time', actions.time], ['save-query', actions.save],
    ['restore-query', actions.restore], ['copy-query', actions.copy],
    ['timer-button', actions.timer], ['clock-toggle', actions.toggle_clock]])
    $(id).addEventListener('click', () => dispatch(message));
  window.addEventListener('pagehide', () => {
    if (clockInterval !== null) clearInterval(clockInterval);
    clockInterval = null;
  });
  window.addEventListener('pageshow', () => reconcile(subscriptions(model)));
  render(view(model));
  reconcile(subscriptions(model));
}
