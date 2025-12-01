import { createSignal, onCleanup, Show } from "solid-js";
import { Button } from "../components/ui";
import { StatusIndicator } from "../components/StatusIndicator";
import { ApiEndpoint } from "../components/ApiEndpoint";
import { SetupModal } from "../components/SetupModal";
import { UsageSummary } from "../components/UsageSummary";
import { GettingStartedEmptyState } from "../components/EmptyState";
import { ThemeToggleCompact } from "../components/ThemeToggle";
import { RequestMonitor } from "../components/RequestMonitor";
import { HealthIndicator } from "../components/HealthIndicator";
import { appStore } from "../stores/app";
import { toastStore } from "../stores/toast";
import {
  startProxy,
  stopProxy,
  openOAuth,
  pollOAuthStatus,
  disconnectProvider,
  refreshAuthStatus,
  type Provider,
} from "../lib/tauri";

type SetupTool = "cursor" | "cline" | "continue" | null;

const providers = [
  { name: "Claude", provider: "claude" as Provider, logo: "/logos/claude.svg" },
  {
    name: "ChatGPT",
    provider: "openai" as Provider,
    logo: "/logos/openai.svg",
  },
  { name: "Gemini", provider: "gemini" as Provider, logo: "/logos/gemini.svg" },
  { name: "Qwen", provider: "qwen" as Provider, logo: "/logos/qwen.png" },
];

const setupTools = [
  { id: "cursor" as const, name: "Cursor", logo: "/logos/cursor.svg" },
  { id: "cline" as const, name: "Cline", logo: "/logos/cline.svg" },
  { id: "continue" as const, name: "Continue", logo: "/logos/continue.svg" },
];

export function DashboardPage() {
  const {
    proxyStatus,
    setProxyStatus,
    authStatus,
    setAuthStatus,
    setCurrentPage,
  } = appStore;
  const [toggling, setToggling] = createSignal(false);
  const [connecting, setConnecting] = createSignal<Provider | null>(null);
  const [setupTool, setSetupTool] = createSignal<SetupTool>(null);

  const toggleProxy = async () => {
    if (toggling()) return;

    setToggling(true);
    try {
      if (proxyStatus().running) {
        const status = await stopProxy();
        setProxyStatus(status);
        toastStore.info("Proxy stopped");
      } else {
        const status = await startProxy();
        setProxyStatus(status);
        toastStore.success("Proxy started", `Listening on port ${status.port}`);
      }
    } catch (error) {
      console.error("Failed to toggle proxy:", error);
      toastStore.error("Failed to toggle proxy", String(error));
    } finally {
      setToggling(false);
    }
  };

  const handleConnect = async (provider: Provider) => {
    // Need proxy running for OAuth
    if (!proxyStatus().running) {
      toastStore.warning(
        "Start proxy first",
        "The proxy must be running to connect accounts",
      );
      return;
    }

    setConnecting(provider);
    toastStore.info(
      `Connecting to ${provider}...`,
      "Complete authentication in your browser",
    );

    try {
      // Open OAuth flow and get state for polling
      const oauthState = await openOAuth(provider);

      // Poll for completion
      let attempts = 0;
      const maxAttempts = 120; // 2 minutes max
      const pollInterval = setInterval(async () => {
        attempts++;
        try {
          const completed = await pollOAuthStatus(oauthState);
          if (completed) {
            clearInterval(pollInterval);
            // Refresh auth status from CLIProxyAPI's auth directory
            const newAuth = await refreshAuthStatus();
            setAuthStatus(newAuth);
            setConnecting(null);
            toastStore.success(
              `${provider} connected!`,
              "You can now use this provider",
            );
          } else if (attempts >= maxAttempts) {
            clearInterval(pollInterval);
            setConnecting(null);
            toastStore.error("Connection timeout", "Please try again");
          }
        } catch (err) {
          console.error("Poll error:", err);
        }
      }, 1000);

      // Cleanup on component unmount
      onCleanup(() => clearInterval(pollInterval));
    } catch (error) {
      console.error("Failed to start OAuth:", error);
      setConnecting(null);
      toastStore.error("Connection failed", String(error));
    }
  };

  const handleDisconnect = async (provider: Provider) => {
    try {
      await disconnectProvider(provider);
      const newAuth = await refreshAuthStatus();
      setAuthStatus(newAuth);
      toastStore.success(`${provider} disconnected`);
    } catch (error) {
      console.error("Failed to disconnect:", error);
      toastStore.error("Failed to disconnect", String(error));
    }
  };

  const connectedProviders = () => {
    const status = authStatus();
    return providers.filter((p) => status[p.provider]);
  };

  const disconnectedProviders = () => {
    const status = authStatus();
    return providers.filter((p) => !status[p.provider]);
  };

  const hasAnyProvider = () => connectedProviders().length > 0;

  return (
    <div class="min-h-screen flex flex-col">
      {/* Header */}
      <header class="px-4 sm:px-6 py-3 sm:py-4 border-b border-gray-200 dark:border-gray-800">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2 sm:gap-3">
            <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
              <span class="text-white text-lg sm:text-xl">⚡</span>
            </div>
            <div>
              <h1 class="font-bold text-base sm:text-lg text-gray-900 dark:text-gray-100">
                ProxyPal
              </h1>
              <p class="text-xs text-gray-500 dark:text-gray-400 hidden sm:block">
                Dashboard
              </p>
            </div>
          </div>
          <div class="flex items-center gap-2 sm:gap-3">
            <ThemeToggleCompact />
            <StatusIndicator
              running={proxyStatus().running}
              onToggle={toggleProxy}
              disabled={toggling()}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCurrentPage("settings")}
            >
              <svg
                class="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </Button>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main class="flex-1 p-4 sm:p-6 overflow-y-auto">
        <div class="max-w-3xl mx-auto space-y-4 sm:space-y-6 animate-stagger">
          {/* Show Getting Started for first-time users */}
          <Show when={!hasAnyProvider()}>
            <GettingStartedEmptyState
              proxyRunning={proxyStatus().running}
              onStart={toggleProxy}
            />
          </Show>

          {/* Show Usage Summary only when user has providers */}
          <Show when={hasAnyProvider()}>
            <UsageSummary />
          </Show>

          {/* API Endpoint - always show */}
          <ApiEndpoint
            endpoint={proxyStatus().endpoint}
            running={proxyStatus().running}
          />

          {/* Live Request Monitor */}
          <RequestMonitor />

          {/* Connected accounts - only show when has providers */}
          <Show when={connectedProviders().length > 0}>
            <div>
              <h2 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                Connected Accounts
              </h2>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-stagger">
                {connectedProviders().map((provider) => (
                  <div class="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 group hover-lift">
                    <img
                      src={provider.logo}
                      alt={provider.name}
                      class="w-6 h-6 rounded"
                    />
                    <span class="font-medium text-green-800 dark:text-green-300">
                      {provider.name}
                    </span>
                    <div class="ml-auto flex items-center gap-2">
                      <HealthIndicator provider={provider.provider} />
                      <button
                        class="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity"
                        onClick={() => handleDisconnect(provider.provider)}
                        title="Disconnect"
                      >
                        <svg
                          class="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M6 18L18 6M6 6l12 12"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </Show>

          {/* Add accounts section */}
          <Show when={disconnectedProviders().length > 0}>
            <div>
              <h2 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
                {hasAnyProvider() ? "Add More Accounts" : "Connect an Account"}
              </h2>
              <Show when={!proxyStatus().running}>
                <div class="flex items-center gap-2 p-3 mb-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <svg
                    class="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                  <p class="text-sm text-amber-700 dark:text-amber-300">
                    Start the proxy first to connect accounts
                  </p>
                  <button
                    onClick={toggleProxy}
                    class="ml-auto text-xs font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline underline-offset-2"
                  >
                    Start now
                  </button>
                </div>
              </Show>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 animate-stagger">
                {disconnectedProviders().map((provider) => (
                  <button
                    class="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-500 hover-lift transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => handleConnect(provider.provider)}
                    disabled={!proxyStatus().running || connecting() !== null}
                  >
                    <img
                      src={provider.logo}
                      alt={provider.name}
                      class="w-6 h-6 rounded"
                    />
                    <span class="font-medium text-gray-700 dark:text-gray-300">
                      {provider.name}
                    </span>
                    {connecting() === provider.provider ? (
                      <span class="ml-auto flex items-center gap-2 text-xs text-gray-500">
                        <svg
                          class="w-3 h-3 animate-spin"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            class="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            stroke-width="4"
                          />
                          <path
                            class="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          />
                        </svg>
                        Connecting
                      </span>
                    ) : (
                      <svg
                        class="w-4 h-4 ml-auto text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M12 4v16m8-8H4"
                        />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </Show>

          {/* Quick setup guides */}
          <div>
            <h2 class="text-sm font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-3">
              Quick Setup
            </h2>
            <div class="grid grid-cols-3 gap-2 sm:gap-3 animate-stagger">
              {setupTools.map((tool) => (
                <button
                  class="p-2 sm:p-3 rounded-lg bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-brand-500 hover:bg-gray-100 dark:hover:bg-gray-700/50 hover-lift transition-all text-center group"
                  onClick={() => setSetupTool(tool.id)}
                >
                  <img
                    src={tool.logo}
                    alt={tool.name}
                    class="w-6 h-6 sm:w-8 sm:h-8 mx-auto mb-1 sm:mb-2 rounded group-hover:scale-110 transition-transform"
                  />
                  <span class="text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300">
                    {tool.name}
                  </span>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
                    View setup
                  </p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Setup Modal */}
      <SetupModal
        tool={setupTool()}
        endpoint={proxyStatus().endpoint}
        onClose={() => setSetupTool(null)}
      />
    </div>
  );
}
