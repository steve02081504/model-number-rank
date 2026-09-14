# AGENTS.md

> 无构建、依赖与资源全部走 CDN 的静态站点：把主流 AI 模型的版本号实时排名渲染成柱状图。部署在 GitHub Pages（分支 `main`
> 根目录）。

## 数据源

- 模型 / 厂商目录：`https://models.dev/api.json`，与 fount 的 proxy 视图同款
  （`fount/src/public/parts/serviceGenerators/AI/proxy/display.mjs`），CORS `*`，浏览器端直接 `fetch`。
- 厂商图标：`https://models.dev/logos/<providerId>.svg`（接口无图标字段，由厂商 id 推导；`src/rank.mjs` `logoUrl`）。
  这些 SVG 用 `fill="currentColor"`，作为 `<img>` 引用会解析成黑色、在深色主题下不可见；由 `src/logos.mjs` 内联为
  `<svg class="text-icon">`（继承文字色），ECharts 场景则换成主题色后转 data URI。

## 前端依赖（全部 CDN URL，勿复制进仓库）

| 用途                       | URL                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| UI 组件库（与 fount 一致） | `https://cdn.jsdelivr.net/npm/daisyui/daisyui.css` + `themes.css`                                            |
| 原子化 CSS                 | `https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4`                                                        |
| 图表                       | `https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js`                                                 |
| 图标                       | `https://cdn.jsdelivr.net/npm/iconify-icon@2/dist/iconify-icon.min.js`（`<iconify-icon icon="lucide:sun">`） |
| 站点图标                   | `https://steve02081504.github.io/fount/imgs/icon.svg`                                                        |

主题用 daisyUI `data-theme`（`light`/`dark`）；`index.html` 内联脚本在首屏前按 `?theme=` → localStorage →
系统偏好设好，避免闪烁。

## 结构

- `index.html`：daisyUI/Tailwind 骨架 + CDN 引用，几乎没有自定义 CSS。
- `src/rank.mjs`：纯计算（版本号解析、排名、统计、图标 URL），无 DOM，**改排名逻辑只改这里**。
- `src/logos.mjs`：厂商图标取回 / 内联 / 换色（`tintSvg` / `svgDataUri` 为纯函数）。
- `src/i18n.mjs`：语言元数据（代码/母语名/方向）+ 纯函数 + `loadMessages(code)`（按 URL 拉 `locales/<code>.json`）。
- `locales/<code>.json`：fount `src/public/locales/list.csv` 全部 19 条（18 语言 + `emoji`
  伪语言）的文案；键集合需与之一致。
- `src/app.mjs`：取数、ECharts option、语言/主题切换、定时刷新。`?lang=<code>`、`?theme=light|dark` 便于分享与截图。

## 约定

- **版本号从云端实时解析**：`genericVersion` 取模型名里第一个合理数字（跳过 `70B` / `8x22B` / 年份 / ≥100），
  `modelVersion` 名称优先、回退 id；`leadingWord` + `line` 锁定旗舰产品线（如 Google 只取 Gemini，排除 Gemma）。
- 新增追踪厂商：在 `FAMILIES` 加 `{ id, label, provider, color, line }`；`line` 留空则 `detectLine`
  自动取该厂商出现最多的起始词。
- **厂商名单必须人工精选**：models.dev 无热度 / 官方标识，`gpt-6` 被 openai / azure / openrouter / 302ai 等大量转售，
  自动收录会充满聚合商重复项——不要改为「遍历全部厂商」。
- 文案改动：只改 `locales/*.json`；新增键后 `test/i18n.test.mjs` 会要求所有语言补齐。语言文件用 Python 写入（避免 JS
  重排键序）。
- 新增静态文案用 `data-i18n="key"`（文本）/ `data-i18n-title="key"`（title），由 `applyStaticText` 统一填充。

## 验证

```sh
deno task test      # = deno test --allow-read（读 locales/*.json 需要）
deno fmt --check    # 注意：deno.json 里格式化选项是 semiColons，不是 semi
deno lint
```

浏览器渲染验证：本机系统 Chrome 在 `C:\Program Files\Google\Chrome Dev\Application\chrome.exe`。 用临时静态服务器 +
headless 截图：

```pwsh
deno run -A <temp>/serve.mjs <repo> 8123   # 简易静态服务器（.mjs → text/javascript，.json → application/json）
& "C:\Program Files\Google\Chrome Dev\Application\chrome.exe" --headless=new --disable-gpu `
  --hide-scrollbars --window-size=1600,1150 --virtual-time-budget=25000 `
  --screenshot=<temp>/shot.png "http://127.0.0.1:8123/?lang=ja-JP"
```

CDN 脚本需联网；`--lang=xx` 不影响 headless 的 `navigator.language`，验证多语言 / 主题请用 `?lang=`、`?theme=`。

## 部署

GitHub Pages = 分支 `main` 根目录（legacy build），无需 workflow；`gh api repos/<owner>/<repo>/pages` 查看状态。
