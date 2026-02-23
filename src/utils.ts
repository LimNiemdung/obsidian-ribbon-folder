/** 将 CSS 变量值（如 var(--size-4-1)）解析为像素数 */
export function getCssVarPx(varName: string): number {
	const el = document.createElement("div");
	el.style.cssText = `position:absolute;left:0;width:var(${varName});visibility:hidden;pointer-events:none`;
	document.body.appendChild(el);
	const px = el.getBoundingClientRect().width;
	el.remove();
	return Number.isNaN(px) ? 0 : px;
}
