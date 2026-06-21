import type { TuiPlugin, TuiPluginApi } from "@opencode-ai/plugin/tui"
import type { BuiltinTuiPlugin } from "../builtins"
import { createMemo, createSignal, Show } from "solid-js"

const id = "internal:sidebar-context"

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

function View(props: { api: TuiPluginApi; session_id: string }) {
  const theme = () => props.api.theme.current
  const session = createMemo(() => props.api.state.session.get(props.session_id))
  const cost = createMemo(() => session()?.cost ?? 0)
  const [hover, setHover] = createSignal(false)

  const state = createMemo(() => {
    const tokens = session()?.tokens
    if (!tokens) {
      return { total: 0, percent: null }
    }

    const total = tokens.input + tokens.output + tokens.reasoning + tokens.cache.read + tokens.cache.write
    const modelProvider = session()?.model?.providerID
    const modelId = session()?.model?.id
    const model = modelProvider && modelId
      ? props.api.state.provider.find((item) => item.id === modelProvider)?.models[modelId]
      : undefined
    const percent = model?.limit.context ? Math.round((total / model.limit.context) * 100) : null

    return { total, percent }
  })

  const breakdown = createMemo(() => {
    const tokens = session()?.tokens
    if (!tokens) return null

    const cacheTotal = tokens.cache.read + tokens.input
    const hitRate = cacheTotal > 0 ? Math.round((tokens.cache.read / cacheTotal) * 1000) / 10 : 0

    return {
      input: tokens.input,
      output: tokens.output,
      reasoning: tokens.reasoning,
      cacheRead: tokens.cache.read,
      cacheWrite: tokens.cache.write,
      hitRate,
    }
  })

  return (
    <box
      onMouseOver={() => setHover(true)}
      onMouseOut={() => setHover(false)}
    >
      <text fg={theme().text}>
        <b>Context</b>
      </text>
      <text fg={theme().textMuted}>In: {breakdown()?.input.toLocaleString() ?? 0} Out: {breakdown()?.output.toLocaleString() ?? 0} · {state().percent ?? 0}%</text>
      <text fg={theme().textMuted}>{money.format(cost())} spent</text>
      <Show when={hover() && breakdown()}>
        <text fg={theme().textMuted}>────────────────────────</text>
        <text fg={theme().textMuted}>
          In: {breakdown()!.input.toLocaleString()}  Out: {breakdown()!.output.toLocaleString()}
        </text>
        <text fg={theme().textMuted}>
          Re: {breakdown()!.reasoning.toLocaleString()}  CaR: {breakdown()!.cacheRead.toLocaleString()}
        </text>
        <text fg={theme().textMuted}>
          CaW: {breakdown()!.cacheWrite.toLocaleString()}  Hit: {breakdown()!.hitRate}%
        </text>
      </Show>
    </box>
  )
}

const tui: TuiPlugin = async (api) => {
  api.slots.register({
    order: 100,
    slots: {
      sidebar_content(_ctx, props) {
        return <View api={api} session_id={props.session_id} />
      },
    },
  })
}

const plugin: BuiltinTuiPlugin = {
  id,
  tui,
}

export default plugin
