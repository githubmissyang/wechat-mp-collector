/**
 * DOM MutationObserver — 监听文章列表变化
 * 在公众号后台「超链接」弹窗中，当文章列表加载/翻页时自动触发解析
 */

import { parseArticleList, parseMpInfo } from './parser.js';
import { addArticles, getArticleCount } from './storage.js';
import { debounce } from '../utils/debounce.js';

let observer = null;
let isCollecting = false;
let onArticleCollected = null; // 回调函数，用于更新UI

/**
 * 设置回调：当收集到新文章时通知 UI
 */
export function setOnArticleCollected(callback) {
  onArticleCollected = callback;
}

/**
 * 开始监听 DOM 变化
 */
export function startObserving() {
  if (observer) {
    console.log('[MP收集器] 已在监听中');
    return;
  }

  isCollecting = true;

  // 监听整个 document body 的变化
  observer = new MutationObserver(debounce((mutations) => {
    if (!isCollecting) return;

    // 检查变化中是否包含文章列表
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // 检查是否是超链接弹窗或文章列表
        if (isArticleListContainer(node) || node.querySelector('[class*="card"]') || node.querySelector('a[href*="mp.weixin.qq.com"]')) {
          collectFromNode(node);
          return; // 防抖后只处理一次
        }
      }
    }

    // 也检查已有DOM中是否有文章列表（可能只是属性变化触发了显示）
    tryCollectFromPage();
  }, 500));

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  console.log('[MP收集器] 开始监听DOM变化');
}

/**
 * 停止监听
 */
export function stopObserving() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isCollecting = false;
  console.log('[MP收集器] 停止监听');
}

/**
 * 检查是否在收集状态
 */
export function isObserving() {
  return isCollecting;
}

/**
 * 判断节点是否是文章列表容器
 */
function isArticleListContainer(node) {
  const cls = node.className || '';
  const isDialog = cls.includes('weui-desktop-dialog') ||
                   cls.includes('dialog') ||
                   cls.includes('modal') ||
                   cls.includes('popover') ||
                   cls.includes('panel');
  return isDialog;
}

/**
 * 从指定节点中收集文章
 */
function collectFromNode(node) {
  // 提取公众号信息
  const mpInfo = parseMpInfo(node);

  // 提取文章列表
  const articles = parseArticleList(node, mpInfo.mpName, mpInfo.mpId);

  if (articles.length > 0) {
    const added = addArticles(articles, mpInfo);
    console.log(`[MP收集器] 发现 ${articles.length} 篇文章，新增 ${added} 篇`);

    // 通知UI
    if (onArticleCollected) {
      onArticleCollected({
        total: getArticleCount(),
        added: added,
        articles: articles,
      });
    }
  }
}

/**
 * 尝试从整个页面中收集文章
 * 用于 MutationObserver 可能漏掉的情况
 */
function tryCollectFromPage() {
  // 查找超链接弹窗
  const dialog = document.querySelector('.weui-desktop-dialog') ||
                 document.querySelector('[class*="dialog"][class*="link"]') ||
                 document.querySelector('[class*="modal"]');

  if (dialog) {
    collectFromNode(dialog);
  }

  // 查找文章列表
  const listContainer = document.querySelector('[class*="article-list"]') ||
                        document.querySelector('[class*="appmsg_list"]') ||
                        document.querySelector('[class*="card_list"]');

  if (listContainer) {
    collectFromNode(listContainer);
  }
}

/**
 * 手动触发一次收集（用于按钮点击）
 */
export function manualCollect() {
  tryCollectFromPage();
  return getArticleCount();
}

/**
 * 自动翻页收集
 * 点击"下一页"按钮，等待加载，继续收集
 * @param {number} maxPages - 最大翻页数，0表示不限
 * @param {Function} onPageDone - 每页完成后的回调
 */
export async function autoPaginate(maxPages = 0, onPageDone = null) {
  let page = 0;

  while (true) {
    if (maxPages > 0 && page >= maxPages) break;

    // 先收集当前页
    const count = manualCollect();
    page++;

    if (onPageDone) onPageDone(page, count);

    // 找"下一页"按钮
    const nextBtn = findNextPageButton();
    if (!nextBtn) {
      console.log('[MP收集器] 没有找到下一页按钮，停止翻页');
      break;
    }

    // 检查按钮是否可点击
    if (nextBtn.disabled || nextBtn.classList.contains('disabled') ||
        nextBtn.getAttribute('aria-disabled') === 'true') {
      console.log('[MP收集器] 已到最后一页');
      break;
    }

    // 模拟点击
    nextBtn.click();
    console.log(`[MP收集器] 翻到第 ${page + 1} 页`);

    // 等待页面加载
    await waitForContentChange(2000, 5000);
  }
}

/**
 * 查找"下一页"按钮
 */
function findNextPageButton() {
  const selectors = [
    '.weui-desktop-pagination .weui-desktop-btn_next',
    '.weui-desktop-pagination a[class*="next"]',
    '.weui-desktop-pagination li:last-child a',
    '.weui-desktop-pagination [class*="next"]',
    'button[class*="next"]',
    'a[class*="next"]',
    '.pagination .next',
    '.ant-pagination-next',
  ];

  for (const sel of selectors) {
    const btn = document.querySelector(sel);
    if (btn) return btn;
  }

  // 通用回退：包含"下一页"或">"文本的按钮
  const allBtns = document.querySelectorAll('button, a, [role="button"]');
  for (const btn of allBtns) {
    const text = btn.textContent.trim();
    if (text === '下一页' || text === 'Next' || text === '›' || text === '»' || text === '>') {
      return btn;
    }
  }

  return null;
}

/**
 * 等待页面内容变化
 */
function waitForContentChange(minMs = 2000, maxMs = 5000) {
  const delay = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}
