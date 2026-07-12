import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, For, Show } from "solid-js"

const id = "internal:sidebar-subscriptions"

type SubscriptionUsage = {
  status: "ok" | "rate-limited"
  usagePercent: number
  resetInSec: number
}

type SubscriptionInfo = {
  plan: string | null
  status: "active" | "inactive"
  rolling: SubscriptionUsage | null
  weekly: SubscriptionUsage | null
  monthly: SubscriptionUsage | null
}

type SubscriptionState = {
  go: SubscriptionInfo | null
  codex: SubscriptionInfo | null
}

type MetricKey = "rolling" | "weekly" | "monthly"

function subscriptionState(api: TuiPluginApi): SubscriptionState {
  return (
    (api.state as unknown as { subscription?: () => SubscriptionState }).subscription?.() ?? {
      go: null,
      codex: null,
    }
  )
}

function formatResetTime(sec: number): string {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m`
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`
  return `${Math.floor(sec / 86400)}d ${Math.floor((sec % 86400) / 3600)}h`
}

function progressBar(percent: number, width = 14): string {
  const clamped = Math.max(0, Math.min(100, percent))
  const filled = Math.round((clamped / 100) * width)
  return "▓".repeat(filled) + "░".repeat(width - filled)
}

function usageColor(usage: SubscriptionUsage, theme: TuiPluginApi["theme"]["current"]) {
  if (usage.status === "rate-limited") return theme.error
  if (usage.usagePercent > 80) return theme.error
  if (usage.usagePercent >= 50) return theme.warning
  return theme.success
}

function SubscriptionSection(props: {
  title: string
  indicator: TuiPluginApi["theme"]["current"]["success"]
  info: SubscriptionInfo | null
  api: TuiPluginApi
  metrics: Array<{ label: string; key: MetricKey }>
}) {
  const [open, setOpen] = createSignal(true)
  const theme = () => props.api.theme.current

  return (
    <Show when={props.info}>
      {(info) => (
        <box>
          <box flexDirection="row" gap={1} onMouseDown={() => setOpen((x) => !x)}>
            <text fg={theme().text}>{open() ? "▼" : "▶"}</text>
            <text flexShrink={0} fg={props.indicator}>
              •
            </text>
            <text fg={theme().text}>
              <b>{props.title}</b>
              <Show when={info().plan}>
                <span style={{ fg: theme().textMuted }}> {info().plan}</span>
              </Show>
            </text>
          </box>
          <Show when={open()}>
            <For each={props.metrics}>
              {(metric) => {
                const usage = () => info()[metric.key]
                return (
                  <Show when={usage()}>
                    {(u) => (
                      <box>
                        <box flexDirection="row" gap={1}>
                          <text fg={theme().textMuted}>{metric.label.padEnd(8)}</text>
                          <text fg={usageColor(u(), theme())}>{u().usagePercent}%</text>
                          <text fg={theme().textMuted}>·</text>
                          <text fg={theme().textMuted}>{formatResetTime(u().resetInSec)}</text>
                          <Show when={u().status === "rate-limited"}>
                            <text fg={theme().error}>(rate limited)</text>
                          </Show>
                        </box>
                        <text fg={usageColor(u(), theme())}>{progressBar(u().usagePercent)}</text>
                      </box>
                    )}
                  </Show>
                )
              }}
            </For>
          </Show>
        </box>
      )}
    </Show>
  )
}

function View(props: { api: TuiPluginApi }) {
  const theme = () => props.api.theme.current
  const data = createMemo(() => subscriptionState(props.api))
  const hasAny = createMemo(() => !!data().go || !!data().codex)

  return (
    <Show when={hasAny()}>
      <box>
        <text fg={theme().text}>
          <b>Subscriptions</b>
        </text>
        <SubscriptionSection
          title="Go"
          indicator={theme().success}
          info={data().go}
          api={props.api}
          metrics={[
            { label: "Rolling", key: "rolling" },
            { label: "Weekly", key: "weekly" },
            { label: "Monthly", key: "monthly" },
          ]}
        />
        <SubscriptionSection
          title="Codex"
          indicator={theme().secondary}
          info={data().codex}
          api={props.api}
          metrics={[
            { label: "Rolling", key: "rolling" },
            { label: "Weekly", key: "weekly" },
          ]}
        />
      </box>
    </Show>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 150,
    slots: {
      sidebar_content() {
        return <View api={api} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
