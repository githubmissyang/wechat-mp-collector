// ==UserScript==
// @name         微信公众号文章收集器
// @namespace    https://github.com/wechat-mp-collector
// @version      1.0.0
// @description  在公众号后台自动收集文章链接、标题、缩略图，支持导出 wewe-rss 兼容格式
// @author       MP Collector
// @match        https://mp.weixin.qq.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

/**
 * 微信公众号文章收集器
 *
 * 使用方法：
 * 1. 登录微信公众号后台 (mp.weixin.qq.com)
 * 2. 进入「内容管理」→「写新文章」→「超链接」
 * 3. 搜索目标公众号，浏览文章列表
 * 4. 点击面板上的「开始监听」或「立即收集」
 * 5. 导出为 wewe-rss / JSON / CSV
 */

(function () {
  'use strict';

  // ── 配置 ──────────────────────────────────────────
  const CONFIG = {
    STORAGE_KEY: 'wx_mp_collector_data',
    MAX_RECORDS: 5000,
    DEBOUNCE_MS: 500,
    AUTO_PAGE_DELAY_MIN: 2000,
    AUTO_PAGE_DELAY_MAX: 5000,
  };

  // ── URL 工具 ──────────────────────────────────────
  function extractArticleId(url) {
    if (!url) return '';
    const shortMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) return shortMatch[1];
    try {
      const u = new URL(url);
      const biz = u.searchParams.get('__biz') || '';
      const mid = u.searchParams.get('mid') || '';
      const idx = u.searchParams.get('idx') || '';
      const sn = u.searchParams.get('sn') || '';
      if (biz && mid && idx && sn) return `${biz}_${mid}_${idx}_${sn}`;
    } catch (e) { /* ignore */ }
    return '';
  }

  function extractBiz(url) {
    if (!url) return '';
    try {
      return new URL(url).searchParams.get('__biz') || '';
    } catch (e) { return ''; }
  }

  function normalizeUrl(url) {
    if (!url) return '';
    if (url.startsWith('//')) return 'https:' + url;
    if (url.startsWith('/')) return 'https://mp.weixin.qq.com' + url;
    return url;
  }

  function isWxArticleUrl(url) {
    return url && (url.includes('mp.weixin.qq.com/s') || url.includes('mp.weixin.qq.com/cgi-bin/appmsg'));
  }

  // ── DOM 解析器 ────────────────────────────────────
  const ARTICLE_SELECTORS = [
    '.weui-desktop-dialog__bd .weui-desktop-card',
    '.weui-desktop-dialog__bd .weui-desktop-media-box',
    '.weui-desktop-dialog__bd .media_card',
    '.article-list__item',
    '.appmsg_card_list .card_appmsg_inner',
  ];

  const TITLE_SELECTORS = [
    '.weui-desktop-media-box__title',
    '.weui-desktop-card__title',
    '.media_card__title',
    '.appmsg_card_title',
    '.article-list__item-title',
    'h3', 'h4', '.title',
  ];

  const THUMB_SELECTORS = [
    '.weui-desktop-media-box__thumb img',
    '.weui-desktop-card__thumb img',
    '.media_card__thumb img',
    '.appmsg_card_thumb img',
    'img[src*="mmbiz.qpic.cn"]',
    'img[src*="mmbiz.qlogo.cn"]',
    'img',
  ];

  const TIME_SELECTORS = [
    '.weui-desktop-media-box__desc',
    '.weui-desktop-card__desc',
    '.media_card__desc',
    '.appmsg_card_desc',
    '.article-list__item-time',
    'time',
    '.create_time',
    '.weui-desktop-media-box__info',
  ];

  function querySelectorFirst(parent, selectors) {
    for (const sel of selectors) {
      const el = parent.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function parseTimeText(text) {
    if (!text) return 0;
    const dateMatch = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
    if (dateMatch) {
      return Math.floor(new Date(+dateMatch[1], +dateMatch[2] - 1, +dateMatch[3]).getTime() / 1000);
    }
    const mdMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
    if (mdMatch) {
      const now = new Date();
      return Math.floor(new Date(now.getFullYear(), +mdMatch[1] - 1, +mdMatch[2]).getTime() / 1000);
    }
    const relativeMatch = text.match(/(\d+)\s*(天|小时|分钟)前/);
    if (relativeMatch) {
      const num = +relativeMatch[1];
      const unit = relativeMatch[2];
      const ms = unit === '天' ? num * 86400000 : unit === '小时' ? num * 3600000 : num * 60000;
      return Math.floor((Date.now() - ms) / 1000);
    }
    return 0;
  }

  function parseSingleCard(card, mpName, mpBiz) {
    const linkEl = card.tagName === 'A' ? card :
      card.querySelector('a[href*="mp.weixin.qq.com"]') ||
      card.querySelector('a[href*="/s/"]');
    if (!linkEl) return null;

    const href = linkEl.getAttribute('href') || '';
    const url = normalizeUrl(href);
    if (!isWxArticleUrl(url)) return null;

    const articleId = extractArticleId(url);
    if (!articleId) return null;

    const titleEl = querySelectorFirst(card, TITLE_SELECTORS);
    let title = titleEl ? titleEl.textContent.trim() : linkEl.textContent.trim() || card.innerText.split('\n')[0].trim();

    const thumbEl = querySelectorFirst(card, THUMB_SELECTORS);
    let picUrl = thumbEl ? normalizeUrl(thumbEl.getAttribute('data-src') || thumbEl.getAttribute('src') || '') : '';

    const timeEl = querySelectorFirst(card, TIME_SELECTORS);
    let publishTime = timeEl ? parseTimeText(timeEl.textContent.trim()) : 0;

    const biz = extractBiz(url) || mpBiz;

    return { id: articleId, mpId: biz, title, picUrl, publishTime, url, mpName: mpName };
  }

  function parseArticleList(container, mpName, mpBiz) {
    const articles = [];
    let cards = [];
    for (const sel of ARTICLE_SELECTORS) {
      const found = container.querySelectorAll(sel);
      if (found.length > 0) { cards = Array.from(found); break; }
    }
    if (cards.length === 0) {
      const links = container.querySelectorAll('a[href*="mp.weixin.qq.com"]');
      for (const link of links) {
        const card = link.closest('[class*="card"]') || link.closest('[class*="item"]') ||
          link.closest('[class*="media"]') || link.closest('li') || link.closest('tr') || link.parentElement;
        if (card && !cards.includes(card)) cards.push(card);
      }
    }
    for (const card of cards) {
      const article = parseSingleCard(card, mpName, mpBiz);
      if (article && article.id && article.title) articles.push(article);
    }
    return articles;
  }

  function parseMpInfo(container) {
    const nameEl = container.querySelector('.weui-desktop-dialog__hd .weui-desktop-media-box__title') ||
      container.querySelector('[class*="account"] [class*="name"]') ||
      container.querySelector('[class*="profile"] [class*="name"]');
    const avatarEl = container.querySelector('.weui-desktop-dialog__hd img[src*="mmbiz.qpic.cn"]') ||
      container.querySelector('.weui-desktop-dialog__hd img[src*="mmbiz.qlogo.cn"]') ||
      container.querySelector('[class*="account"] img') ||
      container.querySelector('[class*="profile"] img');
    const introEl = container.querySelector('.weui-desktop-dialog__hd .weui-desktop-media-box__desc') ||
      container.querySelector('[class*="account"] [class*="desc"]') ||
      container.querySelector('[class*="profile"] [class*="desc"]');
    return {
      mpName: nameEl ? nameEl.textContent.trim() : '',
      mpCover: avatarEl ? normalizeUrl(avatarEl.getAttribute('src') || avatarEl.getAttribute('data-src') || '') : '',
      mpIntro: introEl ? introEl.textContent.trim() : '',
    };
  }

  // ── 存储 ──────────────────────────────────────────
  function loadData() {
    try {
      const raw = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (!raw) return { mpInfo: {}, articles: [] };
      return JSON.parse(raw);
    } catch (e) { return { mpInfo: {}, articles: [] }; }
  }

  function saveData(data) {
    try {
      if (data.articles.length > CONFIG.MAX_RECORDS) {
        data.articles = data.articles.slice(-CONFIG.MAX_RECORDS);
      }
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (e) { console.error('[MP收集器] 保存失败:', e); }
  }

  function addArticles(newArticles, mpInfo) {
    const data = loadData();
    if (mpInfo && mpInfo.mpName) data.mpInfo = { ...data.mpInfo, ...mpInfo };
    const existingIds = new Set(data.articles.map(a => a.id));
    const fresh = newArticles.filter(a => a.id && !existingIds.has(a.id));
    data.articles = data.articles.concat(fresh);
    data.articles.sort((a, b) => (b.publishTime || 0) - (a.publishTime || 0));
    saveData(data);
    return fresh.length;
  }

  function getArticleCount() { return loadData().articles.length; }
  function getArticles() { return loadData().articles; }
  function getMpInfo() { return loadData().mpInfo; }
  function clearData() { localStorage.removeItem(CONFIG.STORAGE_KEY); }

  // ── 导出 ──────────────────────────────────────────
  function exportGroupedByMp() {
    const data = loadData();
    const groups = {};
    for (const article of data.articles) {
      const biz = article.mpId || 'unknown';
      if (!groups[biz]) {
        groups[biz] = {
          mpInfo: { mpId: biz, mpName: article.mpName || data.mpInfo.mpName || '', mpCover: data.mpInfo.mpCover || '', mpIntro: data.mpInfo.mpIntro || '' },
          articles: [],
        };
      }
      groups[biz].articles.push(article);
    }
    return groups;
  }

  function exportAsWeweRssJson() {
    const groups = exportGroupedByMp();
    const result = { feeds: [], articles: [] };
    for (const [biz, group] of Object.entries(groups)) {
      result.feeds.push({ id: group.mpInfo.mpId || biz, mpName: group.mpInfo.mpName, mpCover: group.mpInfo.mpCover, mpIntro: group.mpInfo.mpIntro });
      for (const a of group.articles) {
        result.articles.push({ id: a.id, mpId: a.mpId || biz, title: a.title, picUrl: a.picUrl, publishTime: a.publishTime });
      }
    }
    return result;
  }

  function exportAsCsv() {
    const articles = getArticles();
    const headers = ['标题', '链接', '缩略图', '发布时间', '文章ID', '公众号', '公众号biz'];
    const rows = articles.map(a => [
      csvEscape(a.title), csvEscape(a.url), csvEscape(a.picUrl),
      a.publishTime ? new Date(a.publishTime * 1000).toISOString().split('T')[0] : '',
      csvEscape(a.id), csvEscape(a.mpName), csvEscape(a.mpId),
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  function csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) return '"' + str.replace(/"/g, '""') + '"';
    return str;
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function copyToClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta); return ok;
    }
  }

  // ── Observer ──────────────────────────────────────
  let observer = null;
  let isCollecting = false;
  let onArticleCollected = null;

  function startObserving() {
    if (observer) return;
    isCollecting = true;
    let debounceTimer = null;

    observer = new MutationObserver((mutations) => {
      if (!isCollecting) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (isArticleListContainer(node) || node.querySelector('[class*="card"]') || node.querySelector('a[href*="mp.weixin.qq.com"]')) {
              collectFromNode(node);
              return;
            }
          }
        }
        tryCollectFromPage();
      }, CONFIG.DEBOUNCE_MS);
    });

    observer.observe(document.body, { childList: true, subtree: true });
    console.log('[MP收集器] 开始监听');
  }

  function stopObserving() {
    if (observer) { observer.disconnect(); observer = null; }
    isCollecting = false;
    console.log('[MP收集器] 停止监听');
  }

  function isObserving() { return isCollecting; }

  function isArticleListContainer(node) {
    const cls = node.className || '';
    return cls.includes('weui-desktop-dialog') || cls.includes('dialog') || cls.includes('modal') || cls.includes('popover');
  }

  function collectFromNode(node) {
    const mpInfo = parseMpInfo(node);
    const articles = parseArticleList(node, mpInfo.mpName, mpInfo.mpId);
    if (articles.length > 0) {
      const added = addArticles(articles, mpInfo);
      console.log(`[MP收集器] 发现 ${articles.length} 篇，新增 ${added} 篇`);
      if (onArticleCollected) onArticleCollected({ total: getArticleCount(), added, articles });
    }
  }

  function tryCollectFromPage() {
    const dialog = document.querySelector('.weui-desktop-dialog') || document.querySelector('[class*="dialog"][class*="link"]') || document.querySelector('[class*="modal"]');
    if (dialog) collectFromNode(dialog);
    const list = document.querySelector('[class*="article-list"]') || document.querySelector('[class*="appmsg_list"]') || document.querySelector('[class*="card_list"]');
    if (list) collectFromNode(list);
  }

  function manualCollect() {
    tryCollectFromPage();
    return getArticleCount();
  }

  async function autoPaginate(maxPages, onPageDone) {
    let page = 0;
    while (true) {
      if (maxPages > 0 && page >= maxPages) break;
      const count = manualCollect();
      page++;
      if (onPageDone) onPageDone(page, count);

      const nextBtn = findNextPageButton();
      if (!nextBtn || nextBtn.disabled || nextBtn.classList.contains('disabled') || nextBtn.getAttribute('aria-disabled') === 'true') break;

      nextBtn.click();
      const delay = Math.floor(Math.random() * (CONFIG.AUTO_PAGE_DELAY_MAX - CONFIG.AUTO_PAGE_DELAY_MIN + 1)) + CONFIG.AUTO_PAGE_DELAY_MIN;
      await new Promise(r => setTimeout(r, delay));
    }
  }

  function findNextPageButton() {
    const selectors = [
      '.weui-desktop-pagination .weui-desktop-btn_next',
      '.weui-desktop-pagination a[class*="next"]',
      '.weui-desktop-pagination li:last-child a',
      '.weui-desktop-pagination [class*="next"]',
      'button[class*="next"]', 'a[class*="next"]',
      '.pagination .next', '.ant-pagination-next',
    ];
    for (const sel of selectors) {
      const btn = document.querySelector(sel);
      if (btn) return btn;
    }
    const allBtns = document.querySelectorAll('button, a, [role="button"]');
    for (const btn of allBtns) {
      const text = btn.textContent.trim();
      if (text === '下一页' || text === 'Next' || text === '›' || text === '»' || text === '>') return btn;
    }
    return null;
  }

  // ── UI 面板 ───────────────────────────────────────
  const STYLES = `
    #wx-mp-collector-panel {
      position: fixed; right: 20px; top: 80px; width: 380px; max-height: 600px;
      background: #fff; border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.15);
      z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', sans-serif;
      font-size: 14px; color: #333; overflow: hidden; transition: all 0.3s ease;
    }
    #wx-mp-collector-panel.collapsed { width: 52px; max-height: 52px; border-radius: 26px; overflow: hidden; }
    .wx-mp-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; background: linear-gradient(135deg, #07c160, #06ad56); color: #fff; cursor: move; user-select: none; }
    .wx-mp-header .title { font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
    .wx-mp-header .badge { background: rgba(255,255,255,0.3); border-radius: 10px; padding: 1px 8px; font-size: 12px; font-weight: normal; }
    .wx-mp-header .toggle-btn { background: none; border: none; color: #fff; font-size: 18px; cursor: pointer; padding: 0 4px; }
    .wx-mp-toolbar { display: flex; gap: 8px; padding: 10px 16px; border-bottom: 1px solid #f0f0f0; flex-wrap: wrap; }
    .wx-mp-toolbar button { padding: 6px 12px; border-radius: 6px; border: 1px solid #d9d9d9; background: #fff; color: #333; font-size: 12px; cursor: pointer; transition: all 0.2s; white-space: nowrap; }
    .wx-mp-toolbar button:hover { border-color: #07c160; color: #07c160; }
    .wx-mp-toolbar button.primary { background: #07c160; border-color: #07c160; color: #fff; }
    .wx-mp-toolbar button.primary:hover { background: #06ad56; }
    .wx-mp-toolbar button.danger { border-color: #ff4d4f; color: #ff4d4f; }
    .wx-mp-toolbar button.danger:hover { background: #ff4d4f; color: #fff; }
    .wx-mp-toolbar button:disabled { opacity: 0.5; cursor: not-allowed; }
    .wx-mp-article-list { max-height: 350px; overflow-y: auto; padding: 8px 0; }
    .wx-mp-article-list::-webkit-scrollbar { width: 6px; }
    .wx-mp-article-list::-webkit-scrollbar-thumb { background: #d9d9d9; border-radius: 3px; }
    .wx-mp-article-item { display: flex; align-items: center; gap: 10px; padding: 8px 16px; border-bottom: 1px solid #f5f5f5; transition: background 0.2s; }
    .wx-mp-article-item:hover { background: #f6ffed; }
    .wx-mp-article-item .thumb { width: 48px; height: 48px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: #f0f0f0; }
    .wx-mp-article-item .info { flex: 1; min-width: 0; }
    .wx-mp-article-item .info .name { font-size: 13px; font-weight: 500; color: #333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .wx-mp-article-item .info .meta { font-size: 11px; color: #999; margin-top: 2px; }
    .wx-mp-article-item .new-tag { background: #07c160; color: #fff; font-size: 10px; padding: 1px 6px; border-radius: 8px; flex-shrink: 0; }
    .wx-mp-status { padding: 8px 16px; border-top: 1px solid #f0f0f0; font-size: 12px; color: #999; display: flex; justify-content: space-between; }
    .wx-mp-status .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 4px; }
    .wx-mp-status .status-dot.active { background: #07c160; animation: wx-pulse 1.5s infinite; }
    .wx-mp-status .status-dot.inactive { background: #d9d9d9; }
    @keyframes wx-pulse { 0% { opacity: 1; } 50% { opacity: 0.4; } 100% { opacity: 1; } }
    .wx-mp-toast { position: fixed; top: 20px; left: 50%; transform: translateX(-50%); background: #333; color: #fff; padding: 10px 24px; border-radius: 8px; font-size: 14px; z-index: 9999999; opacity: 0; transition: opacity 0.3s; pointer-events: none; }
    .wx-mp-toast.show { opacity: 1; }
    .wx-mp-settings { padding: 10px 16px; border-bottom: 1px solid #f0f0f0; }
    .wx-mp-settings label { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #666; margin-bottom: 6px; }
    .wx-mp-settings input[type="text"] { flex: 1; padding: 4px 8px; border: 1px solid #d9d9d9; border-radius: 4px; font-size: 12px; }
    .wx-mp-settings input[type="text"]:focus { border-color: #07c160; outline: none; }
  `;

  let panel, listContainer, statusDot, countBadge, statusText, toastEl;
  let recentlyAdded = new Set();

  function initPanel() {
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    panel = document.createElement('div');
    panel.id = 'wx-mp-collector-panel';
    panel.innerHTML = `
      <div class="wx-mp-header">
        <div class="title">📋 MP收集器 <span class="badge" id="wx-mp-count">${getArticleCount()}</span></div>
        <button class="toggle-btn" id="wx-mp-toggle" title="折叠/展开">−</button>
      </div>
      <div class="wx-mp-toolbar" id="wx-mp-toolbar">
        <button class="primary" id="wx-mp-btn-collect">▶ 开始监听</button>
        <button id="wx-mp-btn-once">🔍 立即收集</button>
        <button id="wx-mp-btn-page">📄 自动翻页</button>
      </div>
      <div class="wx-mp-toolbar">
        <button id="wx-mp-btn-json">📦 wewe-rss</button>
        <button id="wx-mp-btn-copy">📋 复制JSON</button>
        <button id="wx-mp-btn-csv">📊 CSV</button>
        <button class="danger" id="wx-mp-btn-clear">🗑️ 清空</button>
      </div>
      <div class="wx-mp-settings" id="wx-mp-settings">
        <label>wewe-rss 地址: <input type="text" id="wx-mp-server" placeholder="http://localhost:4000" value="http://localhost:4000"></label>
        <label>Auth Code: <input type="text" id="wx-mp-auth" placeholder="留空则不需要认证"></label>
      </div>
      <div class="wx-mp-article-list" id="wx-mp-list"></div>
      <div class="wx-mp-status">
        <span><span class="status-dot inactive" id="wx-mp-dot"></span><span id="wx-mp-status-text">未启动</span></span>
        <span id="wx-mp-mp-name">${getMpInfo().mpName || ''}</span>
      </div>
    `;
    document.body.appendChild(panel);

    listContainer = panel.querySelector('#wx-mp-list');
    statusDot = panel.querySelector('#wx-mp-dot');
    countBadge = panel.querySelector('#wx-mp-count');
    statusText = panel.querySelector('#wx-mp-status-text');

    toastEl = document.createElement('div');
    toastEl.className = 'wx-mp-toast';
    document.body.appendChild(toastEl);

    bindEvents();
    renderArticleList();
    makeDraggable(panel, panel.querySelector('.wx-mp-header'));

    // 注册油猴菜单命令
    if (typeof GM_registerMenuCommand === 'function') {
      GM_registerMenuCommand('📋 打开/关闭面板', () => {
        panel.style.display = panel.style.display === 'none' ? '' : 'none';
      });
    }
  }

  function bindEvents() {
    panel.querySelector('#wx-mp-toggle').addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      panel.querySelector('#wx-mp-toggle').textContent = panel.classList.contains('collapsed') ? '+' : '−';
    });

    panel.querySelector('#wx-mp-btn-collect').addEventListener('click', function () {
      if (isObserving()) {
        stopObserving();
        this.textContent = '▶ 开始监听';
        this.classList.add('primary');
        statusDot.className = 'status-dot inactive';
        statusText.textContent = '已暂停';
      } else {
        startObserving();
        this.textContent = '⏸ 停止监听';
        this.classList.remove('primary');
        statusDot.className = 'status-dot active';
        statusText.textContent = '监听中...';
      }
    });

    panel.querySelector('#wx-mp-btn-once').addEventListener('click', () => {
      manualCollect();
      showToast(`已收集，共 ${getArticleCount()} 篇`);
      renderArticleList();
      updateCount();
    });

    panel.querySelector('#wx-mp-btn-page').addEventListener('click', async function () {
      this.disabled = true;
      this.textContent = '⏳ 翻页中...';
      if (!isObserving()) startObserving();
      await autoPaginate(0, (page, count) => {
        statusText.textContent = `第 ${page} 页 / ${count} 篇`;
        renderArticleList();
        updateCount();
      });
      this.disabled = false;
      this.textContent = '📄 自动翻页';
      statusText.textContent = '翻页完成';
      showToast(`翻页完成，共 ${getArticleCount()} 篇`);
    });

    panel.querySelector('#wx-mp-btn-json').addEventListener('click', () => {
      const data = exportAsWeweRssJson();
      const json = JSON.stringify(data, null, 2);
      const name = data.feeds[0]?.mpName || 'mp';
      downloadFile(json, `${name}_wewe-rss.json`, 'application/json');
      showToast('已下载 wewe-rss JSON');
    });

    panel.querySelector('#wx-mp-btn-copy').addEventListener('click', async () => {
      const data = exportAsWeweRssJson();
      const json = JSON.stringify(data, null, 2);
      const ok = await copyToClipboard(json);
      showToast(ok ? '已复制到剪贴板' : '复制失败');
    });

    panel.querySelector('#wx-mp-btn-csv').addEventListener('click', () => {
      const csv = exportAsCsv();
      const name = getMpInfo()?.mpName || 'mp';
      downloadFile('﻿' + csv, `${name}_articles.csv`, 'text/csv;charset=utf-8');
      showToast('已下载 CSV');
    });

    panel.querySelector('#wx-mp-btn-clear').addEventListener('click', () => {
      if (confirm('确定要清空所有已收集的数据吗？')) {
        clearData();
        renderArticleList();
        updateCount();
        showToast('已清空');
      }
    });

    onArticleCollected = (result) => {
      for (const a of result.articles) recentlyAdded.add(a.id);
      renderArticleList();
      updateCount();
      showToast(`新增 ${result.added} 篇，共 ${result.total} 篇`);
    };
  }

  function renderArticleList() {
    const articles = getArticles();
    const display = articles.slice(0, 50);
    listContainer.innerHTML = display.map(a => `
      <div class="wx-mp-article-item">
        ${a.picUrl ? `<img class="thumb" src="${a.picUrl}" onerror="this.style.display='none'" loading="lazy">` : '<div class="thumb"></div>'}
        <div class="info">
          <div class="name" title="${escapeHtml(a.title)}">${escapeHtml(a.title)}</div>
          <div class="meta">${escapeHtml(a.mpName || '')} ${a.publishTime ? '· ' + formatDate(a.publishTime) : ''}</div>
        </div>
        ${recentlyAdded.has(a.id) ? '<span class="new-tag">新</span>' : ''}
      </div>
    `).join('');
    if (articles.length > 50) {
      listContainer.innerHTML += `<div style="text-align:center; padding:8px; color:#999; font-size:12px;">还有 ${articles.length - 50} 篇未显示...</div>`;
    }
    if (articles.length === 0) {
      listContainer.innerHTML = '<div style="text-align:center; padding:20px; color:#999;">暂无数据<br><small>在公众号后台点「超链接」搜索公众号</small></div>';
    }
    setTimeout(() => { recentlyAdded.clear(); }, 3000);
  }

  function updateCount() { countBadge.textContent = getArticleCount(); }

  function showToast(msg, duration = 2000) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), duration);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function makeDraggable(el, handle) {
    let isDragging = false, startX, startY, iL, iT;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON') return;
      isDragging = true; startX = e.clientX; startY = e.clientY;
      const r = el.getBoundingClientRect(); iL = r.left; iT = r.top;
      el.style.transition = 'none';
    });
    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      el.style.left = iL + e.clientX - startX + 'px';
      el.style.top = iT + e.clientY - startY + 'px';
      el.style.right = 'auto';
    });
    document.addEventListener('mouseup', () => { isDragging = false; el.style.transition = ''; });
  }

  // ── 启动 ──────────────────────────────────────────
  function init() {
    console.log('[MP收集器] 初始化...');
    // 等页面加载完成
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => setTimeout(initPanel, 1000));
    } else {
      setTimeout(initPanel, 1000);
    }
  }

  init();
})();
