import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { EndpointMetrics } from "{{NPM_SCOPE}}/shared-types";
import { fetchEndpointMetrics } from "./metrics";

function App() {
  const [metrics, setMetrics] = useState<EndpointMetrics | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const refresh = () => {
    fetchEndpointMetrics()
      .then((data) => { setMetrics(data); setLastRefresh(new Date()); })
      .catch((e) => setError(e.message));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1>{{PROJECT_NAME}} — Dashboard</h1>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {metrics ? (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <h2 style={{ margin: 0 }}>API Endpoint Activity (last {metrics.windowHours}h)</h2>
            <button onClick={refresh} style={{ padding: "0.5rem 1rem", cursor: "pointer" }}>Refresh</button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#f1f5f9", textAlign: "left" }}>
                <th style={{ padding: "0.75rem", borderBottom: "2px solid #e2e8f0" }}>Method</th>
                <th style={{ padding: "0.75rem", borderBottom: "2px solid #e2e8f0" }}>Endpoint</th>
                <th style={{ padding: "0.75rem", borderBottom: "2px solid #e2e8f0", textAlign: "right" }}>Calls (24h)</th>
              </tr>
            </thead>
            <tbody>
              {metrics.endpoints.map((ep) => (
                <tr key={`${ep.method}-${ep.endpoint}`}>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid #e2e8f0" }}>
                    <code style={{ background: "#dbeafe", padding: "0.2rem 0.5rem", borderRadius: "4px" }}>{ep.method}</code>
                  </td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid #e2e8f0" }}>
                    <code>{ep.endpoint}</code>
                  </td>
                  <td style={{ padding: "0.75rem", borderBottom: "1px solid #e2e8f0", textAlign: "right", fontWeight: "bold" }}>
                    {ep.callCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p style={{ color: "#94a3b8", fontSize: "0.875rem", marginTop: "1rem" }}>
            Last refreshed: {lastRefresh.toLocaleTimeString()}
          </p>
        </>
      ) : (
        !error && <p>Loading metrics...</p>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
