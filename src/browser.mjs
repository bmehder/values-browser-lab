// Browser APIs and the untrusted HTTP boundary. Application policy lives in Gleam.
import { Story, StoryTitle, StoryUrl } from './model.mjs';
import { toList } from '../gleam_stdlib/gleam.mjs';
const storageKey = 'values-browser-lab:draft';
export const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
export function search(query, success, failure) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  fetch(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=5&query=${encodeURIComponent(query)}`, { signal: controller.signal })
    .then(async response => {
      if (!response.ok) throw new Error(`Service returned HTTP ${response.status}.`);
      const body = await response.json();
      if (!Array.isArray(body.hits)) throw new Error('The service returned an unexpected response.');
      const stories = body.hits.map(hit => {
        if (typeof hit.title !== 'string' || typeof hit.objectID !== 'string') throw new Error('A story had an unexpected format.');
        const fallback = `https://news.ycombinator.com/item?id=${encodeURIComponent(hit.objectID)}`;
        let url = fallback;
        try { const candidate = new URL(hit.url); if (['https:', 'http:'].includes(candidate.protocol)) url = candidate.href; } catch {}
        return new Story(new StoryTitle(hit.title), new StoryUrl(url));
      });
      success(toList(stories));
    })
    .catch(error => failure(error.name === 'AbortError' ? 'The request timed out. Try again.' : error.message || 'The service could not be reached.'))
    .finally(() => clearTimeout(timeout));
}
export function save(text, success, failure) {
  try { localStorage.setItem(storageKey, text); success(); } catch { failure('This browser could not save the query.'); }
}
export function restore(success, failure) {
  try { const text = localStorage.getItem(storageKey); text === null ? failure('No saved query yet.') : success(text); }
  catch { failure('This browser could not read saved queries.'); }
}
export function copy(text, success, failure) {
  if (!navigator.clipboard?.writeText) { failure('Clipboard access is unavailable in this browser.'); return; }
  navigator.clipboard.writeText(text).then(success, () => failure('Clipboard access was denied.'));
}
export function delay(milliseconds, finished) { setTimeout(finished, milliseconds); }
