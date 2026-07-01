(() => {
  // Per-card extractor for a LinkedIn people-search results page.
  // Results are div[role="listitem"] (NOT <li>); each real card contains a
  // profile (/in/) anchor and a degree badge ("1st"/"2nd"/"3rd").
  // Returns a JSON-stringified array of { name, url, lines }.
  const anchors = [...document.querySelectorAll('a[href*="/in/"]')];
  const seen = new Set();
  const cards = [];
  for (const a of anchors) {
    const li = a.closest('[role="listitem"]') || a.closest('li');
    if (!li) continue;
    if (seen.has(li)) continue;
    const txt = li.innerText || '';
    if (!/\b(1st|2nd|3rd)\b/.test(txt)) continue;
    seen.add(li);
    const nameAnchor = li.querySelector('a[href*="/in/"]');
    let name = '';
    const hidden =
      nameAnchor && nameAnchor.querySelector('span[aria-hidden="true"]');
    if (hidden) name = hidden.innerText.trim();
    if (!name && nameAnchor)
      name = (nameAnchor.innerText || '').split('\n')[0].trim();
    const url = nameAnchor ? nameAnchor.href.split('?')[0] : null;
    const lines = txt
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    cards.push({ name, url, lines });
  }
  return JSON.stringify(cards);
})();
