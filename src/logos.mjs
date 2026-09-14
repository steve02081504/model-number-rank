/**
 * 厂商图标：models.dev 的 logo 用 `fill="currentColor"`，直接作为 `<img>` 引用时该值
 * 解析为初始色（黑），在深色主题下与背景同色、难以分辨。处理方式与 fount 一致：
 * - DOM 场景把 SVG 内联成 `<svg class="text-icon">`，`currentColor` 继承文字色；
 * - ECharts 富文本背景图（`backgroundColor.image`）无法继承 CSS，则把 `currentColor`
 *   换成主题文字色后编码为 data URI。
 *
 * 纯函数（`tintSvg` / `svgDataUri`）无 DOM 依赖，便于测试。
 */

import { logoUrl } from './rank.mjs'

/** providerId → 已解析的 SVG 文本。 */
const svgCache = new Map()
/** providerId → 进行中的请求（避免重复抓取）。 */
const pending = new Map()

/**
 * 取厂商图标的 SVG 文本（会话内缓存）。
 * @param {string} providerId - models.dev 厂商 id。
 * @returns {Promise<string>} SVG 文本。
 */
export function loadLogoSvg(providerId) {
	if (svgCache.has(providerId)) return Promise.resolve(svgCache.get(providerId))
	if (!pending.has(providerId)) {
		const task = fetch(logoUrl(providerId))
			.then((response) => {
				if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
				return response.text()
			})
			.then((text) => {
				svgCache.set(providerId, text)
				pending.delete(providerId)
				return text
			})
			.catch((error) => {
				pending.delete(providerId)
				throw error
			})
		pending.set(providerId, task)
	}
	return pending.get(providerId)
}

/**
 * 同步读取已缓存的 SVG 文本。
 * @param {string} providerId - models.dev 厂商 id。
 * @returns {string} SVG 文本；尚未加载完成时为空串。
 */
export function cachedLogoSvg(providerId) {
	return svgCache.get(providerId) || ''
}

/**
 * 把 SVG 中的 `currentColor` 替换为指定颜色。
 * @param {string} svg - SVG 文本。
 * @param {string} color - 目标 CSS 颜色。
 * @returns {string} 替换后的 SVG 文本。
 */
export function tintSvg(svg, color) {
	return (svg || '').replaceAll('currentColor', color)
}

/**
 * 生成 ECharts 可直接用作背景图的 SVG data URI。
 * @param {string} svg - SVG 文本。
 * @param {string} color - 主题文字色。
 * @returns {string} data URI；无 SVG 时为空串。
 */
export function svgDataUri(svg, color) {
	return svg ? `data:image/svg+xml,${encodeURIComponent(tintSvg(svg, color))}` : ''
}

/**
 * 由 SVG 文本创建内联 `<svg>` 元素；`currentColor` 会继承 `.text-icon` 的文字色。
 * @param {string} svg - SVG 文本。
 * @param {object} [options] - 选项。
 * @param {number} [options.size] - 图标边长（px）。
 * @param {string} [options.className] - 追加的 class。
 * @returns {SVGElement|null} 内联元素；解析失败时为 `null`。
 */
export function createLogoSvgElement(svg, { size = 16, className = 'text-icon' } = {}) {
	if (!svg) return null
	const template = document.createElement('template')
	template.innerHTML = svg.trim()
	const element = template.content.firstElementChild
	if (!element || element.localName !== 'svg') return null
	element.setAttribute('class', className)
	element.setAttribute('width', String(size))
	element.setAttribute('height', String(size))
	element.setAttribute('aria-hidden', 'true')
	return element
}
