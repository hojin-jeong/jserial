const attempt = (fn) => {
  try {
    return fn()
  } catch (e) {
    return e
  }
}

module.exports = { attempt }
