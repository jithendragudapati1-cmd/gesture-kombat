// Asset URL resolver: the single-file offline build embeds every asset as a data URI.
export const asset = (p) => (window.__GK_ASSETS && typeof window.__GK_ASSETS[p] === 'string' && window.__GK_ASSETS[p].startsWith('data:')) ? window.__GK_ASSETS[p] : p;
