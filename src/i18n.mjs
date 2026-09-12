/**
 * 多语言：覆盖 fount 支持的全部语言（见 fount `src/public/locales/list.csv`）。
 * 文案不写进代码，而是运行时按 URL 读取 `locales/<lang>.json`；未知语言回退到英文。
 * 纯函数（normalize / pickLanguage / translator）无 DOM 依赖，便于测试。
 */

/** fount 支持的语言列表（代码、母语名、书写方向）。 */
export const LANGUAGES = [
	{ code: 'ar-SA', name: 'العربية', dir: 'rtl' },
	{ code: 'de-DE', name: 'Deutsch', dir: 'ltr' },
	{ code: 'emoji', name: '🤓', dir: 'ltr' },
	{ code: 'en-UK', name: 'English (UK)', dir: 'ltr' },
	{ code: 'es-ES', name: 'Español', dir: 'ltr' },
	{ code: 'fr-FR', name: 'Français', dir: 'ltr' },
	{ code: 'hi-IN', name: 'हिन्दी', dir: 'ltr' },
	{ code: 'is-IS', name: 'Íslenska', dir: 'ltr' },
	{ code: 'it-IT', name: 'Italiano', dir: 'ltr' },
	{ code: 'ja-JP', name: '日本語', dir: 'ltr' },
	{ code: 'ko-KR', name: '한국어', dir: 'ltr' },
	{ code: 'lzh', name: '文言', dir: 'ltr' },
	{ code: 'nl-NL', name: 'Nederlands', dir: 'ltr' },
	{ code: 'pt-PT', name: 'Português', dir: 'ltr' },
	{ code: 'ru-RU', name: 'Русский', dir: 'ltr' },
	{ code: 'uk-UA', name: 'Українська', dir: 'ltr' },
	{ code: 'vi-VN', name: 'Tiếng Việt', dir: 'ltr' },
	{ code: 'zh-CN', name: '简体中文', dir: 'ltr' },
	{ code: 'zh-TW', name: '繁體中文', dir: 'ltr' },
]

/** 默认与回退语言。 */
export const FALLBACK = 'en-UK'

/** 文案目录（相对本模块，浏览器 / Deno 均可用）。 */
const LOCALES_BASE = new URL('../locales/', import.meta.url)

/** 供 `Intl.DateTimeFormat` 使用的 BCP-47 映射（fount 代码不全是标准 BCP-47）。 */
const INTL_LOCALES = {
	'en-UK': 'en-GB',
	emoji: 'en-GB',
	lzh: 'zh-Hans',
}

/** 文案缓存：语言代码 → 文案 Promise。 */
const messageCache = new Map()

/**
 * 判断是否为受支持的语言代码。
 * @param {string} code - 语言代码。
 * @returns {boolean} 是否受支持。
 */
export function isSupported(code) {
	return LANGUAGES.some((language) => language.code === code)
}

/**
 * 将任意 BCP-47 语言标记规范到受支持的语言代码。
 * @param {string} [tag] - `navigator.language` 等语言标记。
 * @returns {string} 受支持的语言代码。
 */
export function normalize(tag) {
	if (!tag) return FALLBACK
	const lower = String(tag).toLowerCase().replace(/_/g, '-')
	const exact = LANGUAGES.find((language) => language.code.toLowerCase() === lower)
	if (exact) return exact.code
	if (lower.startsWith('zh')) {
		return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN'
	}
	const base = lower.split('-')[0]
	const preferred = { en: 'en-UK', pt: 'pt-PT' }
	if (preferred[base]) return preferred[base]
	const match = LANGUAGES.find((language) => language.code.toLowerCase().split('-')[0] === base)
	return match ? match.code : FALLBACK
}

/**
 * 依浏览器语言列表挑选最佳语言。
 * @param {string[]} [preferred] - 语言偏好列表。
 * @returns {string} 受支持的语言代码。
 */
export function pickLanguage(preferred) {
	for (const tag of preferred || []) {
		if (isSupported(tag)) return tag
	}
	return normalize(preferred?.[0])
}

/**
 * 按 URL 读取某语言的文案（会话内缓存）。
 * @param {string} code - 语言代码。
 * @returns {Promise<Record<string, string>>} 文案表；失败时 reject。
 */
export function loadMessages(code) {
	const key = isSupported(code) ? code : FALLBACK
	if (messageCache.has(key)) return messageCache.get(key)
	const promise = fetch(new URL(`${key}.json`, LOCALES_BASE))
		.then((response) => {
			if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
			return response.json()
		})
		.catch((error) => {
			messageCache.delete(key)
			throw error
		})
	messageCache.set(key, promise)
	return promise
}

/**
 * 生成翻译函数。
 * @param {Record<string, string>} messages - 当前语言文案。
 * @param {Record<string, string>} [fallback] - 回退语言文案。
 * @returns {(key: string, params?: Record<string, string|number>) => string} 翻译函数。
 */
export function translator(messages, fallback = {}) {
	return (key, params) => {
		let text = messages?.[key] ?? fallback?.[key] ?? key
		for (const [name, value] of Object.entries(params || {})) {
			text = text.split(`{${name}}`).join(String(value))
		}
		return text
	}
}

/**
 * 取得用于时间格式化的 BCP-47 语言标记。
 * @param {string} code - 语言代码。
 * @returns {string} `Intl` 可用的语言标记。
 */
export function intlLocale(code) {
	return INTL_LOCALES[code] || code
}

/**
 * 取得语言书写方向。
 * @param {string} code - 语言代码。
 * @returns {'ltr'|'rtl'} 书写方向。
 */
export function direction(code) {
	return LANGUAGES.find((language) => language.code === code)?.dir || 'ltr'
}
