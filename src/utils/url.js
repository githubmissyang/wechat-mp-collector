/**
 * URL 解析工具
 * 从微信公众号文章链接中提取关键参数
 */

/**
 * 从文章 URL 中提取文章 ID
 * https://mp.weixin.qq.com/s/DUW6pxoZlwChDgpfZks1Cg → DUW6pxoZlwChDgpfZks1Cg
 * 也兼容带参数的: /s?__biz=MzI...&mid=xxx&idx=1&sn=xxx
 */
export function extractArticleId(url) {
  if (!url) return '';

  // 格式1: /s/XXXX
  const shortMatch = url.match(/\/s\/([a-zA-Z0-9_-]+)/);
  if (shortMatch) return shortMatch[1];

  // 格式2: /s?__biz=xxx&mid=xxx&idx=x&sn=xxx
  try {
    const u = new URL(url);
    const biz = u.searchParams.get('__biz') || '';
    const mid = u.searchParams.get('mid') || '';
    const idx = u.searchParams.get('idx') || '';
    const sn = u.searchParams.get('sn') || '';
    if (biz && mid && idx && sn) {
      return `${biz}_${mid}_${idx}_${sn}`;
    }
  } catch (e) {
    // ignore
  }

  return '';
}

/**
 * 从 URL 中提取公众号 biz (base64 编码的公众号ID)
 */
export function extractBiz(url) {
  if (!url) return '';
  try {
    const u = new URL(url);
    return u.searchParams.get('__biz') || '';
  } catch (e) {
    // 尝试从页面上下文中获取
    return '';
  }
}

/**
 * 规范化微信文章 URL，确保是完整链接
 */
export function normalizeUrl(url) {
  if (!url) return '';
  if (url.startsWith('//')) return 'https:' + url;
  if (url.startsWith('/')) return 'https://mp.weixin.qq.com' + url;
  return url;
}

/**
 * 检查是否是微信公众号文章链接
 */
export function isWxArticleUrl(url) {
  return url && (url.includes('mp.weixin.qq.com/s') || url.includes('mp.weixin.qq.com/cgi-bin/appmsg'));
}
