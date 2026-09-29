import React, { useEffect, useState } from "react";
import ReactDOM from "react-dom/client";
import type { HelloResponse } from "{{NPM_SCOPE}}/shared-types";
import { loadConfig } from "./lib/config";
import { fetchHello } from "./api";

function App() {
  const [hello, setHello] = useState<HelloResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHello()
      .then(setHello)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "600px", margin: "0 auto" }}>
      <h1>{{PROJECT_NAME}}</h1>
      {error && <p style={{ color: "red" }}>Error: {error}</p>}
      {hello ? (
        <div style={{ background: "#f0f9ff", border: "1px solid #bae6fd", borderRadius: "8px", padding: "1.5rem" }}>
          <p style={{ fontSize: "1.5rem", margin: "0 0 1rem" }}>{hello.message}</p>
          <p style={{ margin: "0.25rem 0", color: "#475569" }}>
            <strong>Server time:</strong> {new Date(hello.timestamp).toLocaleString()}
          </p>
          <p style={{ margin: "0.25rem 0", color: "#475569" }}>
            <strong>Timezone:</strong> {hello.timezone}
          </p>
        </div>
      ) : (
        !error && <p>Loading...</p>
      )}
    </div>
  );
}

// Load /config.json BEFORE rendering anything that calls the API: api calls
// read the backend URL from it (src/lib/config.ts).
function ConfigGate() {
  const [configLoaded, setConfigLoaded] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  useEffect(() => {
    loadConfig()
      .then(() => setConfigLoaded(true))
      .catch((e) => setConfigError(e.message));
  }, []);

  if (configError) {
    return <p style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", color: "red" }}>Failed to load config: {configError}</p>;
  }
  if (!configLoaded) {
    return <p style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>Loading...</p>;
  }
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConfigGate />
  </React.StrictMode>,
);
