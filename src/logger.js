class TimeLogger {
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
  
class ExecutionLogger {
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
const point = new PointLogger();

module.exports = {
  TimeLogger,
  ExecutionLogger,
  point
};