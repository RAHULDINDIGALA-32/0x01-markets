"use client";

import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  calculateProbability,
  formatAddress,
  formatEth,
} from "@/lib/utils";
import {
  Clock,
  TrendingUp,
} from "lucide-react";
import {
  OracleMarket,
  OracleMarketStatus,
} from "@/hooks/useOracleMarkets";
//import { MarketStatus } from "@prisma/client";

interface Props {
  market: OracleMarket;
  onSelect: (market: OracleMarket) => void;
}

const oracleMarketStatusConfig: Record<OracleMarketStatus, { label: string; variant: "destructive" | "secondary" | "warning" | "default" |"outline" }> = {
  CLOSED: { label: "CLOSED", variant: "warning" },
  PROPOSED: { label: "PROPOSED", variant: "default" },
  RESOLVED: { label: "RESOLVED", variant: "outline" },
  DISPUTED: { label: "DISPUTED", variant: "destructive" },
  FINALIZED: { label: "FINALIZED", variant: "secondary" },
};

export default function MarketOracleCard({
  market,
  onSelect,
}: Props) {
  const probabilities = calculateProbability(
    market.qYes,
    market.qNo
  );

  const OracleMarketStatus = oracleMarketStatusConfig[market.oracleStatus];

  const endTime = market.endTime
    ? Number(market.endTime)
    : null;

  const timeLabel = endTime
    ? new Date(endTime *1000).toLocaleDateString()
    : "N/A";

  const oracleStatus = market.oracleStatus
  const disputedOutcome = market.latestOracleEvent?.proposed === "YES" ? "NO" : "YES";

  const actionLabel =
    oracleStatus === "CLOSED"
      ? "Propose Outcome"
      : oracleStatus == "PROPOSED" 
      ? "Dispute Outcome"
      : oracleStatus == "DISPUTED"
      ? "Resolve Outcome"
      : oracleStatus === "RESOLVED"
      ? "Finalize Outcome"
      : "View Oracle Details";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-lg dark:hover:shadow-lg/20">
        <CardContent className="flex h-full flex-col p-6">
          {/* Header */}
          <div className="mb-4 flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h3 className="mb-2 line-clamp-2 text-lg font-semibold">
                {market.title ||
                  `Market #${market.id.slice(0, 8)}`}
              </h3>

              <p className="mb-3 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">
                {market.description ||
                  "Binary prediction market awaiting oracle resolution."}
              </p>

              {market.category && (
                <Badge
                  variant="outline"
                  className="text-xs"
                >
                  {market.category}
                </Badge>
              )}
            </div>

            <Badge variant={OracleMarketStatus.variant}>
                {OracleMarketStatus.label}
              </Badge>
          </div>

          {/* Probabilities */}
          <div className="mb-4 space-y-3">
            {/* YES */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
                  YES
                </span>

                <span className="text-sm font-semibold">
                  {Math.round(probabilities.yes * 100)}%
                </span>
              </div>

              <Progress
                value={probabilities.yes * 100}
                className="h-2 bg-zinc-200 dark:bg-zinc-800"
              />
            </div>

            {/* NO */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <span className="text-sm font-medium text-red-600 dark:text-red-400">
                  NO
                </span>

                <span className="text-sm font-semibold">
                  {Math.round(probabilities.no * 100)}%
                </span>
              </div>

              <Progress
                value={probabilities.no * 100}
                className="h-2 bg-zinc-200 dark:bg-zinc-800"
              />
            </div>
          </div>

          {/* Market Statistics */}
          <div className="mb-4 grid grid-cols-2 gap-4 border-t border-zinc-200 pt-4 text-sm dark:border-zinc-800">
            {/* Volume */}
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <TrendingUp className="h-3 w-3" />
                Volume
              </div>

              <div className="font-semibold">
                {formatEth(
                  BigInt(market.collateral),
                  4
                )}
              </div>
            </div>

            {/* End Time */}
            <div>
              <div className="mb-1 flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <Clock className="h-3 w-3" />
                Ended
              </div>

              <div className="font-semibold">
                {timeLabel}
              </div>
            </div>
          </div>

          {/* Latest Oracle Event */}
          {market.latestOracleEvent && (
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-lg bg-zinc-50 p-3 text-xs dark:bg-zinc-900">
              {/* Proposer */}
              <div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  Proposer
                </div>

                <div className="mt-1 font-mono font-medium">
                  {formatAddress(
                    market.latestOracleEvent.proposer
                  )}
                </div>
              </div>

              {/* Proposed Outcome */}
              <div>
                <div className="text-zinc-500 dark:text-zinc-400">
                  Proposed outcome
                </div>

                <div className="mt-1 font-medium">
                  {market.latestOracleEvent.proposed}
                </div>
              </div>

              {/* Disputer */}
              {market.latestOracleEvent.disputer && (
                <>
                <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Disputer
                  </div>

                  <div className="mt-1 font-mono font-medium">
                    {formatAddress(
                      market.latestOracleEvent.disputer
                    )}
                  </div>
                </div>
                <div className="border-t border-zinc-200 pt-2 dark:border-zinc-800">
                  <div className="text-zinc-500 dark:text-zinc-400">
                    Disputed outcome
                  </div>

                  <div className="mt-1 font-medium">
                    {disputedOutcome}
                  </div>
                </div>
                </>
              )}
            </div>
          )}

          {/* Action Button */}
          <motion.div
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="mt-auto"
          >
            <Button
              onClick={() => onSelect(market)}
              className="w-full"
            >
              {actionLabel}
            </Button>
          </motion.div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
