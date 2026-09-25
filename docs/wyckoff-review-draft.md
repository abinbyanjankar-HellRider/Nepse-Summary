# Wyckoff analysis: corrections draft for review

*Draft, 2026-09-24. Nothing in `index.html` has been changed yet.* Every figure
comes from `data/history/index.csv` (MeroLagani daily closes, 2020-01-01 →
2026-09-24; turnover in Rs, and 1 Ar = Rs 1 B). You can re-check any level with
`python .claude/skills/nepse-wyckoff-review/levels.py`.

The page's analysis was written in May 2026 from interpolated monthly data.
The numbers in **Part 1** are plain factual corrections. **Part 2** is an
updated reading of the structure, which is your call. **Part 3** lists the
questions I need you to answer before I apply anything.

---

## Part 1: Factual corrections (the data settles these)

| Where on the page | Page says | Real data | Proposed text |
|---|---|---|---|
| Header card, ruler, chart line, `LIVE_SNAPSHOT.ath`, HTF table, emotion timeline | ATH **3,079.8 (Jul 2021)** | Highest close **3,198.60 on 2021-08-18**. 3,079.83 was only the Jul 29 2021 month-end. | "ATH 3,198.6 (Aug 2021)" |
| Header "−17% from ATH" (runtime) | computed from 3,079.8 | from 3,198.6 the current 2,629.81 is **−17.8%** | Updates automatically once `ath` is fixed |
| "2025 Cycle High", chart line, `cycle_high`, HTF table, LPSY zone | **2,983 (Jul 2025)** | **3,002.07 on 2025-07-29**. Week of Jul 27: 96.9 Ar, the heaviest week of the cycle. | "2025 high 3,002 (Jul 29 2025)" |
| "SC / TR Floor", Ice line, support table, ruler, chart line, `sc_low` | **2,440–2,460, Nov–Dec 2025** | 2025 low **2,487.17 on 2025-10-16**. No close in 2025–26 went below 2,487. Nov–Dec 2025 low: 2,540.57. | "Range low 2,487 (Oct 16 2025)" |
| HTF table "Markdown Low (2023) LL ~1,700" | ~1,700 in 2023 | **1,815.13 on 2022-09-25**. The 2023 low was 1,818.31. | "Markdown low 1,815 (Sep 2022)" |
| HTF table "Recovery High (Jul 2024) LH ~2,390" | ~2,390 | Jul 2024 closed the month at 2,760.9. The 2024 high was **3,000.81 on 2024-08-15**, a record Rs 30 B day. | "2024 high 3,001 (Aug 15 2024), buying climax" |
| HTF table "Nov 2024 pullback HL ~2,424" | ~2,424 | The Sep 2024 – Jun 2025 low was **2,464.40 on 2024-09-29**. The Nov 2024 range was 2,667–2,760. | "Sep 2024 reaction low 2,464" |
| BOS card "CHoCH — Nov 2024 … ~2,355 → ~2,459 in a single session" | one-day jump | No such session exists. The biggest 2024 one-day gains were +6.0% (Mar 4, 2,078) and +4.7% (Sep 2, 2,823). | Remove, or "CHoCH — Jul 2024: +37% in 35 days (Jul 8 → Aug 12)" |
| Emotion timeline "#3 falls >50% from ATH to ~1,700" | >50% | 3,198.6 → 1,815.1 = **−43.3%** | "falls 43% from ATH to 1,815" |
| Emotion timeline "#4 45% rally in 35 days (Aug 2024)" | 45% | best 35-day gain **+37.2%** (2024-07-08 → 08-12) | "37% rally in 35 days (Jul–Aug 2024)" |
| Emotion timeline "#6 Nov 2025 — falls from 2,983 to 2,440" | Nov 2025 | 3,002 (Jul 29) → **2,487 (Oct 16)** | "Oct 2025 — falls from 3,002 to 2,487" |
| Volume panel "Nov 2024 SC event Rs 15.5 Ar" | SC in Nov 2024 | Nov 2024 was a pause inside the 2024–25 top (2,667–2,760), not an SC. | Replace with "Oct 2025 low week: Rs 21.4 Ar" |
| Money management "2.5 : 1 minimum" next to the page's own trade | trade shown is 1.16:1 (T1) | contradicts its own rule | Fixed by the new scenario numbers in Part 2 |
| Bear scenario "Short entry 2,800–2,840" | short selling | **NEPSE has no short selling.** The entry also sits 200+ pts above its own trigger (<2,600), and "~2:1" doesn't match its numbers (5.7–19:1). | Recast as "Exit / stay out" (Part 2) |

**Contradictions the page shows today.** These are code-driven or static labels:
- **Invalidation hit, bias unchanged.** The page's own rule is "weekly close below 2,600 invalidates the accumulation". There were **17 closes below 2,600 between 2026-07-13 and 2026-09-14**, with a low of 2,513.42 on Aug 31. The page still says "HH–HL chain intact ✓ Bullish", "Cautiously Bullish", "LPS (NOW) 2,680–2,730" and "SOW: currently not observed".
- **JAC shown as "⏳ Not yet".** In fact **13 closes above 2,838 (2026-03-09 → 04-17)**, with a peak of **2,960.40 on Mar 24**. The week of Mar 22 traded 82.5 Ar, double the page's own ">40 Ar/week" JAC test. The breakout happened and then **failed**.
- **The Trading Range ruler is frozen HTML** at NOW 2,558 with "−2.1% risk". A code comment says JS updates it, but nothing does. Proposal: compute it from `LIVE_SNAPSHOT` and the level constants (code change, see Q4).

---

## Part 2: Updated structure (interpretation, your call)

### What the tape shows since the 2024 markup

| Date | Close | Turnover | Event candidate |
|---|---|---|---|
| 2024-08-15 | 3,000.81 | Rs 30.0 B (record) | Buying climax of the 2024 markup |
| 2024-09-29 | 2,464.40 | | Automatic reaction |
| 2025-07-29 | 3,002.07 | week 96.9 Ar | Retest of the 3,000 high on climactic volume (double top) |
| 2025-09-18 | 2,511.91 | 0.7 B (reopening after the Sep 8–18 closure) | Shock low |
| **2025-10-16** | **2,487.17** | week 21.4 Ar | **Range low** (SC in the page's schematic) |
| 2026-01-25 | 2,772.17 | 13.8 B | **Rally high** (the AR, which is where the Creek should sit) |
| 2026-02-22 | 2,614.55 | 6.7 B | Secondary test, held well above 2,487 |
| **2026-03-24** | **2,960.40** | week 82.5 Ar | **Breakout above 2,772/2,838 on the heaviest volume of the range, then failed** |
| 2026-04-15 | 2,866.87 | 10.5 B | Lower high |
| 2026-07-13 | 2,570.18 | 7.5 B | First close below 2,600 |
| **2026-08-31** | **2,513.42** | 20-day avg 4.2 B (vs 4.6 B at the Oct low) | **Test of the range low** on slightly lighter volume |
| 2026-09-24 | 2,629.81 | 5.4 B | Rebound off the test |

The range is **2,487 – 2,960**, eleven months old. Price sits in the lower third.
The data supports two readings, and the next move out of the range decides between them:

**Reading A: re-accumulation, Phase B (closest to your current thesis).**
- Oct 2025 = SC (2,487), Jan 2026 = AR (2,772, the real Creek), Feb 2026 = ST.
- The March 2026 thrust to 2,960 was an early SOS that couldn't hold. That is common in Phase B and doesn't break the range.
- Aug 31 2026 = ST of the SC on lighter volume. A dip below 2,487 that is quickly reclaimed would be the **Spring**.
- *Bullish confirmation:* weekly close above 2,772, then above 2,960 on more than 60 Ar/week (JAC).

**Reading B: distribution.**
- The 3,000 double top (Aug 2024 / Jul 2025, both climactic) = BC / UT.
- March 2026 at 2,960 on 82.5 Ar followed by failure = **UTAD**.
- The Jul–Sep 2026 closes below 2,600 = **SOW**. The current bounce is an LPSY candidate.
- *Bearish confirmation:* weekly close below 2,487 on rising turnover (the Ice break).

**My recommendation for the page:** present it as a **trading range, Phase B, bias
Neutral**. Keep Reading A as the working hypothesis, since that's the page's teaching
thread, but show Reading B and its trigger next to it. The current page states
the accumulation as settled while the data has hit its own invalidation, which
is the one thing the review should fix.

### Proposed replacement values

| Item | Current | Proposed |
|---|---|---|
| Phase badge / `LIVE_SNAPSHOT.phase` | "ST Retest — Accumulation #1" | "Trading Range — Phase B (2,487–2,960)" |
| `phase_sub` | "Testing 2,550–2,600 ST zone" | "Rebounding from 2,513 test of the Oct 2025 low" |
| `bias` / scenario badge | "Cautiously Bullish" / "Cautious — Watch 2,440 Ice" | "Neutral — range-bound; breakout decides" |
| Event cards | PS ~2,486 Dec 25 · SC 2,440 Nov–Dec 25 · AR 2,695–2,823 Dec 25 · ST 2,550–2,600 Jan 26 · Spring ~2,550 · SOS 2,714–2,838 developing · LPS 2,708–2,740 forming · JAC not yet | PS 2,512 (Sep 18 2025) · **SC 2,487 (Oct 16 2025)** · **AR 2,772 (Jan 25 2026)** · **ST 2,615 (Feb 22 2026)** · **SOS attempt 2,960 (Mar 24 2026), failed** · **ST of SC 2,513 (Aug 31 2026)** · Spring: *not yet*, would need a dip below 2,487 that is reclaimed · JAC: *attempted Mar 2026, failed* · SOW: *under watch*, closes below 2,600 Jul–Sep 2026 |
| Chart lines (`drawHLine`) | Ice/SC 2,440 · ST 2,600 · Creek 2,838 · 2025 High 2,983 · ATH 3,080 | Range low / SC **2,487** · Creek / AR **2,772** · Range top **2,960** · 2024–25 double top **3,001** · ATH **3,199** |
| Support table | 2,440–2,460 / 2,550–2,600 / 2,630–2,680 / 2,708–2,712 / 2,700 | **2,487–2,513** (range low, tested twice) · 2,570 (Jul 13 low) · 2,600 (round / former support, now pivot) |
| Resistance table | 2,790–2,812 / 2,838–2,840 / 2,950–2,983 / 3,079–3,080 / 3,000 | **2,772** (AR / Creek) · 2,838–2,867 (Apr lower high) · **2,960** (range top / failed breakout) · **3,000–3,002** (double top) · **3,199** (ATH) |
| Weekly structure table | TR High 2,823 · SC 2,440 · Spring 2,550 · SOS 2,812 · LPS 2,708 "must hold ✓" | Range high 2,960 (Mar 26) · lower high 2,867 (Apr 26) · lower low 2,513 (Aug 26), below the 2,600 pivot · **Weekly bias: bearish inside range until 2,772 is reclaimed** |
| HTF trend card | "Bullish (HH–HL) from Nov 2024" | "Sideways: 3,000 capped twice (Aug 24, Jul 25); range 2,487–3,002 since Sep 2024" |
| Invalidation card | "Below 2,600: HL structure broken" | "**Already triggered** (Jul–Sep 2026). New line in the sand: weekly close below **2,487**" |

**Trade scenarios** (NEPSE is long-only, so the bear case becomes risk management):

| | Bull: buy the range low | Bear: stand aside / exit |
|---|---|---|
| Trigger | Hold above 2,487 with a test on low turnover; better, reclaim 2,600 on rising volume | Weekly close below 2,487 on rising turnover |
| Entry | 2,520–2,560 (test of support) | Exit longs, no new entries |
| Stop | Close below 2,480 | — |
| Target 1 | 2,772 (AR / Creek): **+232 pts from 2,540 → 3.9 : 1** | Downside reference: 2,464 (Sep 2024 low), then 2,227 (2023 range high) |
| Target 2 | 2,960 (range top): **+420 pts → 7.0 : 1** | — |
| Invalidation | Weekly close below 2,487 | Weekly close back above 2,600 |

Money-management example and calculator defaults: capital 1,000,000 · risk 1.5% ·
entry 2,540 · stop 2,480 · T1 2,772 · T2 2,960 gives 250 units, NPR 635,000
position, 3.87 : 1 and 7.00 : 1. That meets the page's own "2.5 : 1 minimum".
Staged entry: 50% on the support test, 30% on a weekly close above 2,600, 20% on
a weekly close above 2,772.

**Emotion cycle "NOW":** replace "May 2026 — Disbelief / Cautious Hope… smart money
quietly completes accumulation at LPS" with "**Sep 2026 — Anxiety / Doubt.** Failed
March breakout, retest of the 2025 low. Whether this is fear (accumulation) or
denial (distribution) is decided at 2,487 / 2,772."

The **volume panel** is refreshed with real weeks: Jul 27 2025 = 96.9 Ar (climax) ·
Oct 12 2025 = 21.4 Ar (range low) · Mar 22 2026 = 82.5 Ar (failed breakout) ·
Aug 31 2026 = 13.0 Ar (test, lighter).

---

## Part 3: Questions before I apply anything

1. **Framing:** use the neutral "Trading range, Phase B" with Readings A and B shown
   (recommended), or keep the accumulation thesis with corrected numbers only?
2. **Scope:** apply Part 1 only (facts), or Parts 1 and 2 together?
3. **Trade scenarios:** use the long-only "buy range low / stand aside" pair above, or
   different entries or targets of your own?
4. **Make it stay correct:** should I have the header cards, ruler, chart lines
   and ATH distance read from one `WYCKOFF_LEVELS` object (plus `LIVE_SNAPSHOT.index`),
   so future level changes happen in one place and the ruler moves with price?
