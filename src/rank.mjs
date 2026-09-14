/**
 * 纯计算模块：从 models.dev 目录（fount proxy 视图所用的同一数据源）中，
 * 解析各主流厂商模型的版本号并排名。无 DOM 依赖，便于测试。
 *
 * 版本号不再依赖写死的正则，而是**从云端模型名实时解析**：只要厂商发布新模型，
 * 无需改代码即可自动收录更高版本。厂商名单本身仍需人工精选——models.dev 没有
 * 提供热度/官方标识，且同一模型会被大量聚合商转售，无法自动分辨「主流厂商」。
 */

/**
 * 追踪的厂商。
 * `provider` 为该厂商在 models.dev 中的官方 id（同时用于 `https://models.dev/logos/<id>.svg` 图标）。
 * `line` 为旗舰产品线的起始词（小写）；留空则自动取该厂商模型名里出现最多的起始词。
 */
export const FAMILIES = [
	{ id: 'openai', label: 'OpenAI', provider: 'openai', color: '#10a37f', line: ['gpt'] },
	{ id: 'zai', label: 'Z.AI / GLM', provider: 'zai', color: '#2f6fed', line: ['glm'] },
	{ id: 'anthropic', label: 'Anthropic', provider: 'anthropic', color: '#d97757', line: ['claude'] },
	{ id: 'xai', label: 'xAI', provider: 'xai', color: '#111111', line: ['grok'] },
	{ id: 'deepseek', label: 'DeepSeek', provider: 'deepseek', color: '#4d6bfe', line: ['deepseek'] },
	{ id: 'meta', label: 'Meta / Llama', provider: 'meta', color: '#0866ff', line: ['muse', 'llama'] },
	{ id: 'alibaba', label: 'Alibaba / Qwen', provider: 'alibaba', color: '#615ced', line: ['qwen'] },
	{ id: 'moonshotai', label: 'Moonshot / Kimi', provider: 'moonshotai', color: '#16a394', line: ['kimi'] },
	{ id: 'minimax', label: 'MiniMax', provider: 'minimax', color: '#ee3a8c', line: ['minimax'] },
	{ id: 'mistral', label: 'Mistral', provider: 'mistral', color: '#fa520f', line: ['mistral'] },
	{ id: 'google', label: 'Google', provider: 'google', color: '#ea4335', line: ['gemini'] },
]

/** 每个厂商最多展示的历史版本数。 */
export const VERSIONS_PER_FAMILY = 3

/** 版本号的合理上限；用于排除参数规模、年份等被误当作版本号的数字。 */
const MAX_PLAUSIBLE_VERSION = 100

/**
 * 由厂商 id 生成 models.dev 图标 URL。
 * @param {string} providerId - models.dev 厂商 id。
 * @returns {string} SVG 图标 URL。
 */
export function logoUrl(providerId) {
	return `https://models.dev/logos/${encodeURIComponent(providerId)}.svg`
}

/**
 * 取模型名 / 模型 id 的起始字母串（小写），用于判定产品线。
 * @param {string} [name] - 文本。
 * @returns {string} 起始词，如 `GPT-5.6` → `gpt`、`Qwen3.8 Max` → `qwen`。
 */
export function leadingWord(name) {
	const match = /^[A-Za-z]+/.exec(name || '')
	return match ? match[0].toLowerCase() : ''
}

/**
 * 从模型名中解析版本号：取第一个合理的数字（支持 `5.6` / `4-5`），
 * 跳过参数规模（`70B`）、混合专家（`8x22B`）与大于 100 的年份 / 数字。
 * @param {string} [name] - 模型名。
 * @returns {number|null} 版本号；解析不到时为 `null`。
 */
export function genericVersion(name) {
	const pattern = /(\d+)(?:[.\-](\d+))?/g
	let match
	while ((match = pattern.exec(name || '')) !== null) {
		const after = name[match.index + match[0].length]
		if (after === 'B' || after === 'b' || after === 'x' || after === 'X') {
			if (match.index === pattern.lastIndex) pattern.lastIndex++
			continue
		}
		const version = Number.parseFloat(match[1] + (match[2] ? `.${match[2]}` : ''))
		if (!Number.isNaN(version) && version < MAX_PLAUSIBLE_VERSION) return version
		if (match.index === pattern.lastIndex) pattern.lastIndex++
	}
	return null
}

/**
 * 自动推断某厂商的旗舰产品线：取模型名中出现次数最多的起始词。
 * @param {object} provider - models.dev 厂商对象。
 * @returns {string} 产品线起始词；无法推断时为空串。
 */
export function detectLine(provider) {
	const counts = new Map()
	for (const model of Object.values(provider?.models || {})) {
		const word = leadingWord(model?.name || model?.id || '')
		if (word.length < 3) continue
		counts.set(word, (counts.get(word) || 0) + 1)
	}
	let best = ''
	let bestCount = 0
	for (const [word, count] of counts) {
		if (count > bestCount) {
			best = word
			bestCount = count
		}
	}
	return best
}

/**
 * 取模型的版本号：名称优先，名称无版本号时回退到 id（避免日期式 id 污染版本）。
 * @param {object} model - models.dev 模型对象。
 * @returns {number|null} 版本号。
 */
export function modelVersion(model) {
	return genericVersion(model?.name) ?? genericVersion(model?.id)
}

/**
 * 统计目录规模。
 * @param {Record<string, object>} apiData - models.dev API JSON。
 * @returns {{ models: number, providers: number }} 模型总数与厂商总数。
 */
export function catalogStats(apiData) {
	let models = 0
	let providers = 0
	for (const provider of Object.values(apiData || {})) {
		if (!provider?.models) continue
		providers++
		models += Object.keys(provider.models).length
	}
	return { models, providers }
}

/**
 * 构建排名：每个厂商取其旗舰产品线中版本号最高的若干模型，按版本号降序排列。
 * @param {Record<string, object>} apiData - models.dev API JSON。
 * @param {object} [options] - 选项。
 * @param {number} [options.perFamily] - 每个厂商保留的版本数。
 * @returns {object[]} 排名条目（含版本号、名称、厂商、颜色）。
 */
export function buildRanking(apiData, { perFamily = VERSIONS_PER_FAMILY } = {}) {
	const items = []
	for (const family of FAMILIES) {
		const provider = apiData?.[family.provider]
		if (!provider?.models) continue

		const lines = family.line?.length ? family.line : [detectLine(provider)]
		const byVersion = new Map()
		for (const model of Object.values(provider.models)) {
			if (!lines.includes(leadingWord(model.name || model.id || ''))) continue
			const version = modelVersion(model)
			if (version == null) continue
			const label = model.name || model.id || ''
			const existing = byVersion.get(version)
			if (!existing || label.length < existing.label.length) {
				byVersion.set(version, {
					version,
					label,
					modelId: model.id,
					familyId: family.id,
					providerId: family.provider,
					providerLabel: family.label,
					color: family.color,
				})
			}
		}

		items.push(
			...[...byVersion.values()]
				.sort((a, b) => b.version - a.version)
				.slice(0, perFamily),
		)
	}

	items.sort((a, b) =>
		b.version - a.version ||
		a.providerLabel.localeCompare(b.providerLabel) ||
		a.label.localeCompare(b.label)
	)
	return items
}
