/**
 * Cypress E2E 支持入口
 *
 * 引入自定义命令（WebSocket mock、API 拦截快捷方法等）
 */

import './commands';

// 全局 beforeEach：抑制未捕获异常（前后端分离场景下可能有请求未 mock）
Cypress.on('uncaught:exception', (err) => {
  // 打印到控制台供调试，但不阻断测试
  console.error('[E2E] Uncaught exception:', err.message);
  return false;
});
