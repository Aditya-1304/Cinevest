import { NextRequest, NextResponse } from "next/server";
import { getServerEnv } from "@/lib/env";
import { readJson } from "@/lib/http";

/**
 * Narrow relay for the creator wallet's own Rabdi RPC calls (reads, estimates, receipts and the
 * creator-signed raw transaction). The backend never signs entity writes; it only forwards the
 * calls a wallet client needs while keeping the node access key off the browser.
 */
const ALLOWED_METHODS = new Set([
    "eth_chainId",
    "net_version",
    "eth_gasPrice",
    "eth_blockNumber",
    "eth_getBalance",
    "eth_getTransactionCount",
    "eth_getBlockByNumber",
    "eth_getTransactionByHash",
    "eth_getTransactionReceipt",
    "eth_estimateGas",
    "eth_call",
    "eth_sendRawTransaction",
]);

export async function POST(request: NextRequest) {
    let body: unknown;
    try {
        body = await readJson(request);
    } catch {
        return NextResponse.json(
            { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
            { status: 400 },
        );
    }
    const rpcRequest = body as { method?: unknown; id?: unknown };
    if (
        !rpcRequest ||
        typeof rpcRequest !== "object" ||
        typeof rpcRequest.method !== "string" ||
        !ALLOWED_METHODS.has(rpcRequest.method)
    ) {
        return NextResponse.json(
            {
                jsonrpc: "2.0",
                id: rpcRequest?.id ?? null,
                error: { code: -32601, message: "Method not relayed" },
            },
            { status: 400 },
        );
    }
    let key = "";
    try {
        key = getServerEnv().ARKIV_ACCESS_KEY ?? "";
    } catch {
        key = "";
    }
    const nodeUrl = getServerEnv().ARKIV_RPC_URL ?? (key
        ? `https://rpc.rabdi.db-chain.testnet.arkiv.network/${encodeURIComponent(key)}`
        : "https://rpc.rabdi.db-chain.testnet.arkiv.network");
    try {
        const response = await fetch(nodeUrl, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) {
            return NextResponse.json(
                {
                    jsonrpc: "2.0",
                    id: rpcRequest.id ?? null,
                    error: { code: -32000, message: "Arkiv RPC is unavailable" },
                },
                { status: 503 },
            );
        }
        return new NextResponse(response.body, {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    } catch {
        return NextResponse.json(
            {
                jsonrpc: "2.0",
                id: rpcRequest.id ?? null,
                error: { code: -32000, message: "Arkiv RPC is unreachable" },
            },
            { status: 503 },
        );
    }
}
