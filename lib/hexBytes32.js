function isBytes32Hex(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(String(value || "").trim());
}

module.exports = { isBytes32Hex };
