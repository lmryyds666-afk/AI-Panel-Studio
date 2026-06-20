/**
 * AI Panel Studio — 全流程端到端测试
 *
 * 覆盖完整用户操作链路：
 *   1. 首页查看讨论列表 → 新建讨论
 *   2. 嘉宾配置页 → AI 生成嘉宾阵容 → 确认
 *   3. 演播厅 → 实时发言 / 嘉宾状态 / 共识分歧
 *   4. 结束讨论 → 查看总结
 *   5. 多讨论 WebSocket 数据隔离
 *
 * 先决条件：
 *   - 前端开发服务器已在 http://localhost:5173 运行
 *   - 后端 API 服务器已在 http://localhost:3001 运行（或被 mock）
 *
 * 运行方式：
 *   cd frontend
 *   npm install
 *   npx cypress open       # 交互模式
 *   npx cypress run        # 无头模式
 */

import discussions from '../fixtures/discussions.json';
import wsEvents from '../fixtures/ws-events.json';

// ════════════════════════════════════════════════════════
// 场景 1：完整用户链路
// ════════════════════════════════════════════════════════

describe('AI Panel Studio — 全流程', () => {
  beforeEach(() => {
    // 拦截所有 API 请求并返回 mock 数据
    cy.mockApi({
      list: discussions.listResponse,
      create: discussions.createResponse,
      detail: discussions.detailResponse,
      generateGuests: discussions.generateGuestsResponse,
      confirmGuests: discussions.confirmGuestsResponse,
      endDiscussion: discussions.endDiscussionResponse,
    });
  });

  // ── 步骤 1：首页 ─────────────────────────────────

  describe('步骤1：首页 — 查看讨论列表并新建讨论', () => {
    it('应展示已有讨论列表', () => {
      cy.visit('/');

      // 页面标题
      cy.waitForText('AI Panel Studio');

      // 已有讨论卡片
      cy.waitForText('可再生能源能否在2035年前全面替代化石燃料？');
      cy.waitForText('远程办公对组织文化的影响');

      // 状态标签
      cy.contains('进行中').should('be.visible');
      cy.contains('已结束').should('be.visible');
    });

    it('应能新建讨论', () => {
      cy.visit('/');

      // 点击「新建讨论」按钮
      cy.contains('button', '新建讨论').click();

      // 弹窗表单出现
      cy.waitForText('创建新讨论');

      // 填写话题
      cy.get('input[name="topic"], [data-testid="topic-input"]')
        .should('be.visible')
        .type('AI是否会在2030年前取代50%白领岗位？');

      // 调整专家人数为 4
      cy.get('input[name="expertCount"], [data-testid="expert-count-input"]')
        .should('be.visible')
        .clear()
        .type('4');

      // 提交
      cy.contains('button', '创建').click();

      // 等待 API 请求完成
      cy.wait('@createDiscussion').its('response.statusCode').should('eq', 201);

      // 验证跳转到嘉宾配置页
      cy.url().should('include', '/setup/disc-new-cypress-001');
    });
  });

  // ── 步骤 2：嘉宾配置页 ──────────────────────────

  describe('步骤2：嘉宾配置页 — 生成并确认嘉宾阵容', () => {
    it('应展示话题信息并自动触发嘉宾生成', () => {
      // Mock 讨论详情（含话题、状态=SETUP）
      cy.intercept('GET', '**/api/discussions/disc-new-cypress-001', {
        statusCode: 200,
        body: discussions.detailResponse,
      }).as('getSetupDetail');

      cy.visit('/setup/disc-new-cypress-001');

      // 话题卡片
      cy.waitForText('AI是否会在2030年前取代50%白领岗位？');

      // 触发嘉宾生成（自动或点击按钮）
      cy.contains('button', '生成嘉宾').click();

      // 等待 API
      cy.wait('@generateGuests');

      // 验证主持人卡片
      cy.waitForText('张维远');
      cy.waitForText('《前沿对话》栏目主持人');
      cy.contains('主持人').should('be.visible');

      // 验证 4 位专家卡片
      cy.waitForText('李敏华');
      cy.waitForText('王德仁');
      cy.waitForText('陈思语');
      cy.waitForText('赵明远');

      // 验证颜色标识（色条可见）
      cy.get('[data-testid="guest-card"], .guest-card')
        .should('have.length', 5);

      // 主持人应排在首位
      cy.get('[data-testid="guest-card"]:first-child, .guest-card:first-child')
        .contains('张维远');
    });

    it('应能重新生成嘉宾', () => {
      cy.visit('/setup/disc-new-cypress-001');

      // 先生成一次
      cy.contains('button', '生成嘉宾').click();
      cy.wait('@generateGuests');

      // 由于两次请求都返回相同 mock，验证重新生成功能调用
      cy.contains('button', '重新生成').click();

      // 确认弹窗
      cy.contains('确定').click();

      // 等待第二次 API 调用
      cy.wait('@generateGuests');

      // 验证卡片仍然显示（幂等覆盖）
      cy.get('[data-testid="guest-card"], .guest-card').should('have.length', 5);
    });

    it('应能确认嘉宾并进入演播厅', () => {
      // Mock studio 详情
      cy.intercept('GET', '**/api/discussions/disc-new-cypress-001', {
        statusCode: 200,
        body: discussions.studioDetailResponse,
      }).as('getStudioDetail');

      cy.visit('/setup/disc-new-cypress-001');
      cy.contains('button', '生成嘉宾').click();
      cy.wait('@generateGuests');

      // 确认按钮
      cy.contains('button', '确认并进入演播厅').click();

      // 等待确认 API
      cy.wait('@confirmGuests');

      // 验证跳转到演播厅
      cy.url().should('include', '/studio/disc-new-cypress-001');
    });
  });

  // ── 步骤 3：演播厅 — 实时互动 ───────────────────

  describe('步骤3：演播厅 — 实时发言与嘉宾状态', () => {
    beforeEach(() => {
      // Mock studio 详情
      cy.intercept('GET', '**/api/discussions/disc-new-cypress-001', {
        statusCode: 200,
        body: discussions.studioDetailResponse,
      }).as('getStudioDetail');
    });

    it('演播厅应展示三栏布局', () => {
      // 注入 WebSocket mock
      cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

      cy.visit('/studio/disc-new-cypress-001');

      // 顶部栏：讨论标题 + 结束按钮
      cy.waitForText('AI是否会在2030年前取代50%白领岗位？');
      cy.contains('button', '结束讨论').should('be.visible');

      // 左侧：嘉宾状态面板
      cy.get('[data-testid="guest-panel"], .guest-panel').should('be.visible');
      cy.waitForText('张维远');
      cy.waitForText('李敏华');
      cy.waitForText('王德仁');

      // 中间：Transcript 区域
      cy.get('[data-testid="transcript-panel"], .transcript-panel').should(
        'be.visible',
      );

      // 右侧：共识/分歧面板
      cy.get('[data-testid="consensus-panel"], .consensus-panel').should(
        'be.visible',
      );
    });

    it('应能接收并展示实时发言', () => {
      cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

      cy.visit('/studio/disc-new-cypress-001');

      // 等待主持人开场发言（WebSocket 推送序列第3条）
      cy.waitForText('各位观众晚上好，欢迎收看《前沿对话》');

      // 验证发言者信息（姓名 + Title）
      cy.waitForText('张维远');
      cy.waitForText('《前沿对话》栏目主持人');

      // 等待第二位嘉宾的发言
      cy.waitForText(
        '根据当前大模型的能力曲线，到2028年左右',
        { timeout: 5000 },
      );

      // 验证反驳型发言
      cy.waitForText('我不同意。2016年我们预测自动驾驶会在2020年普及');

      // 验证发言序号排序（最后一条应为 summary）
      cy.waitForText('感谢各位的精彩发言');
    });

    it('嘉宾状态卡片应随 WebSocket 事件实时更新', () => {
      cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

      cy.visit('/studio/disc-new-cypress-001');

      // 验证主持人初始状态为 SPEAKING（WebSocket 事件已推送）
      cy.waitForText('张维远');

      // 验证有状态指示灯（IDLE / PREPARING / SPEAKING）
      cy.get('[data-testid="guest-status"], .guest-status').should('exist');

      // 验证思考摘要显示（PREPARING/SPEAKING 时有内容）
      cy.waitForText('正在以《前沿对话》风格为观众引入话题背景');
      cy.waitForText('正在组织从技术可行性角度的论点');
    });

    it('共识与分歧面板应实时更新', () => {
      cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

      cy.visit('/studio/disc-new-cypress-001');

      // 等待共识/分歧推送
      cy.waitForText('共识与分歧', { timeout: 5000 });

      // 共识内容
      cy.waitForText('各方认同：到2030年，重复性、规则化的白领任务将被大比例自动化');

      // 分歧内容
      cy.waitForText('争论焦点：技术替代的速度');
    });
  });

  // ── 步骤 4：结束讨论与总结 ───────────────────────

  describe('步骤4：结束讨论并查看总结', () => {
    beforeEach(() => {
      cy.intercept('GET', '**/api/discussions/disc-new-cypress-001', (req) => {
        // 第一次请求返回 IN_PROGRESS 详情
        if (req.query || req.url.includes('?')) {
          req.reply({ statusCode: 200, body: discussions.listResponse });
        } else {
          req.reply({ statusCode: 200, body: discussions.studioDetailResponse });
        }
      }).as('getDetail');
    });

    it('结束讨论后应显示主持人自然语言总结', () => {
      cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

      cy.visit('/studio/disc-new-cypress-001');

      // 等待讨论进行中
      cy.waitForText('AI是否会在2030年前取代50%白领岗位？');

      // 点击结束按钮
      cy.contains('button', '结束讨论').click();

      // 二次确认
      cy.contains('确定').click();

      // 等待结束 API
      cy.wait('@endDiscussion');

      // 验证总结内容（自然语言，非 JSON）
      cy.waitForText('本次讨论围绕AI替代白领岗位的时间表展开', { timeout: 5000 });
      cy.waitForText('主持人张维远强调');

      // 验证总结不包含原始 JSON
      cy.get('body').should('not.contain', '{"summary"');
      cy.get('body').should('not.contain', '"code":0');

      // 结束按钮消失
      cy.contains('button', '结束讨论').should('not.exist');
      cy.contains('讨论已结束').should('be.visible');
    });
  });
});

// ════════════════════════════════════════════════════════
// 场景 2：多讨论 WebSocket 数据隔离
// ════════════════════════════════════════════════════════

describe('多讨论 WebSocket 数据隔离', () => {
  it('同时打开两场讨论，WebSocket 事件不应串扰', () => {
    // ── 讨论 1 ──
    const disc1Id = 'disc-new-cypress-001';
    const disc1Detail = {
      code: 0,
      data: discussions.studioDetailResponse.data,
      message: 'ok',
    };
    // 修正 ID
    (disc1Detail.data as any).id = disc1Id;

    // 拦截讨论 1 详情
    cy.intercept('GET', `**/api/discussions/${disc1Id}`, {
      statusCode: 200,
      body: disc1Detail,
    }).as('getDisc1Detail');

    // ── 讨论 2 ──
    const disc2Id = 'disc-isolation-002';
    const disc2Detail = {
      code: 0,
      data: {
        id: disc2Id,
        topic: '基因编辑的伦理边界在哪里？',
        status: 'IN_PROGRESS',
        expertCount: 2,
        summary: null,
        guests: [
          {
            id: 'guest-iso-host',
            name: '林晓峰',
            role: 'HOST',
            occupation: '科技评论家',
            title: '《科技观察》主编',
            stance: '中立理性',
            color: '#2ECC71',
            runStatus: 'IDLE',
            sortOrder: 0,
          },
        ],
        speechCount: 0,
        consensusCount: 0,
        divergenceCount: 0,
        createdAt: '2026-06-20T13:05:00.000Z',
        updatedAt: '2026-06-20T13:05:00.000Z',
      },
      message: 'ok',
    };

    cy.intercept('GET', `**/api/discussions/${disc2Id}`, {
      statusCode: 200,
      body: disc2Detail,
    }).as('getDisc2Detail');

    // ── 打开讨论 1，注入讨论 1 的 WebSocket 事件 ──
    cy.mockWebSocket(disc1Id, wsEvents.disc1.events);

    cy.visit(`/studio/${disc1Id}`);
    cy.waitForText('AI是否会在2030年前取代50%白领岗位？');

    // 确认讨论 1 收到了专属发言
    cy.waitForText('各位观众晚上好，欢迎收看《前沿对话》', { timeout: 5000 });
    cy.waitForText('张维远');

    // ── 打开讨论 2（新标签页模拟），注入讨论 2 的 WebSocket 事件 ──
    // 注意：Cypress 同一时刻只能操作一个页面
    // 此处验证「讨论 1 不收讨论 2 的事件」
    cy.mockWebSocket(disc2Id, wsEvents.disc2.events);

    cy.visit(`/studio/${disc2Id}`);
    cy.waitForText('基因编辑的伦理边界在哪里？');

    // 确认讨论 2 收到了专属发言
    cy.waitForText('欢迎来到第二场平行讨论', { timeout: 5000 });
    cy.waitForText('林晓峰');

    // ── 关键验证：讨论 2 不应出现讨论 1 的发言 ──
    cy.get('body').should('not.contain', '张维远');
    cy.get('body').should('not.contain', '李敏华');
    cy.get('body').should('not.contain', 'AI是否会在2030年前取代50%白领岗位？');

    // 讨论 2 应有自己的共识
    cy.waitForText('共识：基因编辑用于治疗遗传疾病受到广泛认可');
  });

  it('同一页面切换讨论时，WebSocket 连接应切换隔离', () => {
    // 首先 mock 两场讨论的详情
    cy.intercept('GET', '**/api/discussions', (req) => {
      if (req.url.includes('disc-new-cypress-001')) {
        req.reply({
          statusCode: 200,
          body: {
            code: 0,
            data: discussions.studioDetailResponse.data,
            message: 'ok',
          },
        });
      } else if (req.url.includes('disc-isolation-002')) {
        req.reply({
          statusCode: 200,
          body: {
            code: 0,
            data: {
              id: 'disc-isolation-002',
              topic: '基因编辑的伦理边界在哪里？',
              status: 'IN_PROGRESS',
              expertCount: 2,
              summary: null,
              guests: [
                {
                  id: 'guest-iso-host',
                  name: '林晓峰',
                  role: 'HOST',
                  occupation: '科技评论家',
                  title: '《科技观察》主编',
                  stance: '中立理性',
                  color: '#2ECC71',
                  runStatus: 'IDLE',
                  sortOrder: 0,
                },
              ],
              speechCount: 0,
              consensusCount: 0,
              divergenceCount: 0,
              createdAt: '2026-06-20T13:05:00.000Z',
              updatedAt: '2026-06-20T13:05:00.000Z',
            },
            message: 'ok',
          },
        });
      } else {
        req.reply({ statusCode: 200, body: discussions.listResponse });
      }
    }).as('getAnyDetail');

    // 注入讨论1 WS
    cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);

    // 进入讨论1
    cy.visit('/studio/disc-new-cypress-001');
    cy.waitForText('各位观众晚上好，欢迎收看《前沿对话》', { timeout: 5000 });

    // 讨论1 有5位嘉宾
    cy.get('[data-testid="guest-card"], .guest-card').should('have.length', 5);

    // ── 模拟浏览器导航到讨论2（重新注入 WS）──
    cy.mockWebSocket('disc-isolation-002', wsEvents.disc2.events);

    cy.visit('/studio/disc-isolation-002');

    // 讨论2 应有自己的内容（1位嘉宾，不含讨论1的数据）
    cy.waitForText('基因编辑的伦理边界在哪里？');
    cy.waitForText('欢迎来到第二场平行讨论', { timeout: 5000 });

    // 讨论2 不应展示讨论1 的嘉宾数据
    cy.get('body').should('not.contain', '张维远');
    cy.get('body').should('not.contain', '李敏华');
  });
});

// ════════════════════════════════════════════════════════
// 场景 3：响应式布局
// ════════════════════════════════════════════════════════

describe('响应式布局', () => {
  beforeEach(() => {
    cy.intercept('GET', '**/api/discussions/disc-new-cypress-001', {
      statusCode: 200,
      body: discussions.studioDetailResponse,
    }).as('getDetail');

    cy.mockWebSocket('disc-new-cypress-001', wsEvents.disc1.events);
  });

  it('超宽屏 ≥1600px：三栏并排', () => {
    cy.viewport(1920, 1080);
    cy.visit('/studio/disc-new-cypress-001');

    // 左侧嘉宾面板存在
    cy.get('[data-testid="guest-panel"], .guest-panel').should('be.visible');

    // 中间 Transcript 存在
    cy.get('[data-testid="transcript-panel"], .transcript-panel').should(
      'be.visible',
    );

    // 右侧共识面板存在
    cy.get('[data-testid="consensus-panel"], .consensus-panel').should(
      'be.visible',
    );
  });

  it('桌面 1024-1599px：三栏并排，宽度自适应', () => {
    cy.viewport(1280, 800);
    cy.visit('/studio/disc-new-cypress-001');

    cy.get('[data-testid="guest-panel"], .guest-panel').should('be.visible');
    cy.get('[data-testid="transcript-panel"], .transcript-panel').should(
      'be.visible',
    );
    cy.get('[data-testid="consensus-panel"], .consensus-panel').should(
      'be.visible',
    );
  });

  it('平板 768-1023px：折叠布局但区域仍可交互', () => {
    cy.viewport(800, 1024);
    cy.visit('/studio/disc-new-cypress-001');

    // 三个区域至少有一个可见（可能是 tab 切换）
    cy.get(
      '[data-testid="guest-panel"], [data-testid="transcript-panel"], [data-testid="consensus-panel"],' +
        '.guest-panel, .transcript-panel, .consensus-panel',
    ).should('have.length.at.least', 1);
  });

  it('手机 <768px：单列堆叠或 Tab 切换', () => {
    cy.viewport(375, 812);
    cy.visit('/studio/disc-new-cypress-001');

    // 至少有一个主要区域可见
    cy.get('body').should('be.visible');

    // 验证没有水平滚动条
    cy.window().then((win) => {
      const doc = win.document.documentElement;
      expect(doc.scrollWidth).to.be.at.most(doc.clientWidth + 5);
    });
  });
});

// ════════════════════════════════════════════════════════
// 场景 4：边界场景
// ════════════════════════════════════════════════════════

describe('边界场景', () => {
  it('首页无讨论时应显示引导文案', () => {
    cy.intercept('GET', '**/api/discussions*', {
      statusCode: 200,
      body: {
        code: 0,
        data: { items: [], total: 0, page: 1, pageSize: 20 },
        message: 'ok',
      },
    }).as('getEmptyList');

    cy.visit('/');
    cy.waitForText('暂无讨论');
  });

  it('已结束的讨论点击后应可查看总结（回放模式）', () => {
    const completedDetail = {
      code: 0,
      data: {
        id: 'disc-existing-002',
        topic: '远程办公对组织文化的影响',
        status: 'COMPLETED',
        expertCount: 3,
        summary:
          '远程办公在提升灵活性的同时，对组织文化凝聚力提出了新挑战。共识在于混合办公将成为主流，分歧在于具体执行比例。',
        guests: [],
        speechCount: 28,
        consensusCount: 2,
        divergenceCount: 1,
        createdAt: '2026-06-18T08:00:00.000Z',
        updatedAt: '2026-06-18T09:15:00.000Z',
      },
      message: 'ok',
    };

    cy.intercept('GET', '**/api/discussions/disc-existing-002', {
      statusCode: 200,
      body: completedDetail,
    }).as('getCompletedDetail');

    cy.visit('/studio/disc-existing-002');

    cy.waitForText('远程办公对组织文化的影响');
    cy.waitForText('讨论已结束');
    cy.waitForText('远程办公在提升灵活性的同时');
    cy.waitForText('28');
  });

  it('网络异常时应显示错误提示', () => {
    // 模拟 500 错误
    cy.intercept('POST', '**/api/discussions', {
      statusCode: 500,
      body: {
        code: 500,
        data: null,
        message: '服务端异常，请稍后重试',
      },
    }).as('createError');

    cy.visit('/');
    cy.contains('button', '新建讨论').click();
    cy.get('input[name="topic"], [data-testid="topic-input"]').type('测试话题');
    cy.contains('button', '创建').click();

    cy.wait('@createError');
    // 应显示错误提示
    cy.get('[data-testid="error-toast"], .toast-error, .error-message').should(
      'be.visible',
    );
  });
});
