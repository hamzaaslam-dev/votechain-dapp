/**
 * Public client config (no secrets). Set in Vercel → Environment Variables.
 */
module.exports = (_req, res) => {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
  res.status(200).json({
    ballotAddress: process.env.BALLOT_ADDRESS || "",
    chainId: process.env.CHAIN_ID || "11155111"
  });
};
