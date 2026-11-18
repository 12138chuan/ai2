# 个人主页 + 小 P 的 MLP 大冒险

姚佳男 · 苏州大学 2026 级 · 人工智能 · 学号 2662404078

亮色极简的个人主页，里面自带「小 P 的 MLP 大冒险」小游戏。纯静态、零依赖。

---

## 结构（这个文件夹是自包含的）

```
home/
├── index.html            个人主页
├── start.bat             双击本地预览（会起一个小服务器）
├── assets/
│   ├── style.css
│   └── thumb-quest.jpg   作品缩略图
└── mlp-quest/            小 P 的 MLP 大冒险（整套，独立可跑）
    ├── index.html
    └── assets/
```

主页里的按钮指向 `mlp-quest/index.html` —— **相对路径、不依赖上级目录**。
只要整个 `home` 文件夹一起移动、一起上传，按钮就一直有效。

---

## 本地打开

**方式 1（推荐）**：双击 `start.bat`，浏览器自动打开 <http://127.0.0.1:8080/>。

**方式 2**：直接双击 `index.html`（大多数浏览器也没问题）。

> 如果点了按钮没反应：多半是只把 `index.html` 单独挪走了，`mlp-quest/` 没跟上。
> 整个文件夹一起动就行，或者用 `start.bat`。

---

## 部署到 GitHub Pages

1. 新建仓库，例如 `me`。
2. 打开 `home` 文件夹，把里面的 **`index.html`、`assets`、`mlp-quest`** 一起拖到仓库根目录。
3. Settings → Pages → Deploy from a branch → `main` / `/ (root)`。
4. 访问 `https://<用户名>.github.io/me/`，点按钮进小站，网址是 `.../me/mlp-quest/`。

---

## 想改点什么

| 想改 | 位置 |
|---|---|
| 姓名 / 学校 / 专业 / 年级 / 学号 | `index.html` 首屏 + 「关于」的 `<dl>` |
| 一句话介绍 | `index.html` 里的 `.lede` |
| 作品卡片 | `index.html` 里的 `.card` |
| 缩略图 | 替换 `assets/thumb-quest.jpg`（建议 960×600） |
| 配色 | `assets/style.css` 顶部 `:root` 的 `--accent` |
| 游戏内容 | `mlp-quest/` 里，说明见它自己的 README |

---

## 说明

本页为《人工智能通识》课程作业。页面不加载任何外部字体、图标、统计脚本，
所有计算都在浏览器本地完成。
