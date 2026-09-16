"use client";

import React, { useCallback, useState, useMemo } from "react";
import { AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Search, Loader2 } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  useOracleMarkets,
  OracleMarketStatus,
  OracleMarket,
} from "@/hooks/useOracleMarkets";
import MarketOracleCard from "@/components/MarketOracleCard";
import OracleMarketDetailModal from "./OracleMarketDetailModal";

type CategoryOption = "all" | "crypto" | "politics" | "sports" | "economics" | "other";

export default function OracleMarketsClient() {
  const { address } = useAccount();
  const [searchQuery, setSearchQuery] = useState("");
  const [oracleStatusFilter, setOracleStatusFilter] = useState<
    OracleMarketStatus | "all"
  >("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryOption>("all");
  const [selectedMarket, setSelectedMarket] = useState<OracleMarket | null>(
    null
  );

  // Fetch markets
  const { markets, isLoading, error, refetch } = useOracleMarkets(
    oracleStatusFilter === "all" ? undefined : oracleStatusFilter,
    categoryFilter === "all" ? undefined : categoryFilter,
    searchQuery || undefined
  );

  // Filter by search (local filtering on top of API filtering)
  const filteredMarkets = useMemo(() => {
    return markets.filter((market) => {
      const query = searchQuery.toLowerCase();
      return (
        market.id.toLowerCase().includes(query) ||
        market.contractAddress?.toLowerCase().includes(query) ||
        market.title?.toLowerCase().includes(query) ||
        market.description?.toLowerCase().includes(query)
      );
    });
  }, [markets, searchQuery]);

  const refreshAfterOracleAction = useCallback(async () => {
    await refetch();
    if (!selectedMarket) return;

    // Fetch unfiltered data too: the action can move this market out of the
    // currently selected status filter while its modal remains open.
    const response = await fetch("/api/oracle/markets");
    if (!response.ok) return;
    const refreshedMarkets = (await response.json()) as OracleMarket[];
    const refreshedMarket = refreshedMarkets.find((market) => market.id === selectedMarket.id);
    if (refreshedMarket) setSelectedMarket(refreshedMarket);
  }, [refetch, selectedMarket]);

  if (error) {
    return (
      <div className="rounded-lg border border-dashed border-red-300 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-950/30">
        <p className="text-sm text-red-600 dark:text-red-400">
          Error loading markets: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Oracle markets</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Propose, review, and resolve outcomes for closed markets.</p>
      </div>

      {/* Filters and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search markets by title, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:flex">
          <Select
            value={oracleStatusFilter}
            onValueChange={(v) => setOracleStatusFilter(v as OracleMarketStatus | "all")}
          >
            <SelectTrigger className="w-full sm:w-[150px]">
              <SelectValue placeholder="Oracle Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="CLOSED">Closed</SelectItem>
              <SelectItem value="PROPOSED">Proposed</SelectItem>
              <SelectItem value="DISPUTED">Disputed</SelectItem>
              <SelectItem value="RESOLVED">Resolved</SelectItem>
              <SelectItem value="FINALIZED">Finalized</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={categoryFilter}
            onValueChange={(v) => setCategoryFilter(v as CategoryOption)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Categories</SelectItem>
              <SelectItem value="crypto">Crypto</SelectItem>
              <SelectItem value="politics">Politics</SelectItem>
              <SelectItem value="sports">Sports</SelectItem>
              <SelectItem value="economics">Economics</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Markets Grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
        </div>
      ) : filteredMarkets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-zinc-300 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {markets.length === 0
              ? "No markets are ready for oracle operations yet. Closed markets will appear here."
              : "No markets match your filters."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filteredMarkets.map((market) => (
              <MarketOracleCard
                key={market.id}
                market={market}
                onSelect={setSelectedMarket}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Market Detail Modal */}
      <AnimatePresence>
        {selectedMarket && (
          <OracleMarketDetailModal
            market={selectedMarket}
            onClose={() => setSelectedMarket(null)}
            userAddress={address}
            onMarketUpdated={refreshAfterOracleAction}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
