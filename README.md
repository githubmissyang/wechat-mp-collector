# 微信公众号文章链接批量收集器

> 由 **[AI架构师之路](https://mp.weixin.qq.com/mp/profile_ext?action=home&__biz=MzIwNDM0NjUyNA==)** 出品 · 聚焦 AI 前沿技术与架构实践

在微信公众号后台 (`mp.weixin.qq.com`) 的「超链接」选择器中，批量抓取文章的标题、缩略图、链接等信息，支持自动翻页，导出为 **wewe-rss** 兼容格式。

## 安装

### 方式一：一键安装（推荐）
点击下方链接，Tampermonkey 会自动识别并安装：

[👉 点击安装脚本](https://raw.githubusercontent.com/githubmissyang/wechat-mp-collector/main/dist/wechat-mp-collector.user.js)

### 方式二：手动安装
1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击 Tampermonkey 图标 → 「添加新脚本」
3. 将 [`dist/wechat-mp-collector.user.js`](dist/wechat-mp-collector.user.js) 的内容粘贴进去
4. 保存

## 使用

1. 登录 [微信公众号后台](https://mp.weixin.qq.com)
2. 进入「内容管理」→「写新文章」→「超链接」
3. 页面右侧会出现 📋 文章链接批量收集器 面板
4. 搜索目标公众号，浏览文章列表
5. 点击 **「开始监听」** — 自动捕获新加载的文章
6. 点击 **「立即收集」** — 手动触发一次收集
7. 点击 **「自动翻页」** — 自动翻页收集所有文章
8. 导出数据：
   - **📦 wewe-rss** — 导出 wewe-rss 兼容的 JSON（可直接导入）
   - **📋 复制JSON** — 复制到剪贴板
   - **📊 CSV** — 导出 CSV 文件

## 数据格式

### wewe-rss 兼容 JSON

```json
{
  "feeds": [
    {
      "id": "MzIwNDM0NjUyNA==",
      "mpName": "AI架构师之路",
      "mpCover": "https://mmbiz.qpic.cn/...",
      "mpIntro": "专注于AI技术..."
    }
  ],
  "articles": [
    {
      "id": "DUW6pxoZlwChDgpfZks1Cg",
      "mpId": "MzIwNDM0NjUyNA==",
      "title": "Vibe Coding众生相...",
      "picUrl": "https://mmbiz.qpic.cn/...",
      "publishTime": 1722211200
    }
  ]
}
```

字段与 wewe-rss 数据库完全对齐：
- `Article.id` ← 文章URL中的 `/s/` 后的参数
- `Article.mpId` ← 公众号 biz (base64)
- `Article.title` ← 文章标题
- `Article.picUrl` ← 缩略图URL
- `Article.publishTime` ← Unix时间戳（秒）

## 功能

| 功能 | 说明 |
|------|------|
| 自动监听 | MutationObserver 监听 DOM 变化，文章列表加载时自动捕获 |
| 手动收集 | 点击按钮立即扫描当前页面 |
| 自动翻页 | 自动点击下一页，每页间随机延迟 2-5s |
| 去重存储 | 以文章ID为唯一键，localStorage 持久化，支持 5000 条 |
| wewe-rss 导出 | JSON 格式与 wewe-rss Article/Feed 表对齐 |
| CSV 导出 | 通用格式，含 BOM 头，Excel 直接打开无乱码 |
| 拖拽面板 | 可拖动、可折叠 |

## 图片防盗链配置

微信图片（`mmbiz.qpic.cn`、`mmbiz.qlogo.cn`）会检查 Referer，非微信来源会返回「此图片来自微信公众平台」占位图。需要在 Nginx 配置图片代理。

### 1Panel / Nginx 配置

在 wewe-rss 对应网站的 Nginx 配置中，`server { }` 块内添加：

```nginx
# 微信图片反防盗链代理
location ~* ^/wx-img/(mmbiz\.qpic\.cn|mmbiz\.qlogo\.cn|wx\.qlogo\.cn|thirdwx\.qlogo\.cn)/(.*)$ {
    set $wx_domain $1;
    set $wx_path $2;
    proxy_pass https://$wx_domain/$wx_path;
    proxy_set_header Referer "https://mp.weixin.qq.com/";
    proxy_set_header Host $wx_domain;
    proxy_ssl_server_name on;
    proxy_cache_valid 200 7d;
    add_header Access-Control-Allow-Origin *;
}
```

### 脚本配置

在面板的「图片代理前缀」填入：`https://你的域名/wx-img`

例如你的 wewe-rss 访问地址是 `https://rss.example.com`，则填：
```
https://rss.example.com/wx-img
```

脚本会自动将图片 URL 从：
```
https://mmbiz.qpic.cn/mmbiz_png/xxx/0?wx_fmt=png
```
转换为：
```
https://rss.example.com/wx-img/mmbiz.qpic.cn/mmbiz_png/xxx/0?wx_fmt=png
```

Nginx 代理时会带上 `Referer: https://mp.weixin.qq.com/`，微信服务器就会返回真实图片。

## 关于

**AI架构师之路** — 聚焦 AI 前沿技术与架构实践，分享实用工具与深度洞察。

微信搜索 **AI架构师之路** 或扫码关注：

![AI架构师之路](https://github.com/githubmissyang/wechat-mp-collector/blob/main/assets/qrcode.png)

## 项目结构

```
src/
├── main.js           # 单文件完整脚本（也是 dist 产物）
├── core/
│   ├── observer.js   # DOM 监听逻辑（模块化参考）
│   ├── parser.js     # 文章列表 DOM 解析
│   ├── storage.js    # localStorage 持久化
│   └── exporter.js   # 导出功能
├── ui/
│   ├── panel.js      # 浮动面板
│   └── styles.js     # CSS 样式
└── utils/
    ├── url.js        # URL 解析
    └── debounce.js   # 防抖/节流
```

## License

MIT
