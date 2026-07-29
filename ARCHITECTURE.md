# 微信公众号链接收集器 — 篡改猴(Tampermonkey)脚本

## 项目概述

在微信公众号后台 (`mp.weixin.qq.com`) 的"超链接"选择器中，浏览其他公众号文章列表时，
自动抓取文章的标题、缩略图链接、文章URL、发布时间等信息，
支持导出为 wewe-rss 兼容的 JSON 格式，也可导出 CSV。

## 项目结构

```
wechat-mp-collector/
├── src/
│   ├── main.js                  # 脚本入口（UserScript header + 初始化）
│   ├── core/
│   │   ├── observer.js          # DOM MutationObserver — 监听文章列表变化
│   │   ├── parser.js            # 解析文章列表 DOM，提取标题/缩略图/链接/时间
│   │   ├── storage.js           # localStorage 持久化（支持3000+条记录）
│   │   └── exporter.js          # 导出为 JSON / CSV / wewe-rss 格式
│   ├── ui/
│   │   ├── panel.js             # 侧边浮动面板（显示已收集的文章列表）
│   │   ├── toolbar.js           # 工具栏按钮（收集/导出/清空/去重）
│   │   └── styles.js            # 注入的 CSS 样式
│   └── utils/
│       ├── url.js               # URL 解析工具（提取文章id/biz等参数）
│       └── debounce.js          # 防抖/节流
├── dist/
│   └── wechat-mp-collector.user.js   # 构建产物（单文件，可直接安装到篡改猴）
├── build.js                     # 简易构建脚本（合并所有模块为单文件）
├── package.json
└── README.md
```

## 数据模型（与 wewe-rss Article 对齐）

```javascript
// wewe-rss Article 表结构:
// id          String   @id @db.VarChar(255)     — 文章唯一ID (从URL中提取的 s 参数)
// mpId        String   @map("mp_id")            — 公众号ID (biz参数)
// title       String   @map("title")            — 文章标题
// picUrl      String   @map("pic_url")          — 缩略图URL
// publishTime Int      @map("publish_time")     — 发布时间(Unix时间戳)

// wewe-rss Feed 表结构:
// id          String   @id                      — 公众号biz (base64编码)
// mpName      String   @map("mp_name")          — 公众号名称
// mpCover     String   @map("mp_cover")         — 公众号头像URL
// mpIntro     String   @map("mp_intro")         — 公众号简介

{
  // Feed 级别
  "mpId": "MzIwNDM0NjUyNA==",          // 公众号 biz (base64)
  "mpName": "AI架构师之路",              // 公众号名称
  "mpCover": "https://mmbiz.qpic.cn/...", // 公众号头像
  "mpIntro": "专注于AI技术...",           // 公众号简介

  // Article 级别
  "articles": [
    {
      "id": "DUW6pxoZlwChDgpfZks1Cg",       // 文章ID (URL中 /s/ 后的部分)
      "mpId": "MzIwNDM0NjUyNA==",           // 所属公众号biz
      "title": "Vibe Coding众生相...",
      "picUrl": "https://mmbiz.qpic.cn/...",  // 缩略图
      "publishTime": 1722211200,              // Unix时间戳(秒)
      "url": "https://mp.weixin.qq.com/s/DUW6pxoZlwChDgpfZks1Cg"
    }
  ]
}
```

## 核心功能

### 1. 自动收集 (observer.js + parser.js)
- 在公众号后台「写新文章」→「超链接」→ 搜索公众号名 → 浏览文章列表
- MutationObserver 监听 `.weui-desktop-pagination` 和文章列表容器的变化
- 每次翻页/加载新内容时自动解析新出现的文章卡片
- 提取字段：标题、缩略图URL、文章链接、发布时间
- 从文章链接中解析出文章ID和公众号biz

### 2. 手动翻页收集
- 自动点击"下一页"按钮（可选）
- 每页之间随机延迟 2-5 秒，模拟人工操作
- 支持暂停/继续

### 3. 数据去重 (storage.js)
- 以文章ID (URL中的s参数) 作为唯一键
- 自动跳过已收集的文章
- 支持跨会话持久化（localStorage）

### 4. 导出功能 (exporter.js)
- **JSON 格式**：wewe-rss 兼容格式，可直接通过 API 导入
- **CSV 格式**：通用格式，包含标题、链接、缩略图、时间
- **一键复制**：复制到剪贴板
- **下载文件**：保存为 .json 或 .csv 文件

### 5. UI 面板 (panel.js + toolbar.js)
- 右侧浮动面板，显示已收集文章数量和列表
- 工具栏按钮：开始/暂停收集、导出JSON、导出CSV、清空数据
- 实时状态提示

## 技术要点

### 微信公众号后台 DOM 结构
- 文章列表容器：搜索公众号后出现的图文列表
- 每篇文章是一个卡片/行，包含：
  - 标题 (a 标签)
  - 缩略图 (img 标签)
  - 发布时间
  - 文章链接 (href 中包含完整URL)
- 分页器：`.weui-desktop-pagination` 或类似 class

### @match 规则
```
@match https://mp.weixin.qq.com/*
```

### 数据提取方式
1. 文章列表在公众号后台通过 AJAX 加载
2. 监听 DOM 变化比拦截 XHR 更可靠（微信后台API频繁变动）
3. 从链接 URL 中用正则提取文章ID：`/s/([a-zA-Z0-9_-]+)`
4. 公众号 biz 从页面上下文或 URL 参数中获取

### wewe-rss 数据导入
wewe-rss 的 tRPC 接口支持：
- `feed.add` — 添加公众号 (需要 id/biz, mpName, mpCover, mpIntro)
- `article.add` — 添加文章 (需要 id, mpId, title, picUrl, publishTime)
- 需要在请求头带上 `authorization` (AUTH_CODE)

导出的 JSON 可直接通过 tRPC 批量导入，或手动拼接 API 请求。
