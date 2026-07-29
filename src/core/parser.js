/**
 * 文章列表 DOM 解析器
 * 在公众号后台「超链接」选择器中，解析文章列表的 DOM 结构
 */

import { extractArticleId, extractBiz, normalizeUrl, isWxArticleUrl } from '../utils/url.js';

/**
 * 解析文章列表中的单篇文章卡片
 * 微信公众号后台的图文列表 DOM 结构可能随版本变化，
 * 这里提供多种选择器策略
 */
const ARTICLE_SELECTORS = [
  // 超链接弹窗中的文章列表项
  '.weui-desktop-dialog__bd .weui-desktop-card',
  '.weui-desktop-dialog__bd .weui-desktop-media-box',
  '.weui-desktop-dialog__bd .media_card',
  // 新版公众号后台
  '.article-list__item',
  '.appmsg_card_list .card_appmsg_inner',
  // 通用回退：任何包含文章链接的列表项
  '.weui-desktop-dialog__bd a[href*="mp.weixin.qq.com"]',
  'a[href*="mp.weixin.qq.com/s"]',
];

const TITLE_SELECTORS = [
  '.weui-desktop-media-box__title',
  '.weui-desktop-card__title',
  '.media_card__title',
  '.appmsg_card_title',
  '.article-list__item-title',
  'h3', 'h4',
  '.title',
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

/**
 * 尝试用多个选择器找到第一个匹配的元素
 */
function querySelectorFirst(parent, selectors) {
  for (const sel of selectors) {
    const el = parent.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * 从文章列表 DOM 中提取所有文章信息
 * @param {Document|Element} container - 文章列表容器
 * @param {string} mpName - 公众号名称（从搜索结果中获取）
 * @param {string} mpBiz - 公众号biz ID
 * @returns {Array} 文章列表
 */
export function parseArticleList(container, mpName = '', mpBiz = '') {
  const articles = [];

  // 策略1：找到所有文章卡片/行
  let cards = [];
  for (const sel of ARTICLE_SELECTORS) {
    const found = container.querySelectorAll(sel);
    if (found.length > 0) {
      cards = Array.from(found);
      break;
    }
  }

  // 如果选择器没找到，尝试更通用的方法
  if (cards.length === 0) {
    cards = findArticleCards(container);
  }

  for (const card of cards) {
    const article = parseSingleCard(card, mpName, mpBiz);
    if (article && article.id && article.title) {
      articles.push(article);
    }
  }

  return articles;
}

/**
 * 通用回退：通过文章链接找到所有文章卡片
 */
function findArticleCards(container) {
  const links = container.querySelectorAll('a[href*="mp.weixin.qq.com"]');
  const cards = [];

  for (const link of links) {
    // 向上找到最近的卡片容器
    const card = link.closest('[class*="card"]') ||
                 link.closest('[class*="item"]') ||
                 link.closest('[class*="media"]') ||
                 link.closest('li') ||
                 link.closest('tr') ||
                 link.parentElement;
    if (card && !cards.includes(card)) {
      cards.push(card);
    }
  }

  return cards;
}

/**
 * 解析单个文章卡片
 */
function parseSingleCard(card, mpName = '', mpBiz = '') {
  // 提取链接
  const linkEl = card.tagName === 'A' ? card :
                 card.querySelector('a[href*="mp.weixin.qq.com"]') ||
                 card.querySelector('a[href*="/s/"]');

  if (!linkEl) return null;

  const href = linkEl.getAttribute('href') || '';
  const url = normalizeUrl(href);

  if (!isWxArticleUrl(url)) return null;

  const articleId = extractArticleId(url);
  if (!articleId) return null;

  // 提取标题
  const titleEl = querySelectorFirst(card, TITLE_SELECTORS);
  let title = '';
  if (titleEl) {
    title = titleEl.textContent.trim();
  } else if (linkEl.textContent.trim()) {
    title = linkEl.textContent.trim();
  } else {
    // 从 card 的文本中找最像标题的文本
    title = card.innerText.split('\n')[0].trim();
  }

  // 提取缩略图
  const thumbEl = querySelectorFirst(card, THUMB_SELECTORS);
  let picUrl = '';
  if (thumbEl) {
    picUrl = thumbEl.getAttribute('data-src') ||
             thumbEl.getAttribute('src') || '';
    picUrl = normalizeUrl(picUrl);
  }

  // 提取发布时间
  const timeEl = querySelectorFirst(card, TIME_SELECTORS);
  let publishTime = 0;
  if (timeEl) {
    publishTime = parseTimeText(timeEl.textContent.trim());
  }

  // 从链接中提取 biz
  const biz = extractBiz(url) || mpBiz;

  return {
    id: articleId,
    mpId: biz,
    title: title,
    picUrl: picUrl,
    publishTime: publishTime,
    url: url,
    mpName: mpName,
  };
}

/**
 * 解析时间文本为 Unix 时间戳
 * 支持格式: "2024-01-15", "2024/1/15", "1月15日", "3天前", etc.
 */
function parseTimeText(text) {
  if (!text) return 0;

  // 尝试匹配 YYYY-MM-DD 或 YYYY/MM/DD
  const dateMatch = text.match(/(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})/);
  if (dateMatch) {
    const d = new Date(parseInt(dateMatch[1]), parseInt(dateMatch[2]) - 1, parseInt(dateMatch[3]));
    return Math.floor(d.getTime() / 1000);
  }

  // 匹配 MM月DD日 (无年份，用当前年)
  const mdMatch = text.match(/(\d{1,2})月(\d{1,2})日/);
  if (mdMatch) {
    const now = new Date();
    const d = new Date(now.getFullYear(), parseInt(mdMatch[1]) - 1, parseInt(mdMatch[2]));
    return Math.floor(d.getTime() / 1000);
  }

  // 匹配 "X天前" / "X小时前"
  const relativeMatch = text.match(/(\d+)\s*(天|小时|分钟)前/);
  if (relativeMatch) {
    const num = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2];
    const now = Date.now();
    let ms = 0;
    if (unit === '天') ms = num * 86400000;
    else if (unit === '小时') ms = num * 3600000;
    else if (unit === '分钟') ms = num * 60000;
    return Math.floor((now - ms) / 1000);
  }

  return 0;
}

/**
 * 从超链接弹窗中提取公众号信息
 * 当搜索公众号后，弹窗顶部会显示公众号名称和头像
 */
export function parseMpInfo(container) {
  // 公众号名称
  const nameEl = container.querySelector('.weui-desktop-dialog__hd .weui-desktop-media-box__title') ||
                 container.querySelector('.weui-desktop-dialog__hd .weui-desktop-card__title') ||
                 container.querySelector('[class*="account"] [class*="name"]') ||
                 container.querySelector('[class*="profile"] [class*="name"]');

  // 公众号头像
  const avatarEl = container.querySelector('.weui-desktop-dialog__hd img[src*="mmbiz.qpic.cn"]') ||
                   container.querySelector('.weui-desktop-dialog__hd img[src*="mmbiz.qlogo.cn"]') ||
                   container.querySelector('[class*="account"] img') ||
                   container.querySelector('[class*="profile"] img');

  // 公众号简介
  const introEl = container.querySelector('.weui-desktop-dialog__hd .weui-desktop-media-box__desc') ||
                  container.querySelector('[class*="account"] [class*="desc"]') ||
                  container.querySelector('[class*="profile"] [class*="desc"]');

  return {
    mpName: nameEl ? nameEl.textContent.trim() : '',
    mpCover: avatarEl ? normalizeUrl(avatarEl.getAttribute('src') || avatarEl.getAttribute('data-src') || '') : '',
    mpIntro: introEl ? introEl.textContent.trim() : '',
  };
}

/**
 * 从当前页面上下文中提取公众号 biz
 */
export function extractBizFromPage() {
  // 尝试从页面脚本中获取
  const scripts = document.querySelectorAll('script');
  for (const script of scripts) {
    const text = script.textContent;
    const match = text.match(/var\s+__biz\s*=\s*"([^"]+)"/) ||
                  text.match(/biz\s*=\s*"([^"]+)"/) ||
                  text.match(/__biz=([^&"']+)/);
    if (match) return match[1];
  }

  // 尝试从 URL 获取
  const urlBiz = extractBiz(window.location.href);
  if (urlBiz) return urlBiz;

  // 尝试从 cookie 获取
  const cookies = document.cookie;
  const cookieMatch = cookies.match(/__biz=([^;]+)/);
  if (cookieMatch) return cookieMatch[1];

  return '';
}
