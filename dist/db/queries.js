import { getSupabase } from "./client.js";
export async function getMarkets() {
    const { data, error } = await getSupabase().from("markets").select("*");
    if (error)
        throw error;
    return (data ?? []);
}
export async function getMarketBySlabAddress(slabAddress) {
    const { data, error } = await getSupabase()
        .from("markets")
        .select("*")
        .eq("slab_address", slabAddress)
        .single();
    if (error && error.code !== "PGRST116")
        throw error;
    return data ?? null;
}
export async function insertMarket(market) {
    const { error } = await getSupabase().from("markets").insert(market);
    // Ignore unique constraint violations (market already exists)
    if (error && error.code !== "23505") {
        throw error;
    }
}
export async function upsertMarketStats(stats) {
    const { error } = await getSupabase()
        .from("market_stats")
        .upsert(stats, { onConflict: "slab_address" });
    // Ignore FK violations (23503) — slab may not be in markets table yet
    if (error && error.code !== "23503")
        throw error;
}
export async function insertTrade(trade) {
    const { error } = await getSupabase().from("trades").insert(trade);
    // BH8: Ignore unique constraint violations (23505 = unique_violation)
    // This allows the TradeIndexer to safely retry without crashing on duplicates
    if (error && error.code !== "23505") {
        throw error;
    }
}
export async function tradeExistsBySignature(txSignature) {
    const { data, error } = await getSupabase()
        .from("trades")
        .select("id")
        .eq("tx_signature", txSignature)
        .limit(1);
    if (error)
        throw error;
    return (data?.length ?? 0) > 0;
}
export async function insertOraclePrice(price) {
    const { error } = await getSupabase().from("oracle_prices").insert({
        slab_address: price.slab_address,
        price_e6: price.price_e6,
        timestamp: price.timestamp,
        tx_signature: price.tx_signature ?? null,
    });
    // Ignore FK violations (23503) — market may not be in DB yet
    if (error && error.code !== "23503")
        throw error;
}
export async function getRecentTrades(slabAddress, limit = 50) {
    const { data, error } = await getSupabase()
        .from("trades")
        .select("*")
        .eq("slab_address", slabAddress)
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error)
        throw error;
    return (data ?? []);
}
export async function get24hVolume(slabAddress) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await getSupabase()
        .from("trades")
        .select("size")
        .eq("slab_address", slabAddress)
        .gte("created_at", since);
    if (error)
        throw error;
    let total = 0n;
    for (const row of data ?? []) {
        // size is stored as string for BigInt precision
        try {
            const abs = BigInt(row.size) < 0n ? -BigInt(row.size) : BigInt(row.size);
            total += abs;
        }
        catch {
            total += BigInt(Math.abs(Number(row.size)));
        }
    }
    return { volume: total.toString(), tradeCount: (data ?? []).length };
}
export async function getGlobalRecentTrades(limit = 50) {
    const { data, error } = await getSupabase()
        .from("trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
    if (error)
        throw error;
    return (data ?? []);
}
export async function getPriceHistory(slabAddress, sinceEpoch) {
    const { data, error } = await getSupabase()
        .from("oracle_prices")
        .select("*")
        .eq("slab_address", slabAddress)
        .gte("timestamp", sinceEpoch)
        .order("timestamp", { ascending: true });
    if (error)
        throw error;
    return (data ?? []);
}
export async function insertFundingHistory(record) {
    const { error } = await getSupabase().from("funding_history").insert(record);
    if (error)
        throw error;
}
export async function getFundingHistory(slabAddress, limit = 100) {
    const { data, error } = await getSupabase()
        .from("funding_history")
        .select("*")
        .eq("market_slab", slabAddress)
        .order("timestamp", { ascending: false })
        .limit(limit);
    if (error)
        throw error;
    return data ?? [];
}
export async function getFundingHistorySince(slabAddress, sinceTimestamp) {
    const { data, error } = await getSupabase()
        .from("funding_history")
        .select("*")
        .eq("market_slab", slabAddress)
        .gte("timestamp", sinceTimestamp)
        .order("timestamp", { ascending: true });
    if (error)
        throw error;
    return data ?? [];
}
