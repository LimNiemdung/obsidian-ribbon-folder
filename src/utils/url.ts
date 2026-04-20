/** 补全无 http(s) 的地址，便于在系统浏览器中打开 */
export function normalizeExternalUrl(raw: string): string | null {
	const t = raw.trim();
	if (!t) return null;
	if (/^https?:\/\//i.test(t)) return t;
	if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t;
	return `https://${t}`;
}

export function isUrlSafeToOpen(url: string): boolean {
	try {
		const u = new URL(url);
		const p = u.protocol.toLowerCase();
		if (p === "javascript:" || p === "data:" || p === "vbscript:") return false;
		return true;
	} catch {
		return false;
	}
}
