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

module.exports = {
  TimeLogger,
  ExecutionLogger
};