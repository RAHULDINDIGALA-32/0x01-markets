/**
 * @description Fetch markets filtered by oracle status (CLOSED, DISPUTED, RESOLVED)
 *
 * Market closing is lazy:
 * - A market may remain OPEN in the database even after its endTime.
 * - An expired OPEN market is treated as CLOSED for oracle purposes.
 * - OPEN markets whose endTime is still in the future are excluded.
 *
 * Oracle status is determined from:
 * - Market status
 * - Market endTime
 * - Latest OracleEvent
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type OracleMarketStatus = "CLOSED" | "PROPOSED" | "DISPUTED" | "RESOLVED";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;

    const status = searchParams.get("status");
    const category = searchParams.get("category");
    const search = searchParams.get("search");

    const currentTime = BigInt(Math.floor(Date.now() / 1000));

    // Fetch markets that can potentially participate in the oracle flow.
    //
    // OPEN markets are included because market closing is lazy:
    // an expired OPEN market needs to be shown so that someone
    // can propose an outcome and trigger the closing process.
    const markets = await prisma.market.findMany({
      where: {
        AND: [
          {
            status: {
              in: ["OPEN", "CLOSED", "RESOLVED"],
            },
          },

          // Filter by category if provided
          category ? { category } : {},

          // Search by market ID, title, or contract address
          search
            ? {
                OR: [
                  {
                    id: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    title: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                  {
                    contractAddress: {
                      contains: search,
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {},
        ],
      },

      include: {
        oracleEvents: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

    /**
     * Determine the effective oracle status.
     *
     * Important:
     * An OPEN market can actually be expired because closing is lazy.
     *
     * OPEN + endTime > currentTime
     *     → still open → exclude from oracle markets
     *
     * OPEN + endTime <= currentTime
     *     → expired → treat as CLOSED
     *
     * CLOSED
     *     → CLOSED
     *
     * Latest event finalized
     *     → RESOLVED
     *
     * Latest event has a disputer
     *     → DISPUTED
     */
    const enrichedMarkets = markets
      .map((market) => {
        const latestEvent = market.oracleEvents[0];

        const isExpiredOpenMarket =
          market.status === "OPEN" &&
          market.endTime !== null &&
          market.endTime !== undefined &&
          market.endTime <= currentTime;

        if (
          market.status === "OPEN" &&
          !isExpiredOpenMarket
        ) {
          return null;
        }

        let oracleStatus: OracleMarketStatus = "CLOSED";

        if (latestEvent) {
          if (latestEvent.finalized) {
            oracleStatus = "RESOLVED";
          } else if (latestEvent.disputer !== null) {
            oracleStatus = "DISPUTED";
          } else if (latestEvent.proposer) {
            oracleStatus = "PROPOSED"
          } else {
            oracleStatus = "CLOSED";
          }
        } else {
          // CLOSED markets and expired OPEN markets both
          // start the oracle process as CLOSED.
          oracleStatus = "CLOSED";
        }

        return {
          ...market,

          // For an expired OPEN market, expose the effective
          // market status as CLOSED to the frontend
          status: isExpiredOpenMarket ? "CLOSED" : market.status,

          oracleStatus,

          latestOracleEvent: latestEvent ?? null,
        };
      })
      // Remove still-active OPEN markets
      .filter((market): market is NonNullable<typeof market> => market !== null);

    // Valid oracle status filters
    const validOracleStatuses: OracleMarketStatus[] = [
      "CLOSED",
      "PROPOSED",
      "DISPUTED",
      "RESOLVED",
    ];

    // Apply oracle status filter if provided
    const filtered =
      status &&
      validOracleStatuses.includes(status as OracleMarketStatus)
        ? enrichedMarkets.filter(
            (market) => market.oracleStatus === status
          )
        : enrichedMarkets;

    /**
     * Prisma can return BigInt values.
     * JSON.stringify / NextResponse.json cannot serialize BigInt,
     * so convert all BigInt values to strings before returning.
     */
    const serialized = JSON.parse(
      JSON.stringify(filtered, (_, value) =>
        typeof value === "bigint" ? value.toString() : value
      )
    );

    return NextResponse.json(serialized);
  } catch (error) {
    console.error("Error fetching oracle markets:", error);

    return NextResponse.json(
      {
        error: "Failed to fetch markets",
      },
      {
        status: 500,
      }
    );
  }
}