import { defineConfig } from 'cypress';

export default defineConfig({
  e2e: {
    // 前端开发服务器地址（启动后再运行 E2E）
    baseUrl: 'http://localhost:5173',

    // 测试文件匹配模式
    specPattern: 'cypress/e2e/**/*.cy.ts',

    // 支持文件路径
    supportFile: 'cypress/support/e2e.ts',

    // 默认视口尺寸（桌面端）
    viewportWidth: 1440,
    viewportHeight: 900,

    // 超时设置
    defaultCommandTimeout: 10000,
    requestTimeout: 15000,
    responseTimeout: 15000,

    // 不自动录制视频（可按需开启）
    video: false,

    // 截图仅在失败时保存
    screenshotOnRunFailure: true,

    // 实验性功能：允许使用 cy.origin 跨域
    experimentalModifyObstructiveThirdPartyCode: true,

    // 重试次数
    retries: {
      runMode: 1,
      openMode: 0,
    },
  },
});
