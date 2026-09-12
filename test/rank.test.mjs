import { deepStrictEqual, ok, strictEqual } from 'node:assert/strict'
import {
	buildRanking,
	catalogStats,
	detectLine,
	genericVersion,
	leadingWord,
	logoUrl,
	modelVersion,
} from '../src/rank.mjs'

/** 构造一份最小 models.dev 目录，覆盖名称 / id 解析与产品线过滤。 */
function mockCatalog() {
	return {
		openai: {
			id: 'openai',
			models: {
				'gpt-5': { id: 'gpt-5', name: 'GPT-5' },
				'gpt-5.6': { id: 'gpt-5.6', name: 'GPT-5.6' },
				'gpt-5.6-sol': { id: 'gpt-5.6-sol', name: 'GPT-5.6 Sol' },
				'gpt-6-astra': { id: 'gpt-6-astra', name: 'GPT-6 Astra' },
				'gpt-image-2': { id: 'gpt-image-2', name: 'gpt-image-2' },
			},
		},
		anthropic: {
			id: 'anthropic',
			models: {
				'claude-opus-4-6': { id: 'claude-opus-4-6', name: 'Claude Opus 4.6' },
				'claude-fable-5-1': { id: 'claude-fable-5-1', name: 'Claude Fable 5.1' },
			},
		},
		mistral: {
			id: 'mistral',
			models: {
				'mistral-medium-2604': { id: 'mistral-medium-2604', name: 'Mistral Medium 3.5' },
				'devstral-2512': { id: 'devstral-2512', name: 'Devstral 2' },
			},
		},
		google: {
			id: 'google',
			models: {
				'gemini-3.8-flash': { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash' },
				'gemma-4-26b-a4b-it': { id: 'gemma-4-26b-a4b-it', name: 'Gemma 4 26B A4B IT' },
			},
		},
	}
}

Deno.test('leadingWord: 取起始字母串', () => {
	strictEqual(leadingWord('GPT-5.6 Sol'), 'gpt')
	strictEqual(leadingWord('Qwen3.8 Max'), 'qwen')
	strictEqual(leadingWord('MiniMax-M3'), 'minimax')
	strictEqual(leadingWord('o3'), 'o')
	strictEqual(leadingWord(''), '')
})

Deno.test('genericVersion: 云端模型名解析', () => {
	strictEqual(genericVersion('GPT-6 Astra'), 6)
	strictEqual(genericVersion('GPT-5.6 Sol'), 5.6)
	strictEqual(genericVersion('Claude Opus 4.6'), 4.6)
	strictEqual(genericVersion('claude-opus-4-6'), 4.6)
	strictEqual(genericVersion('Mistral Medium 3.5'), 3.5)
	strictEqual(genericVersion('Qwen3.8 Max'), 3.8)
	strictEqual(genericVersion('DeepSeek V4 Flash 0731'), 4)
	strictEqual(genericVersion('Llama 3.1 70B'), 3.1)
})

Deno.test('genericVersion: 跳过参数规模 / 混合专家 / 年份', () => {
	strictEqual(genericVersion('Mixtral 8x22B'), null)
	strictEqual(genericVersion('Pixtral 12B'), null)
	strictEqual(genericVersion('mistral-medium-2604'), null)
	strictEqual(genericVersion('Mistral Large'), null)
})

Deno.test('modelVersion: 名称优先于 id', () => {
	strictEqual(modelVersion({ id: 'mistral-medium-2604', name: 'Mistral Medium 3.5' }), 3.5)
	strictEqual(modelVersion({ id: 'gpt-6-astra', name: '' }), 6)
})

Deno.test('detectLine: 取出现最多的起始词（忽略单字母）', () => {
	const provider = {
		models: {
			a: { name: 'GPT-5' },
			b: { name: 'GPT-6' },
			c: { name: 'o3' },
			d: { name: 'Image 1' },
		},
	}
	strictEqual(detectLine(provider), 'gpt')
})

Deno.test('buildRanking: 按版本降序、同版本去重取短名', () => {
	const ranking = buildRanking(mockCatalog())
	ok(ranking.length > 0)
	const versions = ranking.map((item) => item.version)
	deepStrictEqual([...versions].sort((a, b) => b - a), versions)
	strictEqual(ranking[0].label, 'GPT-6 Astra')
	strictEqual(ranking[0].version, 6)
	strictEqual(ranking.find((item) => item.version === 5.6).label, 'GPT-5.6')
})

Deno.test('buildRanking: 只取旗舰产品线', () => {
	const ranking = buildRanking(mockCatalog())
	const versions = (id) => ranking.filter((item) => item.familyId === id).map((item) => item.version)
	deepStrictEqual(versions('openai'), [6, 5.6, 5])
	deepStrictEqual(versions('anthropic'), [5.1, 4.6])
	deepStrictEqual(versions('mistral'), [3.5])
	deepStrictEqual(versions('google'), [3.8])
})

Deno.test('buildRanking: perFamily 限制每家版本数', () => {
	const ranking = buildRanking(mockCatalog(), { perFamily: 1 })
	deepStrictEqual(ranking.map((item) => item.version).sort((a, b) => b - a), [6, 5.1, 3.8, 3.5])
})

Deno.test('catalogStats / logoUrl', () => {
	deepStrictEqual(catalogStats(mockCatalog()), { models: 11, providers: 4 })
	strictEqual(logoUrl('moonshotai'), 'https://models.dev/logos/moonshotai.svg')
})
