/**
 * 自定义应用错误类
 *
 * 用于在整个请求处理链中抛出带状态码的错误，
 * 由统一错误处理中间件捕获并转换为标准化 JSON 响应。
 */
export class AppError extends Error {
  /** HTTP 状态码，默认 500 */
  public readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    // 确保 instanceof 在 TypeScript 中正常工作
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
