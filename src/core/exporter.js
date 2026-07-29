/**
 * 导出功能 — JSON / CSV / wewe-rss 兼容格式
 */

import { getArticles, getMpInfo, exportGroupedByMp } from './storage.js';

/**
 * 导出为 wewe-rss 兼容的 JSON 格式
 * 结构与 wewe-rss 的 Article/Feed 表对齐
 */
export function exportAsWeweRssJson() {
  const groups = exportGroupedByMp();
  const result = {
    feeds: [],
    articles: [],
  };

  for (const [biz, group] of Object.entries(groups)) {
    result.feeds.push({
      id: group.mpInfo.mpId || biz,
      mpName: group.mpInfo.mpName,
      mpCover: group.mpInfo.mpCover,
      mpIntro: group.mpInfo.mpIntro,
    });

    for (const article of group.articles) {
      result.articles.push({
        id: article.id,
        mpId: article.mpId || biz,
        title: article.title,
        picUrl: article.picUrl,
        publishTime: article.publishTime,
      });
    }
  }

  return result;
}

/**
 * 导出为通用 JSON
 */
export function exportAsJson() {
  return {
    mpInfo: getMpInfo(),
    articles: getArticles(),
    exportedAt: new Date().toISOString(),
  };
}

/**
 * 导出为 CSV
 */
export function exportAsCsv() {
  const articles = getArticles();
  const headers = ['标题', '链接', '缩略图', '发布时间', '文章ID', '公众号', '公众号biz'];
  const rows = articles.map(a => [
    csvEscape(a.title),
    csvEscape(a.url),
    csvEscape(a.picUrl),
    a.publishTime ? new Date(a.publishTime * 1000).toISOString().split('T')[0] : '',
    csvEscape(a.id),
    csvEscape(a.mpName),
    csvEscape(a.mpId),
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

/**
 * CSV 字段转义
 */
function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * 下载文件
 */
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 复制到剪贴板
 */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // 降级方案
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  }
}

/**
 * 导出为 wewe-rss JSON 文件
 */
export function downloadWeweRssJson() {
  const data = exportAsWeweRssJson();
  const json = JSON.stringify(data, null, 2);
  const mpName = data.feeds[0]?.mpName || 'mp';
  downloadFile(json, `${mpName}_wewe-rss.json`, 'application/json');
}

/**
 * 导出为通用 JSON 文件
 */
export function downloadJson() {
  const data = exportAsJson();
  const json = JSON.stringify(data, null, 2);
  const mpName = data.mpInfo?.mpName || 'mp';
  downloadFile(json, `${mpName}_articles.json`, 'application/json');
}

/**
 * 导出为 CSV 文件
 */
export function downloadCsv() {
  const csv = exportAsCsv();
  const mpName = getMpInfo()?.mpName || 'mp';
  // 加 BOM 让 Excel 正确识别 UTF-8
  downloadFile('﻿' + csv, `${mpName}_articles.csv`, 'text/csv;charset=utf-8');
}

/**
 * 复制 wewe-rss JSON 到剪贴板
 */
export async function copyWeweRssJson() {
  const data = exportAsWeweRssJson();
  const json = JSON.stringify(data, null, 2);
  return await copyToClipboard(json);
}

/**
 * 生成 wewe-rss tRPC 导入脚本
 * 可以直接在浏览器控制台或 Node.js 中运行
 * 用于批量导入到 wewe-rss
 */
export function generateImportScript(serverUrl = 'http://localhost:4000', authCode = '') {
  const data = exportAsWeweRssJson();

  let script = `// wewe-rss 批量导入脚本
// 服务器: ${serverUrl}
// 使用方法: 在浏览器控制台或 Node.js 中运行

const SERVER_URL = '${serverUrl}';
const AUTH_CODE = '${authCode}';
const headers = { 'Content-Type': 'application/json', 'authorization': AUTH_CODE };

async function trpcCall(procedure, input) {
  const resp = await fetch(SERVER_URL + '/trpc/' + procedure, {
    method: 'POST',
    headers,
    body: JSON.stringify({ json: JSON.stringify(input) }),
  });
  return resp.json();
}

async function main() {
`;

  // 导入 feeds
  for (const feed of data.feeds) {
    script += `  // 添加公众号: ${feed.mpName}\n`;
    script += `  await trpcCall('feed.add', ${JSON.stringify(feed)});\n\n`;
  }

  // 导入 articles
  script += `  // 添加文章 (${data.articles.length} 篇)\n`;
  script += `  for (const article of ${JSON.stringify(data.articles)}) {\n`;
  script += `    await trpcCall('article.add', article);\n`;
  script += `  }\n\n`;

  script += `  console.log('导入完成！共 ${data.feeds.length} 个公众号, ${data.articles.length} 篇文章');\n`;
  script += `}\n\nmain().catch(console.error);\n`;

  return script;
}

/**
 * 下载导入脚本
 */
export function downloadImportScript(serverUrl, authCode) {
  const script = generateImportScript(serverUrl, authCode);
  downloadFile(script, 'wewe-rss-import.js', 'application/javascript');
}
