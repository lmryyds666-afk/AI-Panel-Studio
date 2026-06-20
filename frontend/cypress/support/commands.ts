/**
 * Cypress 自定义命令
 *
 * 提供：
 *   1. cy.mockApi()       — 批量拦截 RESTful API 请求
 *   2. cy.mockWebSocket() — 模拟 WebSocket 推送流
 *   3. cy.waitForText()   — 等待指定文本出现在页面中
 */

// ─── 类型声明（扩展 Cypress 全局类型）─────────────────

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * 批量拦截 API 请求，返回 mock 数据
       * @param mocks - key 为 URL 路径片段，value 为返回数据
       */
      mockApi(mocks: Record<string, object>): Chainable<void>;

      /**
       * 模拟 WebSocket 消息推送队列
       * @param events  - 事件数组（按时间顺序）
       * @param interval - 推送间隔 ms
       */
      mockWebSocket(
        discussionId: string,
        events: object[],
        interval?: number,
      ): Chainable<void>;

      /**
       * 等待页面中出现指定文本
       */
      waitForText(
        text: string,
        options?: { timeout?: number; selector?: string },
      ): Chainable<void>;
    }
  }
}

// ─── cy.mockApi ──────────────────────────────────────

Cypress.Commands.add('mockApi', (mocks: Record<string, object>) => {
  // 首页列表
  if (mocks.list) {
    cy.intercept('GET', '**/api/discussions?*', {
      statusCode: 200,
      body: mocks.list,
    }).as('getList');
    cy.intercept('GET', '**/api/discussions', {
      statusCode: 200,
      body: mocks.list,
    }).as('getListNoFilter');
  }

  // 创建讨论
  if (mocks.create) {
    cy.intercept('POST', '**/api/discussions', (req) => {
      // 仅拦截不带子路径的 POST /api/discussions
      if (req.url.match(/\/api\/discussions\/?$/)) {
        req.reply({ statusCode: 201, body: mocks.create });
      }
    }).as('createDiscussion');
  }

  // 讨论详情
  if (mocks.detail) {
    cy.intercept(
      'GET',
      '**/api/discussions/*',
      (req) => {
        // 排除列表接口（带查询参数的 GET）
        if (!req.url.includes('?') || req.url.includes('discussions/')) {
          req.reply({ statusCode: 200, body: mocks.detail });
        }
      },
    ).as('getDetail');
  }

  // 生成嘉宾
  if (mocks.generateGuests) {
    cy.intercept(
      'POST',
      '**/api/discussions/*/generate-guests',
      { statusCode: 200, body: mocks.generateGuests },
    ).as('generateGuests');
  }

  // 确认嘉宾
  if (mocks.confirmGuests) {
    cy.intercept(
      'POST',
      '**/api/discussions/*/confirm-guests',
      { statusCode: 200, body: mocks.confirmGuests },
    ).as('confirmGuests');
  }

  // 结束讨论
  if (mocks.endDiscussion) {
    cy.intercept(
      'POST',
      '**/api/discussions/*/end',
      { statusCode: 200, body: mocks.endDiscussion },
    ).as('endDiscussion');
  }
});

// ─── cy.mockWebSocket ─────────────────────────────────

/**
 * 通过劫持全局 WebSocket 构造函数，模拟服务端推送事件流。
 *
 * 工作原理：
 *   1. 在页面加载前替换 `window.WebSocket`
 *   2. 客户端 new WebSocket(url) 时，返回一个 mock 对象
 *   3. 按给定时间间隔依次触发 message 事件
 *   4. discussion_id 封装在 URL 路径中，mock 据此过滤事件
 *
 * 使用限制：
 *   - 必须在 cy.visit() 之前调用（拦截发生在页面脚本执行前）
 *   - 仅模拟 message 事件，不模拟 open/close/error
 */
Cypress.Commands.add(
  'mockWebSocket',
  (discussionId: string, events: object[], interval = 200) => {
    // 在页面中注入 mock WebSocket
    cy.window().then((win) => {
      const OriginalWebSocket = win.WebSocket as typeof WebSocket;

      // 只在尚未被替换时替换
      if ((win as any).__wsMocked) return;

      (win as any).__wsMocked = true;

      // 创建 mock WebSocket 类
      class MockWebSocket {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 3;

        url: string;
        readyState = 1; // 立即进入 OPEN 状态
        onopen: ((ev: Event) => void) | null = null;
        onmessage: ((ev: MessageEvent) => void) | null = null;
        onclose: ((ev: CloseEvent) => void) | null = null;
        onerror: ((ev: Event) => void) | null = null;

        private _eventQueue: object[] = [];
        private _timer: ReturnType<typeof setInterval> | null = null;

        constructor(url: string) {
          this.url = url;

          // 提取 URL 中的 discussion_id
          const match = url.match(/\/ws\/discussions\/([a-zA-Z0-9-]+)/);
          const connectedDiscId = match ? match[1] : '';

          // 只推送匹配的 discussion_id 事件，实现数据隔离
          if (connectedDiscId === discussionId) {
            this._eventQueue = [...events];
          }

          // 异步触发 open
          setTimeout(() => {
            this.onopen?.(new Event('open'));
            this._startPush();
          }, 10);
        }

        send(data: string) {
          // E2E 测试中忽略客户端发送的消息
        }

        close() {
          this._stopPush();
          this.readyState = 3;
          this.onclose?.(new CloseEvent('close'));
        }

        private _startPush() {
          if (this._eventQueue.length === 0) return;
          let index = 0;

          this._timer = setInterval(() => {
            if (index >= this._eventQueue.length) {
              this._stopPush();
              return;
            }

            const event = this._eventQueue[index++];
            this.onmessage?.(
              new MessageEvent('message', { data: JSON.stringify(event) }),
            );
          }, interval);
        }

        private _stopPush() {
          if (this._timer) {
            clearInterval(this._timer);
            this._timer = null;
          }
        }
      }

      // 替换全局 WebSocket
      Object.defineProperty(win, 'WebSocket', {
        value: MockWebSocket,
        writable: false,
        configurable: true,
      });
    });
  },
);

// ─── cy.waitForText ───────────────────────────────────

Cypress.Commands.add(
  'waitForText',
  (text: string, options?: { timeout?: number; selector?: string }) => {
    const sel = options?.selector ?? 'body';
    cy.contains(sel, text, { timeout: options?.timeout ?? 10000 }).should(
      'be.visible',
    );
  },
);
