/**
 * 注入的 CSS 样式
 */

export const STYLES = `
  /* ── 收集器浮动面板 ── */
  #wx-mp-collector-panel {
    position: fixed;
    right: 20px;
    top: 80px;
    width: 380px;
    max-height: 600px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
    z-index: 999999;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
    font-size: 14px;
    color: #333;
    overflow: hidden;
    transition: all 0.3s ease;
  }

  #wx-mp-collector-panel.collapsed {
    width: 52px;
    max-height: 52px;
    border-radius: 26px;
    overflow: hidden;
  }

  /* ── 面板头部 ── */
  .wx-mp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: linear-gradient(135deg, #07c160, #06ad56);
    color: #fff;
    cursor: move;
    user-select: none;
  }

  .wx-mp-header .title {
    font-size: 15px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .wx-mp-header .badge {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 10px;
    padding: 1px 8px;
    font-size: 12px;
    font-weight: normal;
  }

  .wx-mp-header .toggle-btn {
    background: none;
    border: none;
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  /* ── 工具栏 ── */
  .wx-mp-toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid #f0f0f0;
    flex-wrap: wrap;
  }

  .wx-mp-toolbar button {
    padding: 6px 12px;
    border-radius: 6px;
    border: 1px solid #d9d9d9;
    background: #fff;
    color: #333;
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .wx-mp-toolbar button:hover {
    border-color: #07c160;
    color: #07c160;
  }

  .wx-mp-toolbar button.primary {
    background: #07c160;
    border-color: #07c160;
    color: #fff;
  }

  .wx-mp-toolbar button.primary:hover {
    background: #06ad56;
  }

  .wx-mp-toolbar button.danger {
    border-color: #ff4d4f;
    color: #ff4d4f;
  }

  .wx-mp-toolbar button.danger:hover {
    background: #ff4d4f;
    color: #fff;
  }

  .wx-mp-toolbar button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* ── 文章列表 ── */
  .wx-mp-article-list {
    max-height: 400px;
    overflow-y: auto;
    padding: 8px 0;
  }

  .wx-mp-article-list::-webkit-scrollbar {
    width: 6px;
  }

  .wx-mp-article-list::-webkit-scrollbar-thumb {
    background: #d9d9d9;
    border-radius: 3px;
  }

  .wx-mp-article-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    border-bottom: 1px solid #f5f5f5;
    transition: background 0.2s;
  }

  .wx-mp-article-item:hover {
    background: #f6ffed;
  }

  .wx-mp-article-item .thumb {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: #f0f0f0;
  }

  .wx-mp-article-item .info {
    flex: 1;
    min-width: 0;
  }

  .wx-mp-article-item .info .name {
    font-size: 13px;
    font-weight: 500;
    color: #333;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .wx-mp-article-item .info .meta {
    font-size: 11px;
    color: #999;
    margin-top: 2px;
  }

  .wx-mp-article-item .new-tag {
    background: #07c160;
    color: #fff;
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 8px;
    flex-shrink: 0;
  }

  /* ── 状态栏 ── */
  .wx-mp-status {
    padding: 8px 16px;
    border-top: 1px solid #f0f0f0;
    font-size: 12px;
    color: #999;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .wx-mp-status .status-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    margin-right: 4px;
  }

  .wx-mp-status .status-dot.active {
    background: #07c160;
    animation: pulse 1.5s infinite;
  }

  .wx-mp-status .status-dot.inactive {
    background: #d9d9d9;
  }

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.4; }
    100% { opacity: 1; }
  }

  /* ── Toast 通知 ── */
  .wx-mp-toast {
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: #333;
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 9999999;
    opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  }

  .wx-mp-toast.show {
    opacity: 1;
  }

  /* ── 设置面板 ── */
  .wx-mp-settings {
    padding: 12px 16px;
    border-bottom: 1px solid #f0f0f0;
  }

  .wx-mp-settings label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #666;
    margin-bottom: 8px;
  }

  .wx-mp-settings input[type="text"] {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid #d9d9d9;
    border-radius: 4px;
    font-size: 12px;
  }

  .wx-mp-settings input[type="text"]:focus {
    border-color: #07c160;
    outline: none;
  }
`;
