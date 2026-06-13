import type { TuiDialogSelectOption, TuiPluginApi, TuiSlotProps } from "@opencode-ai/plugin/tui"
import type { TuiConfig } from "../config"
import type { useEvent } from "../context/event"
import type { useRoute } from "../context/route"
import type { useSDK } from "../context/sdk"
import type { useSync } from "../context/sync"
import type { useTheme } from "../context/theme"
import { Dialog as DialogUI, type useDialog } from "../ui/dialog"
import type { useOpencodeKeymap } from "../keymap"
import type { useKV } from "../context/kv"
import { DialogAlert } from "../ui/dialog-alert"
import { DialogConfirm } from "../ui/dialog-confirm"
import { DialogPrompt } from "../ui/dialog-prompt"
import { DialogSelect, type DialogSelectOption as SelectOption } from "../ui/dialog-select"
import { Prompt } from "../component/prompt"
import type { useToast } from "../ui/toast"
import * as Keymap from "../keymap"
import { createCommandShim } from "./command-shim"
import type { PluginRoutes } from "./api"
import { createSignal } from "solid-js"
export type { RouteMap } from "./api"
export { createPluginRoutes, createTuiApi } from "./api"

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

const emptySubscription: SubscriptionState = { go: null, codex: null }

type Input = {
  version: string
  tuiConfig: TuiConfig.Resolved
  dialog: ReturnType<typeof useDialog>
  keymap: ReturnType<typeof useOpencodeKeymap>
  kv: ReturnType<typeof useKV>
  route: ReturnType<typeof useRoute>
  routes: PluginRoutes
  event: ReturnType<typeof useEvent>
  sdk: ReturnType<typeof useSDK>
  sync: ReturnType<typeof useSync>
  theme: ReturnType<typeof useTheme>
  toast: ReturnType<typeof useToast>
  renderer: TuiPluginApi["renderer"]
  attention: TuiPluginApi["attention"]
  Slot: TuiPluginApi["ui"]["Slot"]
}

function routeNavigate(route: ReturnType<typeof useRoute>, name: string, params?: Record<string, unknown>) {
  if (name === "home") {
    route.navigate({ type: "home" })
    return
  }

  if (name === "session") {
    const sessionID = params?.sessionID
    if (typeof sessionID !== "string") return
    route.navigate({ type: "session", sessionID })
    return
  }

  route.navigate({ type: "plugin", id: name, data: params })
}

function routeCurrent(route: ReturnType<typeof useRoute>): TuiPluginApi["route"]["current"] {
  if (route.data.type === "home") return { name: "home" }
  if (route.data.type === "session") {
    return {
      name: "session",
      params: {
        sessionID: route.data.sessionID,
        prompt: route.data.prompt,
      },
    }
  }

  return {
    name: route.data.id,
    params: route.data.data,
  }
}

function mapOption<Value>(item: TuiDialogSelectOption<Value>): SelectOption<Value> {
  return {
    ...item,
    onSelect: () => item.onSelect?.(),
  }
}

function pickOption<Value>(item: SelectOption<Value>): TuiDialogSelectOption<Value> {
  return {
    title: item.title,
    value: item.value,
    description: item.description,
    footer: item.footer,
    category: item.category,
    disabled: item.disabled,
  }
}

function mapOptionCb<Value>(cb?: (item: TuiDialogSelectOption<Value>) => void) {
  if (!cb) return
  return (item: SelectOption<Value>) => cb(pickOption(item))
}

function stateApi(input: Input): TuiPluginApi["state"] {
  const sync = input.sync
  const [subscription, setSubscription] = createSignal<SubscriptionState>(emptySubscription)
  let loadingSubscription = false
  let lastSubscriptionFetch = 0

  const refreshSubscription = async (force = false) => {
    const now = Date.now()
    if (loadingSubscription) return
    if (!force && now - lastSubscriptionFetch < 30_000) return

    loadingSubscription = true
    lastSubscriptionFetch = now
    try {
      const url = new URL("/experimental/subscription", input.sdk.url)
      if (input.sdk.directory) url.searchParams.set("directory", input.sdk.directory)
      const response = await input.sdk.fetch(url, { headers: { accept: "application/json" } })
      if (!response.ok) return
      setSubscription((await response.json()) as SubscriptionState)
    } catch (error) {
      console.error("failed to refresh subscription usage", error)
    } finally {
      loadingSubscription = false
    }
  }

  input.event.on("server.instance.disposed", () => {
    setSubscription(emptySubscription)
    lastSubscriptionFetch = 0
    void refreshSubscription(true)
  })

  input.event.on("session.status", (event) => {
    if (String(event.properties.status) === "idle") void refreshSubscription(true)
  })

  const api = {
    get ready() {
      return sync.ready
    },
    get config() {
      return sync.data.config
    },
    get provider() {
      return sync.data.provider
    },
    get path() {
      return sync.path
    },
    get vcs() {
      if (!sync.data.vcs) return
      return {
        branch: sync.data.vcs.branch,
      }
    },
    session: {
      count() {
        return sync.data.session.length
      },
      get(sessionID) {
        return sync.session.get(sessionID)
      },
      diff(sessionID) {
        return (sync.data.session_diff[sessionID] ?? []).flatMap((item) =>
          item.file === undefined ? [] : [{ ...item, file: item.file }],
        )
      },
      todo(sessionID) {
        return sync.data.todo[sessionID] ?? []
      },
      messages(sessionID) {
        return sync.data.message[sessionID] ?? []
      },
      status(sessionID) {
        return sync.data.session_status[sessionID]
      },
      permission(sessionID) {
        return sync.data.permission[sessionID] ?? []
      },
      question(sessionID) {
        return sync.data.question[sessionID] ?? []
      },
    },
    part(messageID) {
      return sync.data.part[messageID] ?? []
    },
    lsp() {
      return sync.data.lsp.map((item) => ({ id: item.id, root: item.root, status: item.status }))
    },
    mcp() {
      return Object.entries(sync.data.mcp)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, item]) => ({
          name,
          status: item.status,
          error: item.status === "failed" ? item.error : undefined,
        }))
    },
    subscription() {
      void refreshSubscription()
      return subscription()
    },
  }

  return api as TuiPluginApi["state"]
}

function appApi(version: string): TuiPluginApi["app"] {
  return {
    get version() {
      return version
    },
  }
}

export function createTuiApiAdapters(input: Input): Omit<TuiPluginApi, "lifecycle"> {
  return {
    app: appApi(input.version),
    attention: input.attention,
    // Keep deprecated `api.command` working for v1 plugins; remove in v2.
    command: createCommandShim(input.keymap, input.dialog, input.tuiConfig.keybinds),
    keys: {
      formatSequence(parts) {
        return Keymap.formatKeySequence(parts, input.tuiConfig)
      },
      formatBindings(bindings) {
        return Keymap.formatKeyBindings(bindings, input.tuiConfig)
      },
    },
    keymap: input.keymap,
    mode: {
      current() {
        return Keymap.getOpencodeModeStack(input.keymap).current()
      },
      push(mode) {
        return Keymap.getOpencodeModeStack(input.keymap).push(mode)
      },
    },
    route: {
      register(list) {
        return input.routes.register(list)
      },
      navigate(name, params) {
        routeNavigate(input.route, name, params)
      },
      get current() {
        return routeCurrent(input.route)
      },
    },
    ui: {
      Dialog(props) {
        return (
          <DialogUI size={props.size} onClose={props.onClose}>
            {props.children}
          </DialogUI>
        )
      },
      DialogAlert(props) {
        return <DialogAlert {...props} />
      },
      DialogConfirm(props) {
        return <DialogConfirm {...props} />
      },
      DialogPrompt(props) {
        return <DialogPrompt {...props} description={props.description} />
      },
      DialogSelect(props) {
        return (
          <DialogSelect
            title={props.title}
            placeholder={props.placeholder}
            options={props.options.map(mapOption)}
            flat={props.flat}
            onMove={mapOptionCb(props.onMove)}
            onFilter={props.onFilter}
            onSelect={mapOptionCb(props.onSelect)}
            skipFilter={props.skipFilter}
            current={props.current}
          />
        )
      },
      Slot<Name extends string>(props: TuiSlotProps<Name>) {
        return <input.Slot {...props} />
      },
      Prompt(props) {
        return <Prompt {...props} />
      },
      toast(input) {
        input.toast.add(input)
      },
      dialog: input.dialog,
    },
    tuiConfig: input.tuiConfig,
    kv: input.kv,
    state: stateApi(input),
    theme: input.theme,
    client: input.sdk.client,
    event: {
      on(type, handler) {
        return input.event.on(type, handler)
      },
    },
    renderer: input.renderer,
    slots: {
      register: input.Slot.registry.register.bind(input.Slot.registry),
    },
    plugins: input.routes.plugins,
  }
}
