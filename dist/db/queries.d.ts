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
    created_at: string;
    updated_at: string;
}
export interface MarketStatsRow {
    slab_address: string;
    last_price: number | null;
    mark_price: number | null;
    index_price: number | null;
    volume_24h: number | null;
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
    created_at: string;
}
export interface OraclePriceRow {
    slab_address: string;
    price_e6: string;
    timestamp: number;
    tx_signature?: string | null;
}
export declare function getMarkets(): Promise<MarketRow[]>;
export declare function getMarketBySlabAddress(slabAddress: string): Promise<MarketRow | null>;
export declare function insertMarket(market: Omit<MarketRow, "id" | "created_at" | "updated_at">): Promise<void>;
export declare function upsertMarketStats(stats: Partial<MarketStatsRow> & {
    slab_address: string;
}): Promise<void>;
export declare function insertTrade(trade: Omit<TradeRow, "id" | "created_at">): Promise<void>;
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
export declare function getFundingHistorySince(slabAddress: string, sinceTimestamp: string): Promise<FundingHistoryRow[]>;
