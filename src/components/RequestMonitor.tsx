import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { onRequestLog, type RequestLog } from "../lib/tauri";
import { appStore } from "../stores/app";

const MAX_LOGS = 50;

const providerColors: Record<string, string> = {
  claude:
    "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  openai:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  gemini: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  qwen: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
  unknown: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400",
};

const statusColors: Record<number, string> = {
  200: "text-green-600 dark:text-green-400",
  400: "text-amber-600 dark:text-amber-400",
  401: "text-red-600 dark:text-red-400",
  500: "text-red-600 dark:text-red-400",
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RequestMonitor() {
  const { proxyStatus } = appStore;
  const [logs, setLogs] = createSignal<RequestLog[]>([]);
  const [expanded, setExpanded] = createSignal(false);

  onMount(async () => {
    const unlisten = await onRequestLog((log) => {
      setLogs((prev) => [log, ...prev].slice(0, MAX_LOGS));
    });

    onCleanup(() => {
      unlisten();
    });
  });

  const clearLogs = () => setLogs([]);

  const requestCount = () => logs().length;

  return (
    <div class="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <button
        class="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
        onClick={() => setExpanded(!expanded())}
      >
        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2">
            <div
              class={`w-2 h-2 rounded-full ${proxyStatus().running ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}
            />
            <span class="font-medium text-gray-900 dark:text-gray-100 text-sm">
              Request Monitor
            </span>
          </div>
          <Show when={requestCount() > 0}>
            <span class="px-2 py-0.5 text-xs font-medium bg-brand-100 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400 rounded-full">
              {requestCount()}
            </span>
          </Show>
        </div>
        <div class="flex items-center gap-2">
          <Show when={logs().length > 0}>
            <button
              class="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 px-2 py-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation();
                clearLogs();
              }}
            >
              Clear
            </button>
          </Show>
          <svg
            class={`w-4 h-4 text-gray-500 transition-transform ${expanded() ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {/* Expanded content */}
      <Show when={expanded()}>
        <div class="border-t border-gray-200 dark:border-gray-700">
          <Show
            when={logs().length > 0}
            fallback={
              <div class="px-4 py-8 text-center">
                <Show
                  when={proxyStatus().running}
                  fallback={
                    <div class="text-gray-500 dark:text-gray-400">
                      <svg
                        class="w-8 h-8 mx-auto mb-2 opacity-50"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="1.5"
                          d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                        />
                      </svg>
                      <p class="text-sm">Proxy is offline</p>
                      <p class="text-xs mt-1">
                        Start the proxy to see requests
                      </p>
                    </div>
                  }
                >
                  <div class="text-gray-500 dark:text-gray-400">
                    <svg
                      class="w-8 h-8 mx-auto mb-2 opacity-50"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="1.5"
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    <p class="text-sm">Waiting for requests...</p>
                    <p class="text-xs mt-1">Make an API call to see it here</p>
                  </div>
                </Show>
              </div>
            }
          >
            <div class="max-h-64 overflow-y-auto">
              <For each={logs()}>
                {(log, index) => (
                  <div
                    class={`px-4 py-2 flex items-center gap-3 text-sm ${
                      index() % 2 === 0
                        ? "bg-white dark:bg-gray-900/50"
                        : "bg-gray-50 dark:bg-gray-800/30"
                    } animate-slide-up`}
                    style={{ "animation-delay": `${index() * 20}ms` }}
                  >
                    {/* Timestamp */}
                    <span class="text-xs text-gray-400 dark:text-gray-500 font-mono w-16 flex-shrink-0">
                      {formatTime(log.timestamp)}
                    </span>

                    {/* Provider badge */}
                    <span
                      class={`px-1.5 py-0.5 text-xs font-medium rounded ${providerColors[log.provider] || providerColors.unknown}`}
                    >
                      {log.provider}
                    </span>

                    {/* Method & Path */}
                    <span class="text-gray-600 dark:text-gray-400 font-mono text-xs truncate flex-1">
                      <span class="font-semibold">{log.method}</span> {log.path}
                    </span>

                    {/* Status */}
                    <span
                      class={`font-mono text-xs font-semibold ${statusColors[log.status] || "text-gray-500"}`}
                    >
                      {log.status}
                    </span>

                    {/* Duration */}
                    <span class="text-xs text-gray-500 dark:text-gray-400 font-mono w-14 text-right">
                      {formatDuration(log.durationMs)}
                    </span>
                  </div>
                )}
              </For>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}

// Compact version for embedding in other components
export function RequestMonitorCompact() {
  const { proxyStatus } = appStore;
  const [latestLog, setLatestLog] = createSignal<RequestLog | null>(null);
  const [requestCount, setRequestCount] = createSignal(0);

  onMount(async () => {
    const unlisten = await onRequestLog((log) => {
      setLatestLog(log);
      setRequestCount((c) => c + 1);
    });

    onCleanup(() => {
      unlisten();
    });
  });

  return (
    <div class="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <Show
        when={proxyStatus().running}
        fallback={<span class="text-gray-400">Proxy offline</span>}
      >
        <div class="flex items-center gap-1.5">
          <div class="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>{requestCount()} requests</span>
        </div>
        <Show when={latestLog()}>
          <span class="text-gray-400">|</span>
          <span>
            Last: {latestLog()!.provider} (
            {formatDuration(latestLog()!.durationMs)})
          </span>
        </Show>
      </Show>
    </div>
  );
}
