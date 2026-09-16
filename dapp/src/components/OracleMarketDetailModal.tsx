"use client";

import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Loader,
  ExternalLink,
} from "lucide-react";
import {
  calculateProbability,
  formatEth,
  //formatAddress,
} from "@/lib/utils";
import { getOracleConfig, formatSeconds } from "@/lib/oracleConfig";
import { syncOracleToDatabase } from "@/lib/blockchainUtils";
import { OracleMarket } from "@/hooks/useOracleMarkets";


const ORACLE_ABI = [
  {
    type: "function",
    name: "proposeOutcome",
    stateMutability: "payable",
    inputs: [
      { name: "market", type: "address" },
      { name: "outcome", type: "uint8" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "disputeOutcome",
    stateMutability: "payable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveOutcome",
    stateMutability: "nonpayable",
    inputs: [
      { name: "market", type: "address" },
      { name: "finalOutcome", type: "uint8" },
      { name: "isProposerCorrect", type: "bool" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "finalizeUndisputedOutcome",
    stateMutability: "nonpayable",
    inputs: [{ name: "market", type: "address" }],
    outputs: [],
  },
] as const;

const ORACLE_ADDRESS = (process.env.NEXT_PUBLIC_ORACLE_ADAPTER_ADDRESS as `0x${string}`) ??
  ("0x0000000000000000000000000000000000000000" as `0x${string}`);

interface Props {
  market: OracleMarket;
  onClose: () => void;
  userAddress?: `0x${string}`;
  onMarketUpdated: () => Promise<void>;
}

export default function OracleMarketDetailModal({
  market,
  onClose,
  userAddress,
  onMarketUpdated,
}: Props) {
  const config = getOracleConfig();
  const proposerBondWei = BigInt(config.proposerBondWei);
  const disputerBondWei = BigInt(config.disputerBondWei);
  const proposerBountyWei = BigInt(config.proposerBountyWei);
  const { writeContractAsync, isPending } = useWriteContract();
  const [selectedOutcome, setSelectedOutcome] = useState<"YES" | "NO">("YES");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  const [isResolver, setIsResolver] = useState<boolean | null>(null);

  const { isLoading: isConfirming, isSuccess: isConfirmed, isError: isConfirmationError } = useWaitForTransactionReceipt({
    hash: txHash as `0x${string}` | undefined,
  });

  const probabilities = calculateProbability(market.qYes, market.qNo);
  const yesPercent = (probabilities.yes * 100).toFixed(1);
  const noPercent = (probabilities.no * 100).toFixed(1);

  const endDate = market.endTime
    ? new Date(Number(market.endTime) * 1000).toLocaleString()
    : "N/A";
  const proposalTime = market.latestOracleEvent ? new Date(market.latestOracleEvent.createdAt).getTime() : null;
  const disputeEndsAt = proposalTime === null ? null : proposalTime + config.disputeWindowSeconds * 1000;
  // The resolver deadline starts after the dispute window,
  // not when the disputer submits their transaction (as per on-chain contract)
  const resolutionEndsAt = disputeEndsAt === null ? null : disputeEndsAt + config.resolutionDeadlineSeconds * 1000;
  const disputeTimeLeft = disputeEndsAt === null ? 0 : Math.max(0, disputeEndsAt - currentTime);
  const resolutionTimeLeft = resolutionEndsAt === null ? 0 : Math.max(0, resolutionEndsAt - currentTime);
  const isDisputeWindowOpen = disputeEndsAt !== null && disputeTimeLeft > 0;
  const isResolutionWindowOpen = resolutionEndsAt !== null && resolutionTimeLeft > 0;
  const proposedOutcome = market.latestOracleEvent?.proposed === "NO" ? "NO" : "YES";
  const isProposerCorrect = selectedOutcome === proposedOutcome;
  const formatCountdown = (milliseconds: number) => {
    if (milliseconds <= 0) return "Closed";
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const days = Math.floor(totalSeconds / 86_400);
    const hours = Math.floor((totalSeconds % 86_400) / 3_600);
    const minutes = Math.floor((totalSeconds % 3_600) / 60);
    const seconds = totalSeconds % 60;
    return days > 0 ? `${days}d ${hours}h remaining` : `${hours}h ${minutes}m ${seconds}s remaining`;
  };

  // Determine if user is the proposer
  // const isProposer =
  //   market.latestOracleEvent?.proposer?.toLowerCase() ===
  //   userAddress?.toLowerCase();
  // const isDisputer =
  //   market.latestOracleEvent?.disputer?.toLowerCase() ===
  //   userAddress?.toLowerCase();

  // Reset form when market changes
  useEffect(() => {
    setTxHash(null);
    setTxStatus("idle");
    setTxError(null);
  }, [market.id]);

  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userAddress) {
      setIsResolver(false);
      return;
    }
    let active = true;
    void fetch(`/api/admin/auth-check?address=${userAddress}&type=resolver`)
      .then(async (response) => response.ok ? response.json() : { isAuthorized: false })
      .then((result) => { if (active) setIsResolver(result.isAuthorized === true); })
      .catch(() => { if (active) setIsResolver(false); });
    return () => { active = false; };
  }, [userAddress]);

  useEffect(() => {
    if (isConfirmed) setTxStatus("success");
    if (isConfirmationError) {
      setTxStatus("error");
      setTxError("Transaction was not confirmed. Please check your wallet and try again.");
    }
  }, [isConfirmed, isConfirmationError]);

  const syncAndRefresh = async (
    action: "propose" | "dispute" | "resolve" | "finalize",
    hash: `0x${string}`,
    data: Record<string, unknown>
  ) => {
    const syncSuccess = await syncOracleToDatabase(action, market.id, hash, data);
    if (!syncSuccess) {
      setTxError("Transaction confirmed, but its activity record could not be refreshed yet.");
      return;
    }
    await onMarketUpdated();
  };

  const handleProposeOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "proposeOutcome",
        args: [
          market.contractAddress as `0x${string}`,
          selectedOutcome === "YES" ? 1 : 0,
        ],
        value: proposerBondWei,
      });

      setTxHash(hash);

      await syncAndRefresh("propose", hash, { proposer: userAddress, proposedOutcome: selectedOutcome });
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to propose outcome";
      setTxError(errorMessage);
    }
  };

  const handleDisputeOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "disputeOutcome",
        args: [market.contractAddress as `0x${string}`],
        value: disputerBondWei,
      });

      setTxHash(hash);
      await syncAndRefresh("dispute", hash, { disputer: userAddress });
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to dispute outcome";
      setTxError(errorMessage);
      console.error("Dispute error:", err);
    }
  };

  const handleResolveOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "resolveOutcome",
        args: [
          market.contractAddress as `0x${string}`,
          selectedOutcome === "YES" ? 1 : 0,
          isProposerCorrect,
        ],
      });

      setTxHash(hash);

      await syncAndRefresh("resolve", hash, { finalOutcome: selectedOutcome });
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to resolve outcome";
      setTxError(errorMessage);
      console.error("Resolve error:", err);
    }
  };

  const handleFinalizeOutcome = async () => {
    try {
      setTxError(null);
      setTxStatus("pending");

      const hash = await writeContractAsync({
        address: ORACLE_ADDRESS,
        abi: ORACLE_ABI,
        functionName: "finalizeUndisputedOutcome",
        args: [market.contractAddress as `0x${string}`],
      });

      setTxHash(hash);
      await syncAndRefresh("finalize", hash, { finalOutcome: market.latestOracleEvent?.proposed || "YES" });
    } catch (err: unknown) {
      setTxStatus("error");
      const errorMessage = err instanceof Error ? err.message : "Failed to finalize outcome";
      setTxError(errorMessage);
      console.error("Finalize error:", err);
    }
  };

  const renderOracleActions = () => {
    switch (market.oracleStatus) {
      case "CLOSED":
        return (
          <div className="space-y-4">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              This market is closed and open for outcome proposal. Anyone can
              propose an outcome by posting the proposer bond.
            </p>

            <div className="space-y-3">
              <div>
                <Label className="text-xs">Proposed Outcome</Label>
                <div className="flex gap-2 mt-2">
                  {(["YES", "NO"] as const).map((outcome) => (
                    <Button
                      key={outcome}
                      variant={selectedOutcome === outcome ? "default" : "outline"}
                      onClick={() => setSelectedOutcome(outcome)}
                      className="flex-1"
                      disabled={isPending || isConfirming}
                    >
                      {outcome}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label className="text-xs">Proposer Bond</Label>
                <div className="mt-1 flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
                  <span className="font-mono font-semibold">{formatEth(proposerBondWei, 4)}</span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">Fixed by oracle</span>
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">This bond is set by the oracle contract and is returned if the proposal is upheld.</p>
              </div>

              <Button
                onClick={handleProposeOutcome}
                disabled={isPending || isConfirming || !userAddress}
                className="w-full"
              >
                {isPending || isConfirming ? (
                  <>
                    <Loader className="mr-2 h-4 w-4 animate-spin" />
                    Proposing...
                  </>
                ) : (
                  "Propose Outcome"
                )}
              </Button>
            </div>
          </div>
        );

      case "PROPOSED":
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-800 dark:bg-blue-900/20 dark:text-blue-100">
              <div className="font-medium">Dispute window: {formatCountdown(disputeTimeLeft)}</div>
              <p className="mt-1 text-xs text-blue-800 dark:text-blue-300">Proposed outcome: <span className="font-semibold">{market.latestOracleEvent?.proposed}</span></p>
            </div>
            {isDisputeWindowOpen ? (
              <div className="space-y-3">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">Challenge this proposal by posting the fixed dispute bond. Anyone with a connected wallet may dispute.</p>
                <div><Label className="text-xs">Dispute Bond</Label><div className="mt-1 flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900"><span className="font-mono font-semibold">{formatEth(disputerBondWei, 4)}</span><span className="text-xs text-zinc-500">Fixed by oracle</span></div></div>
                <Button onClick={handleDisputeOutcome} disabled={isPending || isConfirming || !userAddress} className="w-full">{isPending || isConfirming ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Disputing...</> : "Dispute Outcome"}</Button>
              </div>
            ) : (
              <div className="space-y-3"><p className="text-sm text-zinc-600 dark:text-zinc-400">The dispute window has closed without a challenge. Anyone can now finalize the proposed outcome.</p><Button onClick={handleFinalizeOutcome} disabled={isPending || isConfirming || !userAddress} className="w-full">{isPending || isConfirming ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Finalizing...</> : "Finalize Outcome"}</Button></div>
            )}
          </div>
        );

      case "DISPUTED":
        if (isResolver !== true) {
          return <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"><p className="font-medium text-zinc-900 dark:text-zinc-100">Resolution restricted</p><p className="mt-1 text-xs">Only whitelisted resolvers can resolve this dispute.{!userAddress ? " Connect a resolver wallet to continue." : ""}</p></div>;
        }
        return (
          <div className="space-y-4">
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-900/20 dark:text-red-100"><div className="font-medium">Resolution window: {formatCountdown(resolutionTimeLeft)}</div><p className="mt-1 text-xs text-red-800 dark:text-red-300">Resolution is limited to whitelisted resolvers and requires no bond.</p></div>
            <div className={isResolutionWindowOpen ? "space-y-3" : "space-y-3 opacity-50"} aria-disabled={!isResolutionWindowOpen}>
              <div><Label className="text-xs">Final Outcome</Label><div className="mt-2 flex gap-2">{(["YES", "NO"] as const).map((outcome) => <Button key={outcome} variant={selectedOutcome === outcome ? "default" : "outline"} onClick={() => setSelectedOutcome(outcome)} className="flex-1" disabled={!isResolutionWindowOpen || isPending || isConfirming}>{outcome}</Button>)}</div></div>
              <div><Label className="text-xs">Resolution Decision</Label><div className="mt-2 flex gap-2" aria-live="polite"><Button variant={isProposerCorrect ? "default" : "outline"} className="flex-1" disabled>Proposer Correct</Button><Button variant={!isProposerCorrect ? "default" : "outline"} className="flex-1" disabled>Disputer Correct</Button></div><p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">Set automatically from the selected final outcome and the original {proposedOutcome} proposal.</p></div>
              <Button onClick={handleResolveOutcome} disabled={!isResolutionWindowOpen || isPending || isConfirming || !userAddress} className="w-full">{isPending || isConfirming ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Resolving...</> : "Resolve Dispute"}</Button>
            </div>
          </div>
        );

      case "RESOLVED":
        return <div className="space-y-3"><div className="rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-100"><p className="font-medium">Ready for finalization</p><p className="mt-1 text-xs text-violet-800 dark:text-violet-300">The dispute period ended without a dispute. No bond is required.</p></div><Button onClick={handleFinalizeOutcome} disabled={isPending || isConfirming || !userAddress} className="w-full">{isPending || isConfirming ? <><Loader className="mr-2 h-4 w-4 animate-spin" />Finalizing...</> : "Finalize Outcome"}</Button></div>;

      case "FINALIZED":
        return null;

      default:
        return null;
    }
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0">
        <DialogHeader className="border-b border-zinc-200 px-6 py-5 pr-12 dark:border-zinc-800">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-lg">{market.title || market.id}</DialogTitle>
              <DialogDescription className="mt-1 line-clamp-2 text-sm">
                {market.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="max-h-[calc(90vh-101px)] space-y-5 overflow-y-auto overscroll-contain px-6 py-5 [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-zinc-300 dark:[&::-webkit-scrollbar-thumb]:bg-zinc-700 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
          {/* Market Details */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Market Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-zinc-500">Category</Label>
                  <p className="text-sm font-medium mt-1">{market.category}</p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Creator</Label>
                  <p className="text-xs font-medium font-mono mt-1">
                    {
                      //formatAddress(market.creator)
                      market.creator
                    }
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Total Volume</Label>
                  <p className="text-sm font-medium mt-1">
                    {formatEth(BigInt(market.collateral), 4)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Closed On</Label>
                  <p className="text-sm font-medium mt-1">{endDate}</p>
                </div>
                {market.resolutionSource && (
                  <div className="col-span-2">
                    <Label className="text-xs text-zinc-500">
                      Resolution Source
                    </Label>
                    <p className="text-sm font-medium mt-1">
                      {market.resolutionSource}
                    </p>
                  </div>
                )}
              </div>

              {/* Probability Visualization */}
              <div className="pt-2 border-t">
                <Label className="text-xs text-zinc-500">Final Market Probabilities</Label>
                <div className="mt-2 space-y-2">
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium">YES</span>
                      <span className="text-xs font-bold">
                        {yesPercent}%
                      </span>
                    </div>
                    <Progress
                      value={Number(yesPercent)}
                      className="h-2"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between mb-1">
                      <span className="text-xs font-medium">NO</span>
                      <span className="text-xs font-bold">
                        {noPercent}%
                      </span>
                    </div>
                    <Progress
                      value={Number(noPercent)}
                      className="h-2"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Oracle Event Details */}
          {market.latestOracleEvent && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Oracle Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500">Proposer</Label>
                    <p className="text-xs font-medium font-mono mt-1">
                      {//formatAddress(market.latestOracleEvent.proposer)
                        market.latestOracleEvent.proposer
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">Disputer</Label>
                    <p className="text-xs font-medium font-mono mt-1">
                      {market.latestOracleEvent.disputer ? (market.latestOracleEvent.disputer) : "Undisputed"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">
                      Proposed Outcome
                    </Label>
                    <p className="text-sm font-medium font-mono mt-1">
                      {market.latestOracleEvent.proposed}
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">
                      Disputed Outcome
                    </Label>
                    <p className="text-sm font-medium font-mono mt-1">
                      {
                        market.latestOracleEvent.disputer
                          ? market.latestOracleEvent.proposed === "YES"
                            ? "NO"
                            : "YES"
                          : "Undisputed"
                      }
                    </p>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">Final Outcome</Label>
                    <p className="text-sm font-medium font-mono mt-1">
                      {market.latestOracleEvent.finalized || "Pending"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Finalized markets are informational only; all other states expose their valid action. */}
          {market.oracleStatus !== "FINALIZED" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Oracle Actions</CardTitle>
              </CardHeader>
              <CardContent>{renderOracleActions()}</CardContent>
            </Card>
          )}

          {/* Transaction Status */}
          {txStatus !== "idle" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {txStatus === "pending" || isConfirming ? (
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 flex items-start gap-3">
                  <Loader className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5 animate-spin flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-blue-900 dark:text-blue-100">
                      Transaction Pending
                    </h4>
                    <p className="text-xs text-blue-800 dark:text-blue-300 mt-1">
                      {txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline flex items-center gap-1"
                        >
                          View on Etherscan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ) : txStatus === "success" ? (
                <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 flex items-start gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-emerald-900 dark:text-emerald-100">
                      Transaction Successful
                    </h4>
                    <p className="text-xs text-emerald-800 dark:text-emerald-300 mt-1">
                      {txHash && (
                        <a
                          href={`https://sepolia.etherscan.io/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline flex items-center gap-1"
                        >
                          View on Etherscan
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              ) : txStatus === "error" ? (
                <div className="p-4 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-semibold text-sm text-red-900 dark:text-red-100">
                      Transaction Failed
                    </h4>
                    <p className="text-xs text-red-800 dark:text-red-300 mt-1">
                      {txError}
                    </p>
                  </div>
                </div>
              ) : null}
            </motion.div>
          )}

          {/* Info Box */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Oracle Parameters</CardTitle>
              <CardDescription className="text-xs">
                Key parameters for this oracle resolution process
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-xs text-zinc-500">Proposer Bond</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {formatEth(proposerBondWei, 4)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Disputer Bond</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {formatEth(disputerBondWei, 4)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Dispute Window</Label>
                  <p className="text-sm font-semibold mt-1">
                    {formatSeconds(config.disputeWindowSeconds)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Resolution Window</Label>
                  <p className="text-sm font-semibold mt-1">
                    {formatSeconds(config.resolutionDeadlineSeconds)}
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-zinc-500">Proposer Bounty</Label>
                  <p className="text-sm font-semibold mt-1 font-mono">
                    {formatEth(proposerBountyWei, 4)}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 flex items-start gap-3 mb-10">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h4 className="font-semibold text-sm text-amber-900 dark:text-amber-100">
                Important
              </h4>
              <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
                Ensure you have sufficient ETH for the required bond amount and
                gas fees before proceeding.
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
