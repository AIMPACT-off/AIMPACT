export class DBCircuitBreaker {
  constructor(threshold = 3, timeout = 5000) {
    if (!Number.isInteger(threshold) || threshold < 1) throw new TypeError('threshold must be >= 1');
    if (!Number.isInteger(timeout) || timeout < 0) throw new TypeError('timeout must be >= 0');
    this.failureCount = 0;
    this.threshold = threshold;
    this.timeout = timeout;
    this.state = 'CLOSED';
    this.openedAt = 0;
  }

  async execute(action) {
    if (typeof action !== 'function') throw new TypeError('action must be a function');
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAt < this.timeout) {
        throw new Error('Circuit Breaker is OPEN: DB Access Blocked');
      }
      this.state = 'HALF-OPEN';
    }
    try {
      const result = await action();
      this.failureCount = 0;
      this.state = 'CLOSED';
      this.openedAt = 0;
      return result;
    } catch (err) {
      this.failureCount += 1;
      if (this.failureCount >= this.threshold) {
        this.state = 'OPEN';
        this.openedAt = Date.now();
      }
      throw err;
    }
  }
}
