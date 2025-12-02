import type { JSX } from "solid-js";
import { Show } from "solid-js";

interface EmptyStateProps {
  icon: JSX.Element;
  title: string;
  description: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  secondaryAction?: {
    label: string;
    onClick: () => void;
  };
  hint?: string;
}

export function EmptyState(props: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center justify-center py-12 px-6 text-center animate-fade-in">
      {/* Icon container with gradient background */}
      <div class="w-20 h-20 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 flex items-center justify-center mb-5 shadow-sm">
        <div class="text-gray-400 dark:text-gray-500">{props.icon}</div>
      </div>

      {/* Title */}
      <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
        {props.title}
      </h3>

      {/* Description */}
      <p class="text-sm text-gray-500 dark:text-gray-400 max-w-xs mb-6 leading-relaxed">
        {props.description}
      </p>

      {/* Actions */}
      <div class="flex flex-col sm:flex-row items-center gap-3">
        {props.action && (
          <button
            onClick={props.action.onClick}
            class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white text-sm font-medium rounded-lg transition-all hover-lift shadow-sm hover:shadow-md"
          >
            {props.action.label}
          </button>
        )}
        {props.secondaryAction && (
          <button
            onClick={props.secondaryAction.onClick}
            class="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-lg transition-all"
          >
            {props.secondaryAction.label}
          </button>
        )}
      </div>

      {/* Hint text */}
      <Show when={props.hint}>
        <p class="text-xs text-gray-400 dark:text-gray-500 mt-4 max-w-xs">
          {props.hint}
        </p>
      </Show>
    </div>
  );
}

// Pre-built empty states for common scenarios
export function NoProvidersEmptyState(props: { onConnect: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          class="w-10 h-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
          />
        </svg>
      }
      title="No providers connected"
      description="Connect your AI accounts to start using ProxyPal with your favorite coding tools."
      action={{
        label: "Connect your first provider",
        onClick: props.onConnect,
      }}
    />
  );
}

export function ProxyStoppedEmptyState(props: { onStart: () => void }) {
  return (
    <EmptyState
      icon={
        <svg
          class="w-10 h-10"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="1.5"
            d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z"
          />
        </svg>
      }
      title="Proxy is offline"
      description="Start the proxy server to enable AI connections for your coding tools."
      action={{
        label: "Start Proxy",
        onClick: props.onStart,
      }}
    />
  );
}

export function GettingStartedEmptyState(props: {
  onStart: () => void;
  onDismiss?: () => void;
  proxyRunning: boolean;
  hasProvider?: boolean;
  hasConfiguredAgent?: boolean;
}) {
  // Determine which step is current
  const currentStep = () => {
    if (!props.proxyRunning) return 1;
    if (!props.hasProvider) return 2;
    if (!props.hasConfiguredAgent) return 3;
    return 4; // All done
  };

  const allDone = () => currentStep() === 4;
  const completedSteps = () => {
    let count = 0;
    if (props.proxyRunning) count++;
    if (props.hasProvider) count++;
    if (props.hasConfiguredAgent) count++;
    return count;
  };

  // Show celebration when all done
  if (allDone()) {
    return (
      <div class="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border border-green-200 dark:border-green-800 animate-fade-in">
        <div class="flex items-start gap-3 sm:gap-4">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-green-500 flex items-center justify-center flex-shrink-0">
            <svg
              class="w-5 h-5 sm:w-6 sm:h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="font-semibold text-green-800 dark:text-green-200 mb-1">
              You're all set!
            </h3>
            <p class="text-sm text-green-700 dark:text-green-300">
              ProxyPal is configured and ready. Start using your AI tools - all
              requests will be routed through your connected accounts.
            </p>
          </div>
          <Show when={props.onDismiss}>
            <button
              onClick={props.onDismiss}
              class="p-1 text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-200 rounded-lg hover:bg-green-100 dark:hover:bg-green-800/50 transition-colors"
              title="Dismiss"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </Show>
        </div>
      </div>
    );
  }

  return (
    <div class="p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-brand-50 to-purple-50 dark:from-brand-900/20 dark:to-purple-900/20 border border-brand-200 dark:border-brand-800 animate-fade-in">
      <div class="flex flex-col sm:flex-row items-start gap-3 sm:gap-4">
        {/* Icon */}
        <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-brand-500 flex items-center justify-center flex-shrink-0">
          <svg
            class="w-5 h-5 sm:w-6 sm:h-6 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>

        {/* Content */}
        <div class="flex-1 min-w-0">
          <div class="flex items-center justify-between mb-1">
            <h3 class="font-semibold text-gray-900 dark:text-gray-100">
              {completedSteps() === 0
                ? "Welcome to ProxyPal!"
                : "Almost there!"}
            </h3>
            <span class="text-xs text-gray-500 dark:text-gray-400">
              {completedSteps()}/3 complete
            </span>
          </div>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
            {completedSteps() === 0
              ? "Get started in 3 easy steps:"
              : `Just ${3 - completedSteps()} more step${3 - completedSteps() > 1 ? "s" : ""} to go:`}
          </p>

          {/* Progress bar */}
          <div class="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full mb-4 overflow-hidden">
            <div
              class="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-500"
              style={{ width: `${(completedSteps() / 3) * 100}%` }}
            />
          </div>

          {/* Steps */}
          <div class="space-y-2.5 sm:space-y-3">
            <StepItem
              number={1}
              title="Start the proxy"
              done={props.proxyRunning}
              current={currentStep() === 1}
              description="Click the toggle in the header"
              actionLabel={!props.proxyRunning ? "Start Proxy" : undefined}
              onAction={props.onStart}
            />
            <StepItem
              number={2}
              title="Connect a provider"
              done={props.hasProvider || false}
              current={currentStep() === 2}
              description="Sign in with Claude, ChatGPT, or Gemini below"
            />
            <StepItem
              number={3}
              title="Configure your tool"
              done={props.hasConfiguredAgent || false}
              current={currentStep() === 3}
              description="Set up Cursor, Windsurf, or other AI tools"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StepItem(props: {
  number: number;
  title: string;
  description: string;
  done: boolean;
  current?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div class="flex items-center gap-3">
      <div
        class={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
          props.done
            ? "bg-green-500 text-white"
            : props.current
              ? "bg-brand-500 text-white ring-2 ring-brand-300 ring-offset-2 dark:ring-offset-gray-900"
              : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
        }`}
      >
        {props.done ? (
          <svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
        ) : (
          props.number
        )}
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <p
            class={`text-sm font-medium ${
              props.done
                ? "text-green-700 dark:text-green-400 line-through opacity-70"
                : props.current
                  ? "text-gray-900 dark:text-gray-100"
                  : "text-gray-600 dark:text-gray-400"
            }`}
          >
            {props.title}
          </p>
          {props.current && props.actionLabel && props.onAction && (
            <button
              onClick={props.onAction}
              class="px-2 py-0.5 text-xs font-medium bg-brand-500 hover:bg-brand-600 text-white rounded transition-colors"
            >
              {props.actionLabel}
            </button>
          )}
        </div>
        {!props.done && (
          <p class="text-xs text-gray-500 dark:text-gray-400">
            {props.description}
          </p>
        )}
      </div>
    </div>
  );
}
