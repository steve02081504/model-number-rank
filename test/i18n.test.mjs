import { ok, strictEqual } from 'node:assert/strict'
import {
	direction,
	FALLBACK,
	intlLocale,
	isSupported,
	LANGUAGES,
	normalize,
	pickLanguage,
	translator,
} from '../src/i18n.mjs'

const REQUIRED_KEYS = [
	'title',
	'subtitle',
	'yAxis',
	'xAxis',
	'note',
	'loading',
	'error',
	'retry',
	'updated',
	'source',
	'producedBy',
	'github',
	'blog',
]

/**
 * 读取某语言的文案 JSON 文件。
 * @param {string} code - 语言代码。
 * @returns {Promise<Record<string, string>>} 文案表。
 */
async function readMessages(code) {
	const module = await import(new URL(`../locales/${code}.json`, import.meta.url), { with: { type: 'json' } })
	return module.default
}

Deno.test('每个 fount 语言文件都有完整文案', async () => {
	for (const { code } of LANGUAGES) {
		const messages = await readMessages(code)
		for (const key of REQUIRED_KEYS) {
			ok(messages[key], `${code} 缺少文案 ${key}`)
		}
		const t = translator(messages, messages)
		ok(t('subtitle', { models: 7, providers: 3 }).includes('7'))
		ok(t('updated', { time: 'X' }).includes('X'))
	}
})

Deno.test('语言数量与 fount list.csv 一致', () => {
	strictEqual(LANGUAGES.length, 18)
})

Deno.test('translator 缺键时回退到 fallback', () => {
	const t = translator({ a: 'A' }, { a: 'FA', b: 'FB' })
	strictEqual(t('a'), 'A')
	strictEqual(t('b'), 'FB')
	strictEqual(t('c'), 'c')
	strictEqual(translator()('missing'), 'missing')
})

Deno.test('normalize 处理地区变体与回退', () => {
	strictEqual(normalize('zh-Hant-HK'), 'zh-TW')
	strictEqual(normalize('zh-Hans'), 'zh-CN')
	strictEqual(normalize('en-US'), 'en-UK')
	strictEqual(normalize('pt-BR'), 'pt-PT')
	strictEqual(normalize('xx-XX'), FALLBACK)
	strictEqual(normalize('zh-CN'), 'zh-CN')
})

Deno.test('pickLanguage 依偏好顺序挑选', () => {
	strictEqual(pickLanguage(['xx-XX', 'ja-JP', 'en-UK']), 'ja-JP')
	strictEqual(pickLanguage(['de-DE']), 'de-DE')
	strictEqual(pickLanguage([]), FALLBACK)
})

Deno.test('isSupported / direction / intlLocale', () => {
	ok(isSupported('zh-TW'))
	ok(!isSupported('en-US'))
	strictEqual(direction('ar-SA'), 'rtl')
	strictEqual(direction('en-UK'), 'ltr')
	strictEqual(intlLocale('en-UK'), 'en-GB')
	strictEqual(intlLocale('ja-JP'), 'ja-JP')
})
