/**
 * Network for all DB writes/reads.
 *
 * Set via NETWORK env var on each service (devnet | mainnet).
 * Defaults to 'devnet' to prevent accidental mainnet writes on unset deployments.
 * Services MUST set NETWORK=mainnet explicitly for mainnet Railway environments.
 */
export declare function getNetwork(): "devnet" | "mainnet";
export interface MarketRow {
    id: string;
    slab_address: string;
    mint_address: string;
    symbol: string;
    name: string;
    decimals: number;
    deployer: string;
    oracle_authority: string | null;
    initial_price_e6: number | null;
    max_leverage: number;
    trading_fee_bps: number;
    lp_collateral: string | null;
    matcher_context: string | null;
    status: string;
    /** Network this market belongs to: devnet or mainnet (migration 20260329180000) */
    network: "devnet" | "mainnet";
    created_at: string;
    updated_at: string;
    /** GH#1218: when true the indexer must NOT write market_stats for this slab (on-chain state is corrupt). */
    indexer_excluded?: boolean;
}
export interface MarketStatsRow {
    slab_address: string;
    last_price: number | null;
    mark_price: number | null;
    index_price: number | null;
    volume_24h: number | null;
    trade_count_24h: number | null;
    volume_total: number | null;
    open_interest_long: number | null;
    open_interest_short: number | null;
    insurance_fund: number | null;
    total_accounts: number | null;
    funding_rate: number | null;
    total_open_interest: number | null;
    net_lp_pos: string | null;
    lp_sum_abs: number | null;
    lp_max_abs: number | null;
    insurance_balance: number | null;
    insurance_fee_revenue: number | null;
    warmup_period_slots: number | null;
    vault_balance: number | null;
    lifetime_liquidations: number | null;
    lifetime_force_closes: number | null;
    c_tot: number | null;
    pnl_pos_tot: number | null;
    last_crank_slot: number | null;
    max_crank_staleness_slots: number | null;
    maintenance_fee_per_slot: string | null;
    liquidation_fee_bps: number | null;
    liquidation_fee_cap: string | null;
    liquidation_buffer_bps: number | null;
    updated_at: string | null;
}
export interface TradeRow {
    id: string;
    slab_address: string;
    trader: string;
    side: "long" | "short";
    size: number | string;
    price: number;
    fee: number;
    tx_signature: string | null;
    /** Network this trade was executed on (migration 20260329180000) */
    network?: "devnet" | "mainnet";
    created_at: string;
}
export interface OraclePriceRow {
    slab_address: string;
    price_e6: string;
    timestamp: number;
    tx_signature?: string | null;
    /** Network this price record belongs to (migration 20260329180000) */
    network?: "devnet" | "mainnet";
}
export declare function getMarkets(): Promise<MarketRow[]>;
export declare function getMarketBySlabAddress(slabAddress: string): Promise<MarketRow | null>;
export declare function insertMarket(market: Omit<MarketRow, "id" | "created_at" | "updated_at" | "network">): Promise<void>;
export declare function upsertMarketStats(stats: Partial<MarketStatsRow> & {
    slab_address: string;
}): Promise<void>;
export declare function insertTrade(trade: Omit<TradeRow, "id" | "created_at" | "network">): Promise<void>;
export declare function tradeExistsBySignature(txSignature: string): Promise<boolean>;
export declare function insertOraclePrice(price: OraclePriceRow): Promise<void>;
export declare function getRecentTrades(slabAddress: string, limit?: number): Promise<TradeRow[]>;
export declare function get24hVolume(slabAddress: string): Promise<{
    volume: string;
    tradeCount: number;
}>;
export declare function getGlobalRecentTrades(limit?: number): Promise<TradeRow[]>;
export declare function getPriceHistory(slabAddress: string, sinceEpoch: number): Promise<OraclePriceRow[]>;
export interface FundingHistoryRow {
    id: string;
    market_slab: string;
    slot: number;
    timestamp: string;
    rate_bps_per_slot: number;
    net_lp_pos: string;
    price_e6: number;
    funding_index_qpb_e6: string;
    /** Network this record belongs to (migration 20260329180000) */
    network?: "devnet" | "mainnet";
    created_at: string;
}
export declare function insertFundingHistory(record: {
    market_slab: string;
    slot: number;
    timestamp: string;
    rate_bps_per_slot: number;
    net_lp_pos: string;
    price_e6: number;
    funding_index_qpb_e6: string;
}): Promise<void>;
export declare function getFundingHistory(slabAddress: string, limit?: number): Promise<FundingHistoryRow[]>;
export declare function getFundingHistorySince(slabAddress: string, sinceTimestamp: string, limit?: number): Promise<FundingHistoryRow[]>;
