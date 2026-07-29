/**
 * 侧边浮动面板 — 显示已收集的文章列表
 */

import { STYLES } from './styles.js';
import { getArticles, getArticleCount, clearData, getMpInfo } from '../core/storage.js';
import { startObserving, stopObserving, isObserving, manualCollect, autoPaginate, setOnArticleCollected } from '../core/observer.js';
import { downloadWeweRssJson, downloadJson, downloadCsv, copyWeweRssJson, downloadImportScript } from '../core/exporter.js';

let panel = null;
let listContainer = null;
let statusDot = null;
let countBadge = null;
let statusText = null;
let toast = null;
let recentlyAdded = new Set(); // 最近新增的文章ID，用于高亮显示

/**
 * 初始化面板 UI
 */
export function initPanel() {
  // 注入样式
  const styleEl = document.createElement('style');
  styleEl.textContent = STYLES;
  document.head.appendChild(styleEl);

  // 创建面板
  panel = document.createElement('div');
  panel.id = 'wx-mp-collector-panel';
  panel.innerHTML = `
    <div class="wx-mp-header">
      <div class="title">
        📋 MP收集器 <span class="badge" id="wx-mp-count">${getArticleCount()}</span>
      </div>
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
      <label>
        wewe-rss 地址:
        <input type="text" id="wx-mp-server" placeholder="http://localhost:4000" value="http://localhost:4000">
      </label>
      <label>
        Auth Code:
        <input type="text" id="wx-mp-auth" placeholder="留空则不需要认证">
      </label>
    </div>
    <div class="wx-mp-article-list" id="wx-mp-list"></div>
    <div class="wx-mp-status">
      <span><span class="status-dot inactive" id="wx-mp-dot"></span><span id="wx-mp-status-text">未启动</span></span>
      <span id="wx-mp-mp-name">${getMpInfo().mpName || ''}</span>
    </div>
  `;

  document.body.appendChild(panel);

  // 缓存元素引用
  listContainer = panel.querySelector('#wx-mp-list');
  statusDot = panel.querySelector('#wx-mp-dot');
  countBadge = panel.querySelector('#wx-mp-count');
  statusText = panel.querySelector('#wx-mp-status-text');

  // 绑定事件
  bindEvents();

  // 渲染已有数据
  renderArticleList();

  // 设置回调
  setOnArticleCollected(onCollected);

  // 添加 Toast
  toast = document.createElement('div');
  toast.className = 'wx-mp-toast';
  document.body.appendChild(toast);

  // 拖拽
  makeDraggable(panel, panel.querySelector('.wx-mp-header'));
}

/**
 * 绑定按钮事件
 */
function bindEvents() {
  // 折叠/展开
  panel.querySelector('#wx-mp-toggle').addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    panel.querySelector('#wx-mp-toggle').textContent = panel.classList.contains('collapsed') ? '+' : '−';
  });

  // 开始/停止监听
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

  // 立即收集
  panel.querySelector('#wx-mp-btn-once').addEventListener('click', () => {
    const count = manualCollect();
    showToast(`已收集，共 ${count} 篇`);
    renderArticleList();
    updateCount();
  });

  // 自动翻页
  panel.querySelector('#wx-mp-btn-page').addEventListener('click', async function () {
    this.disabled = true;
    this.textContent = '⏳ 翻页中...';

    if (!isObserving()) {
      startObserving();
    }

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

  // 导出 wewe-rss JSON
  panel.querySelector('#wx-mp-btn-json').addEventListener('click', () => {
    downloadWeweRssJson();
    showToast('已下载 wewe-rss JSON');
  });

  // 复制 JSON
  panel.querySelector('#wx-mp-btn-copy').addEventListener('click', async () => {
    const ok = await copyWeweRssJson();
    showToast(ok ? '已复制到剪贴板' : '复制失败');
  });

  // 导出 CSV
  panel.querySelector('#wx-mp-btn-csv').addEventListener('click', () => {
    downloadCsv();
    showToast('已下载 CSV');
  });

  // 清空
  panel.querySelector('#wx-mp-btn-clear').addEventListener('click', () => {
    if (confirm('确定要清空所有已收集的数据吗？')) {
      clearData();
      renderArticleList();
      updateCount();
      showToast('已清空');
    }
  });
}

/**
 * 渲染文章列表
 */
function renderArticleList() {
  const articles = getArticles();
  // 只显示最近50条
  const display = articles.slice(0, 50);

  listContainer.innerHTML = display.map(a => `
    <div class="wx-mp-article-item">
      ${a.picUrl ? `<img class="thumb" src="${a.picUrl}" onerror="this.style.display='none'" loading="lazy">` : '<div class="thumb"></div>'}
      <div class="info">
        <div class="name" title="${escapeHtml(a.title)}">${escapeHtml(a.title)}</div>
        <div class="meta">${a.mpName || ''} ${a.publishTime ? '· ' + formatDate(a.publishTime) : ''}</div>
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

  // 3秒后清除"新"标签
  setTimeout(() => {
    recentlyAdded.clear();
  }, 3000);
}

/**
 * 更新计数
 */
function updateCount() {
  countBadge.textContent = getArticleCount();
}

/**
 * 收集回调
 */
function onCollected(result) {
  // 标记新增
  for (const a of result.articles) {
    recentlyAdded.add(a.id);
  }
  renderArticleList();
  updateCount();
  showToast(`新增 ${result.added} 篇，共 ${result.total} 篇`);
}

/**
 * Toast 通知
 */
function showToast(msg, duration = 2000) {
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}

/**
 * HTML 转义
 */
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * 格式化时间戳
 */
function formatDate(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * 拖拽功能
 */
function makeDraggable(el, handle) {
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  handle.addEventListener('mousedown', (e) => {
    if (e.target.tagName === 'BUTTON') return; // 不拦截按钮点击
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = el.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    el.style.transition = 'none';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    el.style.left = initialLeft + dx + 'px';
    el.style.top = initialTop + dy + 'px';
    el.style.right = 'auto';
  });

  document.addEventListener('mouseup', () => {
    isDragging = false;
    el.style.transition = '';
  });
}
