import { ok, strictEqual } from 'node:assert/strict'
import { svgDataUri, tintSvg } from '../src/logos.mjs'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="currentColor"/></svg>'

Deno.test('tintSvg: 把 currentColor 换成主题色', () => {
	strictEqual(tintSvg(SVG, '#e5e7eb'), SVG.replaceAll('currentColor', '#e5e7eb'))
	ok(!tintSvg(SVG, '#e5e7eb').includes('currentColor'))
	strictEqual(tintSvg('', '#fff'), '')
	strictEqual(tintSvg(undefined, '#fff'), '')
})

Deno.test('svgDataUri: 生成可内嵌的 SVG data URI', () => {
	const uri = svgDataUri(SVG, '#111')
	ok(uri.startsWith('data:image/svg+xml,'))
	ok(uri.includes(encodeURIComponent('#111')))
	ok(!uri.includes('currentColor'))
	strictEqual(svgDataUri('', '#111'), '')
})
