/** One bonsai mark for the workbench header and browser tab. Fixed colours also work outside the page. */
export const BRAND_MARK = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 64 64" aria-hidden="true">
<style>.brand-wood{fill:#6e5e50}.brand-leaf{fill:#617e40}.brand-root{fill:none;stroke:#ad8b3d;stroke-width:2;stroke-linecap:round}@media(prefers-color-scheme:dark){.brand-wood{fill:#a28d75}.brand-leaf{fill:#b5cb8f}.brand-root{stroke:#cbb16d}}</style>
<path class="brand-wood" d="M28 51C24 43 35 37 29 29C26 23 33 19 32 10L35 10C37 20 30 24 33 29C40 38 29 44 34 51Z"/>
<path class="brand-wood" d="M31 39Q20 39 12 33L12 31Q22 35 32 35ZM33 28Q44 29 52 22L52 20Q44 25 32 25ZM31 21Q23 20 19 16L19 14Q26 17 33 17Z"/>
<g class="brand-leaf">
<path d="M4 30Q9 21 17 28Q23 22 28 30Q17 34 4 30ZM37 19Q43 11 49 17Q56 12 60 20Q49 24 37 19ZM13 13Q18 6 24 11Q28 6 33 13Q24 17 13 13ZM27 7Q32 0 40 6Q36 12 27 7Z"/>
</g><path class="brand-root" d="M31 50Q22 54 12 55M32 51L35 59M33 51Q43 56 53 54"/>
</svg>`;

export const FAVICON_SVG = BRAND_MARK.replace('width="24" height="24"', 'width="64" height="64"');
