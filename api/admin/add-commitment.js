module.exports = async (req, res) => {
  res.status(410).json({
    ok: false,
    message: "EVM add-commitment removed. Use Phantom on admin.html to call add_eligible on Solana."
  });
};
