/**
 * localStorage 持久化存储
 * 支持跨会话保存数据，以文章ID去重
 */

const STORAGE_KEY = 'wx_mp_collector_data';
const MAX_RECORDS = 5000;

/**
 * 获取所有已存储的文章数据
 * @returns {Object} { mpInfo: {...}, articles: [...] }
 */
export function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { mpInfo: {}, articles: [] };
    return JSON.parse(raw);
  } catch (e) {
    console.error('[MP收集器] 读取存储失败:', e);
    return { mpInfo: {}, articles: [] };
  }
}

/**
 * 保存数据到 localStorage
 */
function saveData(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // 可能是存储空间不足
    console.error('[MP收集器] 保存存储失败:', e);
    // 尝试清理旧数据保留最新的
    if (data.articles.length > MAX_RECORDS) {
      data.articles = data.articles.slice(-MAX_RECORDS);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      } catch (e2) {
        console.error('[MP收集器] 保存仍然失败:', e2);
      }
    }
  }
}

/**
 * 添加文章（自动去重）
 * @param {Array} newArticles - 新文章列表
 * @param {Object} mpInfo - 公众号信息
 * @returns {number} 实际新增的文章数量
 */
export function addArticles(newArticles, mpInfo = {}) {
  const data = loadData();

  // 更新公众号信息
  if (mpInfo.mpName) data.mpInfo = { ...data.mpInfo, ...mpInfo };

  // 建立已有文章ID集合
  const existingIds = new Set(data.articles.map(a => a.id));

  // 过滤出新文章
  const fresh = newArticles.filter(a => a.id && !existingIds.has(a.id));

  // 追加
  data.articles = data.articles.concat(fresh);

  // 按发布时间降序排序
  data.articles.sort((a, b) => (b.publishTime || 0) - (a.publishTime || 0));

  // 超出上限时截断
  if (data.articles.length > MAX_RECORDS) {
    data.articles = data.articles.slice(0, MAX_RECORDS);
  }

  saveData(data);
  return fresh.length;
}

/**
 * 获取已收集的文章数量
 */
export function getArticleCount() {
  return loadData().articles.length;
}

/**
 * 获取所有文章
 */
export function getArticles() {
  return loadData().articles;
}

/**
 * 获取公众号信息
 */
export function getMpInfo() {
  return loadData().mpInfo;
}

/**
 * 清空所有数据
 */
export function clearData() {
  localStorage.removeItem(STORAGE_KEY);
}

/**
 * 按公众号biz分组导出
 * @returns {Object} { [biz]: { mpInfo: {...}, articles: [...] } }
 */
export function exportGroupedByMp() {
  const data = loadData();
  const groups = {};

  for (const article of data.articles) {
    const biz = article.mpId || 'unknown';
    if (!groups[biz]) {
      groups[biz] = {
        mpInfo: {
          mpId: biz,
          mpName: article.mpName || data.mpInfo.mpName || '',
          mpCover: data.mpInfo.mpCover || '',
          mpIntro: data.mpInfo.mpIntro || '',
        },
        articles: [],
      };
    }
    groups[biz].articles.push(article);
  }

  return groups;
}
