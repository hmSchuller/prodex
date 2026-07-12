import { query } from "@solidjs/router"
import { Database, and, eq, isNull } from "@opencode-ai/console-core/drizzle/index.js"
import { Actor } from "@opencode-ai/console-core/actor.js"
import { BillingTable, SubscriptionTable } from "@opencode-ai/console-core/schema/billing.sql.js"
import { Subscription } from "@opencode-ai/console-core/subscription.js"
import { withActor } from "~/context/auth.withActor"

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

type SubscriptionResponse = {
  go: SubscriptionInfo | null
  codex: SubscriptionInfo | null
}

export const getSubscription = query(async (workspaceID?: string): Promise<SubscriptionResponse> => {
  "use server"
  return withActor(async () => {
    const row = await Database.use((tx) =>
      tx
        .select({
          subscription: BillingTable.subscription,
          monthlyLimit: BillingTable.monthlyLimit,
          monthlyUsage: BillingTable.monthlyUsage,
          timeMonthlyUsageUpdated: BillingTable.timeMonthlyUsageUpdated,
          timeSubscriptionBooked: BillingTable.timeSubscriptionBooked,
          rollingUsage: SubscriptionTable.rollingUsage,
          fixedUsage: SubscriptionTable.fixedUsage,
          timeRollingUpdated: SubscriptionTable.timeRollingUpdated,
          timeFixedUpdated: SubscriptionTable.timeFixedUpdated,
        })
        .from(BillingTable)
        .innerJoin(SubscriptionTable, eq(SubscriptionTable.workspaceID, BillingTable.workspaceID))
        .where(
          and(
            eq(BillingTable.workspaceID, Actor.workspace()),
            eq(SubscriptionTable.workspaceID, Actor.workspace()),
            eq(SubscriptionTable.userID, Actor.userID()),
            isNull(BillingTable.timeDeleted),
            isNull(SubscriptionTable.timeDeleted),
          ),
        )
        .then((rows) => rows[0]),
    )

    if (!row?.subscription) {
      return { go: null, codex: null }
    }

    const blackLimits = Subscription.getLimits().black[row.subscription.plan]
    const now = new Date()

    const go: SubscriptionInfo = {
      plan: row.subscription.plan,
      status: "active",
      rolling: Subscription.analyzeRollingUsage({
        limit: blackLimits.rollingLimit,
        window: blackLimits.rollingWindow,
        usage: row.rollingUsage ?? 0,
        timeUpdated: row.timeRollingUpdated ?? now,
      }),
      weekly: Subscription.analyzeWeeklyUsage({
        limit: blackLimits.fixedLimit,
        usage: row.fixedUsage ?? 0,
        timeUpdated: row.timeFixedUpdated ?? now,
      }),
      monthly:
        row.monthlyLimit && row.timeSubscriptionBooked
          ? Subscription.analyzeMonthlyUsage({
              limit: row.monthlyLimit,
              usage: row.monthlyUsage ?? 0,
              timeUpdated: row.timeMonthlyUsageUpdated ?? now,
              timeSubscribed: row.timeSubscriptionBooked,
            })
          : null,
    }

    return { go, codex: null }
  }, workspaceID)
}, "api.subscription")
