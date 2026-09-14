import { buildRanking, catalogStats, FAMILIES } from './rank.mjs'
import { cachedLogoSvg, createLogoSvgElement, loadLogoSvg, svgDataUri } from './logos.mjs'
import {
	direction,
	FALLBACK,
	intlLocale,
	isSupported,
	LANGUAGES,
	loadMessages,
	pickLanguage,
	translator,
} from './i18n.mjs'

/** fount proxy 视图使用的同一数据源。 */
const DATA_URL = 'https://models.dev/api.json'
/** 自动刷新间隔。 */
const REFRESH_MS = 5 * 60 * 1000
/** 切回前台后超过该间隔则重新拉取。 */
const STALE_MS = 60 * 1000
const LANG_STORAGE_KEY = 'model-number-rank.lang'
const THEME_STORAGE_KEY = 'model-number-rank.theme'

const echarts = globalThis.echarts

const elements = {
	chart: document.getElementById('chart'),
	legend: document.getElementById('legend'),
	status: document.getElementById('status'),
	subtitle: document.getElementById('subtitle'),
	langSelect: document.getElementById('langSelect'),
	themeToggle: document.getElementById('themeToggle'),
	themeIcon: document.getElementById('themeIcon'),
}

/** 当前语言、翻译函数与文案表。 */
let locale = FALLBACK
let t = translator({}, {})
let messages = {}
let fallbackMessages = {}
let localeSeq = 0
/** 最近一次成功获取数据的时间、目录统计与排名条目。 */
let lastFetchedAt = 0
let stats = { models: 0, providers: 0 }
let items = []
/** ECharts 实例与当前主题。 */
let chart = null
let isDark = document.documentElement.dataset.theme === 'dark'

/**
 * 将版本号格式化为一位小数（如 6 → 6.0，5.6 → 5.6）。
 * @param {number} version - 版本号。
 * @returns {string} 展示文本。
 */
function formatVersion(version) {
	return version.toFixed(1)
}

/**
 * 转义 ECharts tooltip 里的 HTML。
 * @param {unknown} value - 原始值。
 * @returns {string} 转义后的文本。
 */
function escapeHtml(value) {
	return String(value).replace(
		/[&<>"']/g,
		(ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]),
	)
}

/**
 * 依主题取图表配色。
 * @param {boolean} dark - 是否深色主题。
 * @returns {{ text: string, axis: string, split: string, barBorder: string, tooltipBg: string }} 配色。
 */
function chartColors(dark) {
	return dark
		? {
			text: '#e5e7eb',
			axis: '#6b7280',
			split: 'rgba(255,255,255,0.10)',
			barBorder: 'rgba(255,255,255,0.22)',
			tooltipBg: '#1f2430',
		}
		: {
			text: '#374151',
			axis: '#9ca3af',
			split: 'rgba(0,0,0,0.08)',
			barBorder: 'rgba(0,0,0,0.12)',
			tooltipBg: '#ffffff',
		}
}

/**
 * 由排名条目构建 ECharts 配置。
 * @param {object[]} ranking - 排名条目。
 * @param {boolean} dark - 是否深色主题。
 * @returns {object} ECharts option。
 */
function buildOption(ranking, dark) {
	const colors = chartColors(dark)
	const rich = { value: { fontSize: 12, fontWeight: 'bold', lineHeight: 15, color: colors.text } }
	const seen = new Set()
	for (const item of ranking) {
		if (seen.has(item.providerId)) continue
		seen.add(item.providerId)
		const image = svgDataUri(cachedLogoSvg(item.providerId), colors.text)
		rich[`logo_${item.providerId}`] = {
			width: 20,
			height: 20,
			align: 'center',
			...(image ? { backgroundColor: { image, repeat: false } } : {}),
		}
	}
	return {
		backgroundColor: 'transparent',
		animationDuration: 500,
		textStyle: { color: colors.text },
		grid: { left: 46, right: 16, top: 48, bottom: 8, containLabel: true },
		tooltip: {
			trigger: 'axis',
			axisPointer: { type: 'shadow' },
			backgroundColor: colors.tooltipBg,
			borderColor: colors.axis,
			textStyle: { color: colors.text },
			formatter: (params) => {
				const item = ranking[params[0]?.dataIndex]
				if (!item) return ''
				const image = svgDataUri(cachedLogoSvg(item.providerId), colors.text)
				const logo = image
					? `<img src="${image}" style="width:14px;height:14px;vertical-align:-2px" alt="">`
					: ''
				return [
					`<div style="font-weight:600">${escapeHtml(item.label)}</div>`,
					`<div style="opacity:.75">${logo ? `${logo} ` : ''}${escapeHtml(item.providerLabel)}</div>`,
					`<div>${escapeHtml(t('yAxis'))}: <b>${formatVersion(item.version)}</b></div>`,
					`<div style="opacity:.6;font-size:11px">${escapeHtml(item.modelId)}</div>`,
				].join('')
			},
		},
		xAxis: {
			type: 'category',
			data: ranking.map((item) => item.label),
			axisLine: { lineStyle: { color: colors.axis } },
			axisTick: { alignWithLabel: true, lineStyle: { color: colors.axis } },
			axisLabel: {
				interval: 0,
				rotate: 55,
				fontSize: 11,
				color: colors.text,
				formatter: (value) => value.length > 24 ? `${value.slice(0, 23)}…` : value,
			},
		},
		yAxis: {
			type: 'value',
			name: t('yAxis'),
			nameLocation: 'middle',
			nameRotate: 90,
			nameGap: 32,
			nameTextStyle: { color: colors.text, fontSize: 12 },
			min: 0,
			axisLine: { show: true, lineStyle: { color: colors.axis } },
			axisLabel: { color: colors.text },
			splitLine: { lineStyle: { color: colors.split } },
		},
		series: [{
			type: 'bar',
			data: ranking.map((item) => ({
				value: item.version,
				itemStyle: {
					color: item.color,
					borderColor: colors.barBorder,
					borderWidth: 1,
					borderRadius: [6, 6, 0, 0],
				},
			})),
			barMaxWidth: 40,
			barCategoryGap: '35%',
			label: {
				show: true,
				position: 'top',
				distance: 6,
				formatter: (params) =>
					`{logo_${ranking[params.dataIndex].providerId}| }\n{value|${formatVersion(params.value)}}`,
				rich,
			},
			emphasis: { itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.25)' } },
		}],
	}
}

/**
 * 生成平台语言名称列表。
 * @returns {void}
 */
function buildLanguageOptions() {
	const options = LANGUAGES.map(({ code, name }) => {
		const option = document.createElement('option')
		option.value = code
		option.textContent = name
		return option
	})
	elements.langSelect.replaceChildren(...options)
}

/**
 * 刷新所有带 `data-i18n` 的静态文案。
 * @returns {void}
 */
function applyStaticText() {
	for (const node of document.querySelectorAll('[data-i18n]')) {
		node.textContent = t(node.dataset.i18n)
	}
	for (const node of document.querySelectorAll('[data-i18n-title]')) {
		node.title = t(node.dataset.i18nTitle)
	}
	document.title = `${t('title')} · Model Number Rank`
	document.documentElement.lang = locale
	document.documentElement.dir = direction(locale)
}

/**
 * 渲染厂商图例（色块 + 图标 + 名称，均为 URL 资源）。
 * @returns {void}
 */
function renderLegend() {
	const chips = FAMILIES.map((family) => {
		const chip = document.createElement('span')
		chip.className = 'badge badge-ghost badge-sm gap-1.5 py-2.5'
		const swatch = document.createElement('span')
		swatch.className = 'inline-block h-3 w-3 rounded-sm'
		swatch.style.background = family.color
		const logo = document.createElement('span')
		logo.className = 'inline-flex h-4 w-4 items-center justify-center'
		loadLogoSvg(family.provider)
			.then((svg) => {
				const element = createLogoSvgElement(svg)
				if (element) logo.replaceChildren(element)
			})
			.catch(() => {/* 图标加载失败时保留色块 */})
		const name = document.createElement('span')
		name.textContent = family.label
		chip.append(swatch, logo, name)
		return chip
	})
	elements.legend.replaceChildren(...chips)
}

/**
 * 预取全部厂商图标；就绪后重绘图表（ECharts 背景图需要同步拿到 SVG 文本）。
 * @returns {void}
 */
function preloadLogos() {
	Promise.allSettled(FAMILIES.map((family) => loadLogoSvg(family.provider)))
		.then(() => {
			if (items.length) renderChart()
		})
}

/**
 * 初始化 ECharts 实例。
 * @returns {void}
 */
function initChart() {
	if (!echarts || !elements.chart) return
	chart = echarts.init(elements.chart)
	globalThis.addEventListener('resize', () => chart?.resize())
}

/**
 * 用当前数据与语言重绘图表。
 * @returns {void}
 */
function renderChart() {
	if (!chart || !items.length) return
	chart.setOption(buildOption(items, isDark), true)
}

/**
 * 显示状态行。
 * @param {string|null} key - 文案键。
 * @param {Record<string, string|number>} [params] - 插值参数。
 * @param {boolean} [withRetry] - 是否附带重试按钮。
 * @returns {void}
 */
function setStatus(key, params, withRetry = false) {
	elements.status.replaceChildren()
	if (!key) return
	if (key === 'loading') {
		const spinner = document.createElement('span')
		spinner.className = 'loading loading-spinner loading-xs me-1 align-middle'
		elements.status.append(spinner, t(key, params))
		return
	}
	if (key === 'error') {
		const alert = document.createElement('div')
		alert.className = 'alert alert-error py-2 text-sm'
		const span = document.createElement('span')
		span.textContent = t(key, params)
		alert.appendChild(span)
		if (withRetry) {
			const retry = document.createElement('button')
			retry.type = 'button'
			retry.className = 'btn btn-xs'
			retry.textContent = t('retry')
			retry.addEventListener('click', () => refresh({ force: true }))
			alert.appendChild(retry)
		}
		elements.status.appendChild(alert)
		return
	}
	elements.status.textContent = t(key, params)
}

/**
 * 依语言刷新动态文案（副标题与时间）。
 * @returns {void}
 */
function refreshDynamicText() {
	elements.subtitle.textContent = stats.models
		? t('subtitle', { models: stats.models, providers: stats.providers })
		: ''
}

/**
 * 应用语言：按 URL 拉取文案后刷新页面。
 * @param {string} code - 语言代码。
 * @param {boolean} [persist] - 是否写入 localStorage。
 * @returns {Promise<void>} 完成信号。
 */
async function setLocale(code, persist = true) {
	const seq = ++localeSeq
	locale = isSupported(code) ? code : FALLBACK
	if (persist) {
		try {
			localStorage.setItem(LANG_STORAGE_KEY, locale)
		} catch { /* 隐私模式下忽略 */ }
	}
	fallbackMessages = await loadMessages(FALLBACK).catch(() => ({}))
	const loaded = locale === FALLBACK ? fallbackMessages : await loadMessages(locale).catch(() => fallbackMessages)
	if (seq !== localeSeq) return
	messages = loaded
	t = translator(messages, fallbackMessages)

	elements.langSelect.value = locale
	try {
		const url = new URL(location.href)
		if (locale === FALLBACK) url.searchParams.delete('lang')
		else url.searchParams.set('lang', locale)
		history.replaceState(null, '', url)
	} catch { /* file:// 等场景忽略 */ }
	applyStaticText()
	refreshDynamicText()
	if (lastFetchedAt) updateUpdatedStatus()
	renderChart()
}

/**
 * 更新时间状态行。
 * @returns {void}
 */
function updateUpdatedStatus() {
	let time
	try {
		time = new Intl.DateTimeFormat(intlLocale(locale), { dateStyle: 'medium', timeStyle: 'short' }).format(
			new Date(lastFetchedAt),
		)
	} catch {
		time = new Date(lastFetchedAt).toLocaleString()
	}
	setStatus('updated', { time })
}

/**
 * 应用主题（daisyUI `data-theme` + Iconify 图标 + 图表配色）。
 * @param {boolean} dark - 是否深色。
 * @param {boolean} [persist] - 是否写入 localStorage。
 * @returns {void}
 */
function applyTheme(dark, persist = true) {
	isDark = dark
	document.documentElement.dataset.theme = dark ? 'dark' : 'light'
	if (persist) {
		try {
			localStorage.setItem(THEME_STORAGE_KEY, dark ? 'dark' : 'light')
		} catch { /* 隐私模式下忽略 */ }
	}
	elements.themeIcon?.setAttribute('icon', dark ? 'lucide:sun' : 'lucide:moon')
	renderChart()
}

/**
 * 获取目录数据并重绘。
 * @param {object} [options] - 选项。
 * @param {boolean} [options.force] - 忽略缓存与时间间隔。
 * @returns {Promise<void>} 完成信号。
 */
async function refresh({ force = false } = {}) {
	if (!force && Date.now() - lastFetchedAt < STALE_MS) return
	setStatus('loading')
	try {
		const response = await fetch(DATA_URL, { cache: 'no-cache' })
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`)
		const data = await response.json()
		stats = catalogStats(data)
		items = buildRanking(data)
		lastFetchedAt = Date.now()
		renderChart()
		refreshDynamicText()
		updateUpdatedStatus()
	} catch (error) {
		setStatus('error', { message: error?.message || String(error) }, true)
	}
}

/**
 * 初始化页面。
 * @returns {void}
 */
function init() {
	buildLanguageOptions()
	renderLegend()
	preloadLogos()
	initChart()

	let stored
	try {
		stored = localStorage.getItem(LANG_STORAGE_KEY)
	} catch {
		stored = null
	}
	const fromUrl = new URLSearchParams(location.search).get('lang')
	const initial = [fromUrl, stored].find((code) => code && isSupported(code)) || pickLanguage(navigator.languages)
	setLocale(initial, false)

	applyTheme(isDark, false)
	elements.langSelect.addEventListener('change', () => setLocale(elements.langSelect.value))
	elements.themeToggle.addEventListener('click', () => applyTheme(!isDark))

	refresh({ force: true })

	setInterval(() => {
		if (document.visibilityState === 'visible') refresh()
	}, REFRESH_MS)

	document.addEventListener('visibilitychange', () => {
		if (document.visibilityState === 'visible') refresh()
	})
}

init()
