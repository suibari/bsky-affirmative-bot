function getHalfLength(str) {
  let len = 0;
  let escapeStr = encodeURI(str);
  for (let i = 0; i < escapeStr.length; i++, len++) {
    if (escapeStr.charAt(i) == "%") {
      if (escapeStr.charAt(++i) == "u") {
        i += 3;
        len++;
      }
      i++;
    }
  }
  return len;
}

module.exports.getHalfLength = getHalfLength;