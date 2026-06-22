import { useState, useEffect, useRef, useCallback } from "react";

const APP_ID = 1089; // Deriv demo app ID (works for OAuth testing)
const WS_URL = `wss://ws.binaryws.com/websockets/v3?app_id=${APP_ID}`;

const INDICES = [
  { label: "Volatility 10", symbol: "R_10" },
  { label: "Volatility 25", symbol: "R_25" },
  { label: "Volatility 50", symbol: "R_50" },
  { label: "Volatility 75", symbol: "R_75" },
  { label: "Volatility 100", symbol: "R_100" },
];

const CONTRACT_TYPES = [
  { label: "Differs", value: "DIGITDIFF", winProb: "~90%", payout: "~1.03×" },
  { label: "Matches", value: "DIGITMATCH", winProb: "~10%", payout: "~9×" },
];

function useDerivWS(token) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const [account, setAccount] = useState(null);
  const [balance, setBalance] = useState(null);
  const listeners = useRef({});

  const on = useCallback((key, fn) => { listeners.current[key] = fn; }, []);
  const off = useCallback((key) => { delete listeners.current[key]; }, []);

  const send = useCallback((obj) => {
    if (ws.current && ws.current.readyState === 1) {
      ws.current.send(JSON.stringify(obj));
    }
  }, []);

  useEffect(() => {
    if (!token) return;
    const socket = new WebSocket(WS_URL);
    ws.current = socket;

    socket.onopen = () => {
      setConnected(true);
      socket.send(JSON.stringify({ authorize: token }));
    };

    socket.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.msg_type === "authorize") {
        setAccount(data.authorize);
        socket.send(JSON.stringify({ balance: 1, subscribe: 1 }));
      }
      if (data.msg_type === "balance") {
        setBalance(data.balance);
      }
      Object.values(listeners.current).forEach((fn) => fn(data));
    };

    socket.onclose = () => setConnected(false);
    socket.onerror = () => setConnected(false);

    return () => socket.close();
  }, [token]);

  return { connected, account, balance, send, on, off };
}

function StatCard({ label, value, color }) {
  const colors = {
    green: "#22c55e", red: "#ef4444", amber: "#f59e0b",
    blue: "#3b82f6", default: "inherit"
  };
  return (
    <div style={{
      background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12, padding: "14px 16px", minWidth: 0
    }}>
      <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 600, color: colors[color] || colors.default, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}

function TradeLog({ trades }) {
  const ref = useRef(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = 0; }, [trades.length]);

  if (!trades.length) return (
    <div style={{ color: "#555", fontSize: 13, padding: "20px 0", textAlign: "center" }}>
      No trades yet — connect and start a session
    </div>
  );

  return (
    <div ref={ref} style={{ maxHeight: 280, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
      {trades.map((t, i) => (
        <div key={i} style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "9px 12px",
          borderLeft: `3px solid ${t.won ? "#22c55e" : "#ef4444"}`
        }}>
          <span style={{
            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 4,
            background: t.won ? "rgba(34,197,94,.15)" : "rgba(239,68,68,.15)",
            color: t.won ? "#22c55e" : "#ef4444", minWidth: 44, textAlign: "center"
          }}>{t.won ? "WIN" : "LOSS"}</span>
          <span style={{ fontSize: 13, color: "#aaa", flex: 1 }}>
            {t.type} · Digit {t.digit} · Tick ended {t.lastDigit ?? "—"}
          </span>
          <span style={{ fontSize: 13, color: "#aaa" }}>Step {t.step}</span>
          <span style={{ fontSize: 13, fontWeight: 600, color: t.won ? "#22c55e" : "#ef4444" }}>
            {t.won ? "+" : "-"}${Math.abs(t.profit).toFixed(2)}
          </span>
        </div>
      ))}
    </div>
  );
}

function DigitFrequency({ ticks }) {
  const counts = Array(10).fill(0);
  ticks.forEach(t => { if (t >= 0 && t <= 9) counts[t]++; });
  const total = ticks.length || 1;
  const max = Math.max(...counts, 1);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(10,1fr)", gap: 6 }}>
      {counts.map((c, d) => {
        const pct = ((c / total) * 100).toFixed(1);
        const h = Math.round((c / max) * 48);
        return (
          <div key={d} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
            <div style={{ fontSize: 11, color: "#888" }}>{pct}%</div>
            <div style={{ width: "100%", background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 48, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
              <div style={{ width: "100%", height: h, background: "#3b82f6", borderRadius: "4px 4px 0 0", transition: "height .3s" }} />
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: "#ddd" }}>{d}</div>
          </div>
        );
      })}
    </div>
  );
}

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem("deriv_token") || "");
  const [tokenInput, setTokenInput] = useState("");
  const [index, setIndex] = useState(INDICES[0]);
  const [contractType, setContractType] = useState(CONTRACT_TYPES[0]);
  const [digit, setDigit] = useState(5);
  const [baseStake, setBaseStake] = useState(0.35);
  const [multiplier] = useState(2.1);
  const [maxSteps, setMaxSteps] = useState(5);
  const [takeProfit, setTakeProfit] = useState(10);
  const [stopLoss, setStopLoss] = useState(30);
  const [running, setRunning] = useState(false);
  const [trades, setTrades] = useState([]);
  const [sessionPnl, setSessionPnl] = useState(0);
  const [step, setStep] = useState(0);
  const [currentStake, setCurrentStake] = useState(0.35);
  const [ticks, setTicks] = useState([]);
  const [liveTick, setLiveTick] = useState(null);
  const [status, setStatus] = useState("idle");
  const [pendingContract, setPendingContract] = useState(null);
  const [logs, setLogs] = useState([]);

  const { connected, account, balance, send, on, off } = useDerivWS(token);

  const addLog = (msg, type = "info") => {
    setLogs(prev => [{ msg, type, ts: new Date().toLocaleTimeString() }, ...prev].slice(0, 50));
  };

  const getStake = useCallback((s) => {
    let stake = baseStake;
    for (let i = 0; i < s; i++) stake *= multiplier;
    return parseFloat(stake.toFixed(2));
  }, [baseStake, multiplier]);

  // Subscribe to ticks
  useEffect(() => {
    if (!connected) return;
    send({ ticks: index.symbol, subscribe: 1 });
    on("ticks", (data) => {
      if (data.msg_type === "tick" && data.tick?.symbol === index.symbol) {
        const last = data.tick.quote.toString().slice(-1);
        setLiveTick(data.tick.quote);
        setTicks(prev => [parseInt(last), ...prev].slice(0, 200));
      }
    });
    return () => {
      send({ forget_all: "ticks" });
      off("ticks");
    };
  }, [connected, index, send, on, off]);

  // Contract result listener
  useEffect(() => {
    on("contract", (data) => {
      if (data.msg_type === "proposal_open_contract") {
        const c = data.proposal_open_contract;
        if (c.status === "sold" || c.status === "won" || c.status === "lost") {
          const won = c.status === "won";
          const profit = won ? parseFloat(c.profit) : -parseFloat(c.buy_price);
          const lastDigit = c.exit_tick?.toString().slice(-1);

          setTrades(prev => [{
            won, profit, step: pendingContract?.step ?? 0,
            type: contractType.label, digit, lastDigit,
          }, ...prev]);

          setSessionPnl(prev => {
            const newPnl = parseFloat((prev + profit).toFixed(2));
            if (newPnl >= takeProfit) { addLog(`Take profit hit: +$${newPnl.toFixed(2)}`, "success"); setRunning(false); setStep(0); }
            if (newPnl <= -stopLoss) { addLog(`Stop loss hit: -$${Math.abs(newPnl).toFixed(2)}`, "danger"); setRunning(false); setStep(0); }
            return newPnl;
          });

          if (won) {
            addLog(`WIN — +$${Math.abs(profit).toFixed(2)} | digit ${digit} vs ${lastDigit}`, "success");
            setStep(0);
            setCurrentStake(baseStake);
          } else {
            setStep(prev => {
              const next = prev + 1;
              if (next >= maxSteps) {
                addLog("Max steps reached — session stopped", "danger");
                setRunning(false);
                setStep(0);
                setCurrentStake(baseStake);
                return 0;
              }
              const ns = getStake(next);
              setCurrentStake(ns);
              addLog(`LOSS — next stake $${ns.toFixed(2)} (step ${next + 1})`, "warning");
              return next;
            });
          }
          setPendingContract(null);
          setStatus("idle");
        }
      }

      if (data.msg_type === "buy") {
        if (data.error) {
          addLog(`Buy error: ${data.error.message}`, "danger");
          setStatus("idle");
          setPendingContract(null);
        } else {
          addLog(`Trade placed — contract ${data.buy.contract_id}`, "info");
          send({ proposal_open_contract: 1, contract_id: data.buy.contract_id, subscribe: 1 });
        }
      }
    });
    return () => off("contract");
  }, [connected, send, on, off, digit, contractType, pendingContract, baseStake, maxSteps, takeProfit, stopLoss, getStake]);

  // Auto-trade loop
  useEffect(() => {
    if (!running || !connected || status !== "idle") return;
    const timeout = setTimeout(() => {
      const stake = getStake(step);
      setCurrentStake(stake);
      setStatus("placing");
      setPendingContract({ step });

      send({
        buy: 1,
        price: stake,
        parameters: {
          amount: stake,
          basis: "stake",
          contract_type: contractType.value,
          currency: "USD",
          duration: 1,
          duration_unit: "t",
          symbol: index.symbol,
          barrier: digit.toString(),
        }
      });
    }, 1200);
    return () => clearTimeout(timeout);
  }, [running, connected, status, step, getStake, send, contractType, index, digit]);

  const handleConnect = () => {
    const t = tokenInput.trim();
    if (!t) return;
    localStorage.setItem("deriv_token", t);
    setToken(t);
    addLog("Connecting to Deriv...", "info");
  };

  const handleDisconnect = () => {
    localStorage.removeItem("deriv_token");
    setToken("");
    setRunning(false);
    addLog("Disconnected", "info");
  };

  const startSession = () => {
    setSessionPnl(0);
    setStep(0);
    setCurrentStake(baseStake);
    setTrades([]);
    setStatus("idle");
    setRunning(true);
    addLog(`Session started — ${contractType.label} on digit ${digit} · ${index.label}`, "info");
  };

  const stopSession = () => {
    setRunning(false);
    setStatus("idle");
    addLog("Session stopped manually", "warning");
  };

  const sequence = Array.from({ length: maxSteps }, (_, i) => getStake(i));

  const pnlColor = sessionPnl > 0 ? "green" : sessionPnl < 0 ? "red" : "default";

  if (!token) {
    return (
      <div style={{
        minHeight: "100vh", background: "#0a0a0f", display: "flex", alignItems: "center",
        justifyContent: "center", fontFamily: "'Inter', system-ui, sans-serif", padding: 24
      }}>
        <div style={{ width: "100%", maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>⚡</div>
          <h1 style={{ color: "#fff", fontSize: 26, fontWeight: 700, marginBottom: 6 }}>DerivBot</h1>
          <p style={{ color: "#666", fontSize: 14, marginBottom: 32 }}>
            Matches / Differs Martingale · Direct Deriv connection
          </p>

          <div style={{
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 16, padding: 28, marginBottom: 20
          }}>
            <p style={{ color: "#aaa", fontSize: 13, marginBottom: 16, lineHeight: 1.6 }}>
              Paste your Deriv API token below. Get it from{" "}
              <a href="https://app.deriv.com/account/api-token" target="_blank" rel="noreferrer"
                style={{ color: "#3b82f6" }}>app.deriv.com/account/api-token</a>
              {" "}→ create token with <strong style={{ color: "#fff" }}>Read + Trade</strong> scope.
            </p>
            <input
              type="password"
              placeholder="Paste API token here..."
              value={tokenInput}
              onChange={e => setTokenInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleConnect()}
              style={{
                width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.06)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 10, color: "#fff",
                fontSize: 14, outline: "none", marginBottom: 14, boxSizing: "border-box"
              }}
            />
            <button onClick={handleConnect} style={{
              width: "100%", padding: "13px", background: "#3b82f6", border: "none",
              borderRadius: 10, color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer"
            }}>
              Connect to Deriv
            </button>
          </div>

          <div style={{
            background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.2)",
            borderRadius: 10, padding: "12px 16px"
          }}>
            <p style={{ color: "#f87171", fontSize: 12, margin: 0, lineHeight: 1.6 }}>
              ⚠️ Start with a <strong>demo account token</strong> to test safely. Real money trades execute immediately. Martingale carries real risk of account wipeout.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0f", color: "#e0e0e0",
      fontFamily: "'Inter', system-ui, sans-serif", fontSize: 14
    }}>
      {/* Header */}
      <div style={{
        background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.07)",
        padding: "12px 24px", display: "flex", alignItems: "center", gap: 16
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "#fff" }}>⚡ DerivBot</span>
        <div style={{
          display: "flex", alignItems: "center", gap: 6, marginLeft: "auto",
          background: connected ? "rgba(34,197,94,.1)" : "rgba(239,68,68,.1)",
          border: `1px solid ${connected ? "rgba(34,197,94,.3)" : "rgba(239,68,68,.3)"}`,
          borderRadius: 20, padding: "4px 12px"
        }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444" }} />
          <span style={{ fontSize: 12, color: connected ? "#22c55e" : "#ef4444" }}>
            {connected ? `${account?.loginid ?? "Connected"}` : "Disconnected"}
          </span>
        </div>
        {connected && (
          <div style={{ background: "rgba(59,130,246,.1)", border: "1px solid rgba(59,130,246,.3)", borderRadius: 20, padding: "4px 12px" }}>
            <span style={{ fontSize: 12, color: "#3b82f6" }}>
              ${balance?.balance?.toFixed(2) ?? "—"} {balance?.currency}
            </span>
          </div>
        )}
        <button onClick={handleDisconnect} style={{
          background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 8,
          color: "#888", fontSize: 12, padding: "4px 12px", cursor: "pointer"
        }}>Disconnect</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 0, minHeight: "calc(100vh - 53px)" }}>
        {/* Sidebar */}
        <div style={{ borderRight: "1px solid rgba(255,255,255,0.07)", padding: 20, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

          {/* Strategy config */}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Strategy</div>

            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Index</label>
            <select value={index.symbol} onChange={e => setIndex(INDICES.find(i => i.symbol === e.target.value))}
              style={{ width: "100%", background: "#111", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#ddd", padding: "8px 10px", marginBottom: 12, fontSize: 13 }}>
              {INDICES.map(i => <option key={i.symbol} value={i.symbol}>{i.label}</option>)}
            </select>

            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 4 }}>Contract type</label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
              {CONTRACT_TYPES.map(ct => (
                <button key={ct.value} onClick={() => setContractType(ct)} style={{
                  padding: "9px 8px", borderRadius: 8, border: `1px solid ${contractType.value === ct.value ? "#3b82f6" : "rgba(255,255,255,0.1)"}`,
                  background: contractType.value === ct.value ? "rgba(59,130,246,.15)" : "transparent",
                  color: contractType.value === ct.value ? "#3b82f6" : "#888", fontSize: 12, cursor: "pointer", textAlign: "left"
                }}>
                  <div style={{ fontWeight: 600 }}>{ct.label}</div>
                  <div style={{ fontSize: 10, marginTop: 2, opacity: .7 }}>{ct.winProb} · {ct.payout}</div>
                </button>
              ))}
            </div>

            <label style={{ display: "block", fontSize: 12, color: "#888", marginBottom: 6 }}>Target digit: <strong style={{ color: "#fff" }}>{digit}</strong></label>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 5, marginBottom: 12 }}>
              {[0,1,2,3,4,5,6,7,8,9].map(d => (
                <button key={d} onClick={() => setDigit(d)} style={{
                  padding: "8px 0", borderRadius: 6, border: `1px solid ${digit === d ? "#3b82f6" : "rgba(255,255,255,0.1)"}`,
                  background: digit === d ? "rgba(59,130,246,.2)" : "transparent",
                  color: digit === d ? "#3b82f6" : "#aaa", fontWeight: 600, cursor: "pointer", fontSize: 14
                }}>{d}</button>
              ))}
            </div>
          </div>

          {/* Risk config */}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Risk controls</div>

            {[
              { label: "Base stake ($)", key: "baseStake", value: baseStake, set: setBaseStake, min: 0.35, max: 10, step: 0.05 },
              { label: `Max steps (${maxSteps})`, key: "maxSteps", value: maxSteps, set: setMaxSteps, min: 2, max: 8, step: 1 },
              { label: `Take profit ($${takeProfit})`, key: "tp", value: takeProfit, set: setTakeProfit, min: 1, max: 100, step: 0.5 },
              { label: `Stop loss ($${stopLoss})`, key: "sl", value: stopLoss, set: setStopLoss, min: 1, max: 200, step: 0.5 },
            ].map(({ label, key, value, set, min, max, step: s }) => (
              <div key={key} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 12, color: "#888", marginBottom: 5 }}>{label}</div>
                <input type="range" min={min} max={max} step={s} value={value}
                  onChange={e => set(parseFloat(e.target.value))}
                  style={{ width: "100%", accentColor: "#3b82f6" }} />
              </div>
            ))}
          </div>

          {/* Martingale sequence */}
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>Stake sequence (2.1×)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {sequence.map((s, i) => (
                <div key={i} style={{
                  padding: "4px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600,
                  background: i === step && running ? "rgba(59,130,246,.25)" : "rgba(255,255,255,0.05)",
                  border: `1px solid ${i === step && running ? "#3b82f6" : "rgba(255,255,255,0.08)"}`,
                  color: i === step && running ? "#3b82f6" : "#888"
                }}>${s.toFixed(2)}</div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: 12, color: "#555" }}>
              Max exposure: <span style={{ color: "#f59e0b" }}>${sequence.reduce((a, b) => a + b, 0).toFixed(2)}</span>
            </div>
          </div>

          {/* Start/Stop */}
          <button onClick={running ? stopSession : startSession}
            disabled={!connected}
            style={{
              width: "100%", padding: 14, borderRadius: 10, border: "none",
              background: running ? "rgba(239,68,68,.2)" : connected ? "#3b82f6" : "#222",
              color: running ? "#ef4444" : connected ? "#fff" : "#555",
              fontSize: 15, fontWeight: 700, cursor: connected ? "pointer" : "not-allowed",
              border: running ? "1px solid rgba(239,68,68,.4)" : "none"
            }}>
            {running ? "⏹ Stop session" : "▶ Start session"}
          </button>
        </div>

        {/* Main panel */}
        <div style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20, overflowY: "auto" }}>

          {/* Stats row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12 }}>
            <StatCard label="Session P&L" value={`${sessionPnl >= 0 ? "+" : ""}$${sessionPnl.toFixed(2)}`} color={pnlColor} />
            <StatCard label="Deriv balance" value={balance ? `$${balance.balance.toFixed(2)}` : "—"} color="blue" />
            <StatCard label="Current step" value={running ? `${step + 1} / ${maxSteps}` : "—"} color="amber" />
            <StatCard label="Live tick" value={liveTick ?? "—"} color="default" />
          </div>

          {/* Status bar */}
          {running && (
            <div style={{
              background: "rgba(59,130,246,.08)", border: "1px solid rgba(59,130,246,.2)",
              borderRadius: 10, padding: "12px 16px", display: "flex", alignItems: "center", gap: 10
            }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animation: "pulse 1s infinite" }} />
              <span style={{ color: "#3b82f6", fontSize: 13 }}>
                {status === "placing" ? `Placing trade — $${currentStake.toFixed(2)} on ${contractType.label} digit ${digit}` : `Waiting for next tick — stake ready $${currentStake.toFixed(2)}`}
              </span>
              <span style={{ marginLeft: "auto", fontSize: 12, color: "#555" }}>
                TP ${takeProfit} · SL ${stopLoss}
              </span>
            </div>
          )}

          {/* Digit frequency */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, padding: 20
          }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14 }}>
              Last digit frequency · {ticks.length} ticks · {index.label}
            </div>
            <DigitFrequency ticks={ticks} />
          </div>

          {/* Trade log */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, padding: 20, flex: 1
          }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 14, display: "flex", justifyContent: "space-between" }}>
              <span>Trade history ({trades.length})</span>
              <span style={{ color: "#22c55e" }}>
                {trades.length > 0 && `${((trades.filter(t => t.won).length / trades.length) * 100).toFixed(1)}% win rate`}
              </span>
            </div>
            <TradeLog trades={trades} />
          </div>

          {/* Activity log */}
          <div style={{
            background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
            borderRadius: 14, padding: 20
          }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 12 }}>Activity log</div>
            <div style={{ maxHeight: 160, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {logs.length === 0 && <div style={{ color: "#444", fontSize: 13 }}>No activity yet</div>}
              {logs.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 10, fontSize: 12 }}>
                  <span style={{ color: "#444", flexShrink: 0 }}>{l.ts}</span>
                  <span style={{
                    color: l.type === "success" ? "#22c55e" : l.type === "danger" ? "#ef4444" : l.type === "warning" ? "#f59e0b" : "#888"
                  }}>{l.msg}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; } 
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,.1); border-radius: 4px; }
        select option { background: #111; }
      `}</style>
    </div>
  );
}
