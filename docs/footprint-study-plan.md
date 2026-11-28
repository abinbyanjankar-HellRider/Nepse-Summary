# Footprint chart: what it is and a 6-week study plan

*Context: the NepseAlpha footprint page for ADBL (`nepsealpha.com/foot-print/chart?symbol=ADBL`) could not be opened from the cloud session (the host was blocked), so nothing here describes that site's own settings or legend. This is general theory plus a plan to follow with the chart open. Educational material, not trading advice.*

## What a footprint chart is

A normal candle shows only open, high, low and close. A footprint splits each candle into price levels. At each level it shows how much traded at the bid (sellers hitting resting buy orders) and at the ask (buyers lifting resting sell orders).

| Term | Meaning |
|---|---|
| **Delta** | Ask volume minus bid volume, per level and for the whole bar. Positive means buyers were more aggressive; negative means sellers were. |
| **Cumulative delta** | A running total of delta across bars. |
| **POC** | The price level with the most volume in the bar. |
| **Imbalance** | One side clearly dominates. TradingView compares the ask at a level with the bid one level below. Thresholds are adjustable (300% is a common default). |
| **Stacked imbalance** | Several consecutive levels of imbalance in the same direction. Context decides the signal: stacking, a key level, and confirmation from cumulative delta. |
| **Absorption** | Heavy volume at a level with little price movement: one side is soaking up the other. |
| **Exhaustion** | Volume thins out at a new extreme, so the push has run out. |
| **Delta divergence** | Price makes a new high while delta is negative, or the reverse. |

## What to check first on NepseAlpha

The tool's value depends on its data. Find out before trusting any signal.

1. **Where does the bid/ask split come from?** A true footprint needs trade-level data with the aggressor side. As far as is known, NEPSE's public trade data gives price, quantity and the buyer and seller brokers, with no aggressor flag, so the buy-or-sell split is probably inferred (for example by comparing each trade with the previous price). Some indicators also approximate footprints from OHLC and volume. Look for the site's methodology note and verify; do not assume.
2. **Settings:** timeframe, price bin size, imbalance threshold, how delta is defined.
3. **Trading hours:** NEPSE trades about 4 hours a day (11:00-15:00), so intraday bars are few.
4. **Coverage:** how many days of footprint history exist for ADBL.

## 6-week plan (about 5-6 hours a week)

| Week | Focus | Do | Done when |
|---|---|---|---|
| **1** | Vocabulary and data provenance | Learn the terms above. Find NepseAlpha's method. Screenshot the ADBL chart at two timeframes. | You can say how the bid/ask split is made. |
| **2** | Reading single bars | Find about 10 examples each of absorption, exhaustion, stacked imbalance and unfinished auctions (volume on both bid and ask at an extreme) in ADBL history. Annotate them. | A journal of 40 annotated bars. |
| **3** | Context | Mark ADBL's daily and weekly levels (use `python .claude/skills/investment-analyst/analyze.py --symbol ADBL` and the Wyckoff approach). Ask of each footprint signal: was it at a level? | A signal counts only if it sits at a level. |
| **4** | Forward test | Write rules *before* looking, for example "stacked buy imbalance at support, next-day follow-through". Paper-trade 20+ signals and log the outcome. | Hit rate and average reward-to-risk against a price-only baseline. |
| **5** | A proxy in this repo | Build an approximate delta from OHLC and volume (close position in the bar x volume). Test whether it adds anything beyond price momentum on NEPSE history. | See `docs/footprint-proxy-experiment.md`. Treat the proxy as weak evidence. |
| **6** | Decision | Decide whether footprint earns a place in your process, and for which horizon. | A one-page checklist, or a decision to drop it. |

**Decision gate after week 4:** if the signals do not beat the price-only baseline, treat footprint as context only.

## Reading checklist (use on every bar)

1. Where is the bar relative to the daily levels?
2. Where is the POC: top, middle or bottom of the range?
3. Is delta consistent with the price move, or diverging?
4. Are there stacked imbalances, and at which levels?
5. Did volume at the extreme dry up (exhaustion) or pile up with no progress (absorption)?
6. Is there an unfinished auction to revisit?
7. Does the next bar confirm or reject?
8. What is the invalidation level, and is the reward-to-risk at least 2:1?

## Pitfalls specific to NEPSE

- **Delta is not buying pressure.** Every trade has both a buyer and a seller. The split is an inference, so be careful with an inferred delta.
- **Thin liquidity** makes single large trades dominate small footprints.
- **Overfitting:** with few intraday bars, patterns that look meaningful are easy to find by chance. The week 4 test guards against this.
- **Wrong horizon:** footprint is a short-horizon execution tool. It adds little for conservative and moderate investors and matters most for an active trader.
