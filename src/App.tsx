import { useState, useEffect, useCallback } from "react";
import {
  isConnected,
  getAddress,
  signTransaction,
  requestAccess,
} from "@stellar/freighter-api";
import {
  Horizon,
  TransactionBuilder,
  Operation,
  Asset,
  Networks,
  xdr,
  Transaction,
  Memo,
} from "stellar-sdk";

const HORIZON_URL = "https://horizon-testnet.stellar.org";
const server = new Horizon.Server(HORIZON_URL);

function App() {
  const [pubKey, setPubKey] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [txResult, setTxResult] = useState<{
    type: "success" | "error";
    hash?: string;
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchBalance = useCallback(async (address: string) => {
    try {
      const account = await server.loadAccount(address);
      const xlmBalance = account.balances.find(
        (b) => b.asset_type === "native"
      );
      setBalance(xlmBalance?.balance ?? "0");
    } catch {
      setBalance("0");
      setTxResult({
        type: "error",
        message: "Failed to fetch balance. Make sure your account is funded.",
      });
    }
  }, []);

  const connectWallet = async () => {
    try {
      const { address, error } = await requestAccess();
      if (error || !address) {
        setTxResult({
          type: "error",
          message: error ?? "Please approve the connection in Freighter.",
        });
        return;
      }
      setPubKey(address);
      setTxResult(null);
      await fetchBalance(address);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setTxResult({
        type: "error",
        message:
          err.message ??
          "Freighter not detected. Please install Freighter extension.",
      });
    }
  };

  const disconnectWallet = () => {
    setPubKey(null);
    setBalance(null);
    setTxResult(null);
    setRecipient("");
    setAmount("");
    setMemo("");
  };

  useEffect(() => {
    if (pubKey) {
      fetchBalance(pubKey);
    }
  }, [pubKey, fetchBalance]);

  useEffect(() => {
    isConnected()
      .then(({ isConnected: connected }) => {
        if (connected) {
          getAddress().then(({ address }) => {
            setPubKey(address);
            fetchBalance(address);
          });
        }
      })
      .catch(() => {});
  }, [fetchBalance]);

  const sendXLM = async () => {
    if (!pubKey || !recipient || !amount) return;
    setLoading(true);
    setTxResult(null);

    try {
      const account = await server.loadAccount(pubKey);
      const parsedAmount = amount;

      const tx = new TransactionBuilder(account, {
        fee: "100",
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(
          Operation.payment({
            destination: recipient,
            asset: Asset.native(),
            amount: parsedAmount,
          })
        )
        .addMemo(Memo.text(memo || "Stellar Pay"))
        .setTimeout(180)
        .build();

      const { signedTxXdr } = await signTransaction(
        tx.toEnvelope().toXDR("base64"),
        {
          networkPassphrase: Networks.TESTNET,
        }
      );

      const txEnvelope = xdr.TransactionEnvelope.fromXDR(signedTxXdr, "base64");
      const transaction = new Transaction(txEnvelope, Networks.TESTNET);

      const result = await server.submitTransaction(transaction);
      setTxResult({
        type: "success",
        hash: result.hash,
        message: `Successfully sent ${parsedAmount} XLM!`,
      });
      setRecipient("");
      setAmount("");
      setMemo("");
      await fetchBalance(pubKey);
    } catch (e: unknown) {
      const err = e as { message?: string };
      setTxResult({
        type: "error",
        message: err.message ?? "Transaction failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (addr: string) =>
    `${addr.slice(0, 6)}...${addr.slice(-4)}`;

  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <img src="/logoStellar.png" alt="Stellar" className="logo-img" />
          <h1>Pay</h1>
        </div>
        <p className="subtitle">Simple Payment dApp on Stellar Testnet</p>
        {pubKey ? (
          <div className="wallet-info">
            <span className="badge badge-connected">Connected</span>
            <span className="address">{formatAddress(pubKey)}</span>
            <button className="btn btn-outline" onClick={disconnectWallet}>
              <span className="btn-text">Disconnect</span>
            </button>
          </div>
        ) : (
          <button className="btn btn-primary" onClick={connectWallet}>
            <span className="btn-text">Connect Freighter Wallet</span>
          </button>
        )}
      </header>

      {pubKey && (
        <main className="main">
          <section className="card balance-card">
            <h2>Wallet Balance</h2>
            <div className="balance-value">
              {balance !== null ? (
                <>
                  <span className="balance-amount">{balance}</span>
                  <span className="balance-currency">XLM</span>
                </>
              ) : (
                <span className="loading-text">Loading...</span>
              )}
            </div>
          </section>

          <section className="card send-card">
            <h2>Send XLM</h2>
            <div className="form-group">
              <label htmlFor="recipient">Recipient Address</label>
              <input
                id="recipient"
                type="text"
                placeholder="G..."
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="amount">Amount (XLM)</label>
              <input
                id="amount"
                type="number"
                placeholder="0.0"
                step="0.0000001"
                min="0.0000001"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="memo">Memo (optional)</label>
              <input
                id="memo"
                type="text"
                placeholder="e.g. payment for coffee"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
              />
            </div>
            <button
              className="btn btn-primary btn-full"
              onClick={sendXLM}
              disabled={loading || !recipient || !amount}
            >
              {loading ? <span className="btn-text">Sending...</span> : <span className="btn-text">Send Payment</span>}
            </button>
          </section>

          {txResult && (
            <div className={`result-card ${txResult.type}`}>
              <div className="result-header">
                <span className="result-icon">
                  {txResult.type === "success" ? "\u2713" : "\u2717"}
                </span>
                <span className="result-title">
                  {txResult.type === "success"
                    ? "Transaction Successful"
                    : "Transaction Failed"}
                </span>
              </div>
              <p className="result-message">{txResult.message}</p>
              {txResult.hash && (
                <a
                  className="tx-link"
                  href={`https://stellar.expert/explorer/testnet/tx/${txResult.hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Stellar Expert &rarr;
                </a>
              )}
            </div>
          )}
        </main>
      )}

      {!pubKey && (
        <div className="empty-state">
          <div className="sphere-loader">
            {[...Array(8)].map((_, s) => (
              <div key={s} className={`sphere sphere${s + 1}`} style={{ '--rot': s } as React.CSSProperties}>
                {[...Array(12)].map((_, i) => (
                  <div
                    key={i}
                    className="item"
                    style={{ '--rot-y': i } as React.CSSProperties}
                  />
                ))}
              </div>
            ))}
          </div>
          <h2>Welcome to Stellar Pay</h2>
          <p>
            Connect your Freighter wallet to check your balance and send XLM on
            the Stellar testnet.
          </p>
        </div>
      )}

      <footer className="footer">
        <p>
          Built for Stellar Journey to Mastery &mdash; White Belt Submission
        </p>
      </footer>
    </div>
  );
}

export default App;
