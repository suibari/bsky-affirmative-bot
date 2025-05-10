export class TimeLogger {
  private startTime: null | number;

  constructor() {
    this.startTime = null;
  }

  tic() {
    this.startTime = Date.now();
  }

  tac() {
    if (!this.startTime) {
      console.error("Call tic() before calling tac()");
      return null;
    }
    const elapsedTime = (Date.now() - this.startTime) / 1000;
    this.startTime = null;
    return elapsedTime;
  }
}
  
export class ExecutionLogger {
  private execCount: number;

  constructor() {
    this.execCount = 0;
  }

  incExecCount() {
    this.execCount++;
  }

  getExecCount() {
    return this.execCount;
  }
}

class PointLogger {
  private point: number;

  constructor() {
    this.point = 0;
  }

  initPoint() {
    this.point = 0;
  }

  addCreate() {
    this.point += 3;
  }

  getPoint() {
    return this.point;
  }
}
export const pointRateLimit = new PointLogger();
