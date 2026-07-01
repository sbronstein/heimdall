(() => {
  // Extract a company's numeric LinkedIn id from its /company/<slug>/people/ page.
  // Primary source: canned-search anchors (currentCompany=%5B%22<id>%22%5D).
  // Fallback: urn:li:fsd_company:(<id>) references in page HTML.
  // Returns JSON-stringified { cannedSearchIds, urnIdsSample, sampleAnchor }.
  const anchors = [
    ...document.querySelectorAll('a[href*="currentCompany"]')
  ].map((a) => a.href);
  const ids = [
    ...new Set(
      anchors.flatMap((h) =>
        [...h.matchAll(/currentCompany=%5B%22(\d+)%22%5D/g)].map((m) => m[1])
      )
    )
  ];
  const urn = [
    ...new Set(
      [
        ...document.documentElement.innerHTML.matchAll(
          /urn:li:fsd_company:\(?(\d+)\)?/g
        )
      ].map((m) => m[1])
    )
  ].slice(0, 6);
  return JSON.stringify({
    cannedSearchIds: ids,
    urnIdsSample: urn,
    sampleAnchor: anchors[0] || null
  });
})();
