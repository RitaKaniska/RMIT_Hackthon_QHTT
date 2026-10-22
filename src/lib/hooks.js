import { useCallback, useEffect, useRef, useState } from "react";
import { useTideCloak } from "@tidecloak/react";
import { apiRequest } from "./api.js";

export function useApi() {
  const { getToken } = useTideCloak();
  return useCallback((path, options) => apiRequest(getToken, path, options), [getToken]);
}

export function useAsyncData(loader, key) {
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [version, setVersion] = useState(0);
  const [state, setState] = useState({ key, status: "loading", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    setState((previous) =>
      previous.key === key
        ? { ...previous, status: "loading", error: null }
        : { key, status: "loading", data: null, error: null },
    );
    Promise.resolve()
      .then(() => loaderRef.current())
      .then(
        (data) => {
          if (!cancelled) setState({ key, status: "ready", data, error: null });
        },
        (error) => {
          if (!cancelled) setState({ key, status: "error", data: null, error });
        },
      );
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const reload = useCallback(() => setVersion((current) => current + 1), []);
  const stale = state.key !== key;
  return {
    status: stale ? "loading" : state.status,
    data: stale ? null : state.data,
    error: stale ? null : state.error,
    reload,
  };
}

export function useRoute() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  return path;
}

export function navigate(path) {
  if (window.location.pathname === path) return;
  window.history.pushState(null, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
