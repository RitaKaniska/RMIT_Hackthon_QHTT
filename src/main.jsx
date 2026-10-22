import React, { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TideCloakContextProvider } from "@tidecloak/react";
import App from "./App.jsx";
import { fetchSetup } from "./lib/api.js";
import SetupScreen, { BootScreen, SetupLoadError } from "./views/SetupScreen.jsx";
import "./style.css";

function hasUsableServerConfig(config) {
  return Boolean(
    config &&
      typeof config === "object" &&
      (config.realm || config.url || config["auth-server-url"] || config.authServerUrl),
  );
}

function Root() {
  const [state, setState] = useState({
    status: "loading",
    setup: null,
    error: null,
    refreshing: false,
    refreshError: null,
  });

  const load = useCallback(async (mode, signal) => {
    setState((previous) =>
      mode === "initial"
        ? { ...previous, status: "loading", error: null }
        : { ...previous, refreshing: true, refreshError: null },
    );
    try {
      const setup = await fetchSetup(signal);
      setState((previous) => ({
        ...previous,
        status: "ready",
        setup,
        error: null,
        refreshing: false,
        refreshError: null,
      }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setState((previous) => {
        if (mode === "initial" || !previous.setup) {
          return {
            ...previous,
            status: "error",
            error,
            refreshing: false,
            refreshError: null,
          };
        }
        return {
          ...previous,
          status: "ready",
          refreshing: false,
          refreshError: error,
        };
      });
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    load("initial", controller.signal);
    return () => controller.abort();
  }, [load]);

  const refresh = useCallback(() => load("refresh"), [load]);
  const retryInitial = useCallback(() => load("initial"), [load]);

  if (state.status === "loading") return <BootScreen />;
  if (state.status === "error") {
    return <SetupLoadError error={state.error} onRetry={retryInitial} />;
  }

  const setup = state.setup;
  const config = setup?.configured === true ? setup.config : null;

  if (!hasUsableServerConfig(config)) {
    return (
      <SetupScreen
        setup={setup}
        onRefresh={refresh}
        refreshing={state.refreshing}
        refreshError={state.refreshError}
        configInvalid={setup?.configured === true}
      />
    );
  }

  return (
    <TideCloakContextProvider config={{ ...config, useDPoP: { mode: "strict", alg: "ES256" } }}>
      <App
        setup={setup}
        onRefreshSetup={refresh}
        refreshingSetup={state.refreshing}
        refreshSetupError={state.refreshError}
      />
    </TideCloakContextProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
