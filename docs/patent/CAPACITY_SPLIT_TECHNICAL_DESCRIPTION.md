# Technical description: fair allocation of outbound leads by working capacity, with mid-period re-allocation

*For a patent attorney. Written on 4 November 2026 from the working implementation in Q-smart (`cap.js` and `routes-cap.js`).*

**Confidential.** Do not publish or show this outside the company before speaking to the patent attorney: a public disclosure can prevent a patent.

## 1. Field

Contact-centre workforce management. More precisely, the distribution of a monthly volume of outbound "leads" (contacts to call), divided into several campaigns, among a group of agents whose working time differs. The distribution is per agent, per campaign and per working day, and it is recomputed during the month when the conditions change.

## 2. The problem in the prior practice

- **Manual splits.** Team leads split the month's leads by hand in a spreadsheet, or by an equal number per agent.
- **Unfair to part-time and absent staff.** Part-timers, people on leave and people starting mid-month either get too many leads or too few. Usually only the total is adjusted, not each campaign, so some agents get a "better" mix of campaigns than others.
- **Rounding drift.** Rounding to whole leads leaves leads unassigned or over-assigned. Someone fixes it by hand, which is arbitrary and not repeatable.
- **Changes during the month.** When an agent is absent, a campaign gets more leads, or a person's share changes, the remaining leads are not re-split in a consistent way. Leads not worked on past days are lost or handled ad hoc.

## 3. Summary of the method

1. **Capacity.** For every agent and every remaining day of the period, the system works out the hours the agent can work. It uses their shift rota, public holidays and approved time off (whole day, half day or a number of hours). It then multiplies by a personal share factor (for example 50% for a trainee, 0% to exclude, up to 200%). The result is each agent's **weight**.
2. **Proportional allocation in exact integer arithmetic.** For every campaign, the remaining leads are split over the agents in proportion to their weights. Every agent gets **the same proportion of every campaign**, so everybody gets the same mix of campaigns.
3. **Rounding with three guarantees at once,** solved as a maximum-flow problem:
   - (a) **every campaign adds up exactly** to its number of leads;
   - (b) **every cell** (agent × campaign) is the exact fractional share rounded down or up;
   - (c) **every agent's total** is their exact fair total rounded down or up.

   So no agent is ever a whole lead away from their fair number.
4. **Tie-breaking without favouritism.** When agents are level for an extra lead, the order comes from a hash of the plan and version identifiers. The same agent does not always get the extra lead, yet the result can be reproduced exactly.
5. **Daily spreading.** Each agent's leads per campaign are spread over their working days in proportion to that day's hours. The same exact rounding is used, so every campaign and every day add up.
6. **Mid-period re-allocation.** During the period, the system detects:
   - leads not worked on past days (the agent was absent; or a dialer reports fewer worked leads)
   - new or removed leads in a campaign
   - people joining or leaving
   - changed shares or hours

   It then proposes a new split of **only the leads not yet worked**, over the capacity of the remaining days, starting tomorrow (or a chosen day). A person approves the proposal before agents see it. Every version is kept with its reasons, so the history can be audited.

## 4. Detailed description

### 4.1 Inputs
- **Campaigns** `c` with a lead count `n_c` (whole number).
- **Agents** `a`. For each agent and day `d`: hours `h_{a,d}` (in hundredths of an hour) from the rota minus approved leave, and a share factor `s_a` (in %).
- **The start day** `D` of the new split (the first day of the month for the first version, else tomorrow or a chosen later day).

### 4.2 Weights
`w_a = Σ_{d ≥ D} h_{a,d} × s_a`. All values are whole numbers. `W = Σ_a w_a`. If `W = 0` while leads remain, the split is refused ("nobody can work in the days left").

### 4.3 Apportionment (function `apportion(rows, weights)`)
For a matrix of row totals `n_r` (campaigns) and column weights `w_c` (agents), every computation is done in whole units of `1/W`, so there is no floating-point error.

1. **Round down.** For each cell: `v = n_r × w_c`, the floor share is `⌊v / W⌋`, and the remainder is `m_{r,c} = v mod W`. Row `r` still has to hand out `need_r = n_r − Σ_c ⌊v/W⌋` leads.
2. **Column bound.** For each column, the sum of remainders `R_c = Σ_r m_{r,c}`. The column may receive at most `⌈R_c / W⌉` extra leads.
3. **Flow network:**
   - source → row `r`, capacity `need_r`
   - row `r` → column `c`, capacity 1, only where `m_{r,c} > 0`
   - column `c` → sink, capacity `⌈R_c / W⌉`
   - a "slack" node from the source feeds 1 unit into every column whose remainders are not a whole multiple of `W`. Its total is `Σ_c ⌈R_c/W⌉ − Σ_r need_r`, so a column may also end up rounded down.
4. **Solve** the maximum flow (Dinic's algorithm). A row → column edge with flow 1 gives that cell one extra lead.

   The exact fractional allocation is itself a feasible flow, so a full integral flow always exists. The implementation checks this and reports an error if it ever did not hold.
5. **Preference among equivalent solutions.** Edges are added so that the cells with the largest remainders are tried first. The largest fractions therefore get the extra leads, which keeps the result close to the exact fractions.

**Result:** every cell is `⌊exact⌋` or `⌈exact⌉`, every row adds up exactly, and every column total is `⌊exact⌋` or `⌈exact⌉`.

### 4.4 Fair split (function `fairSplit(pool, people, salt)`)
- The agents are ordered by a hash (FNV-1a) of `salt | username`. The salt is the plan and version.
- The apportionment is then applied with campaigns as rows and agents as columns.
- The ordering decides which of several equivalent agents get the extra leads. It changes between versions, so the extra lead rotates fairly, while the same inputs always give the same result.

### 4.5 Daily spreading (function `daily(mine, hours)`)
The same apportionment, with an agent's campaigns as rows and their working days as columns, weighted by that day's hours. Days without hours get nothing. Each day's total is that day's exact share rounded down or up.

### 4.6 Re-allocation during the period
- **Worked leads.** For each past day, the leads assigned to an agent count as worked if the agent was at work that day (from the attendance records). If a dialer reports the real worked leads for that agent, day and campaign, the shortfall goes back into the pool instead.
- **The pool.** The leads not yet worked per campaign are `n_c − worked_c`. They are split again from day `D` with 4.2 to 4.5. Leads already worked, and the days before `D`, are never changed.
- **The reasons are listed:**
  - leads not worked on past days, per person (only those not already handled by an earlier version)
  - changed campaign totals
  - people added or removed
  - changed shares or hours
- **Approval.** The proposal is published as a new version only after a team lead or administrator approves it. The agents are then notified of their new numbers.

## 5. Advantages
- Fairness can be proven at three levels (campaign, cell, agent), not only on the total.
- Everybody gets an identical campaign mix, regardless of hours.
- Part-timers, leave and late starters are handled automatically, through hours.
- It always adds up: no lead is lost or created by rounding.
- The result can be reproduced and audited (every version, its inputs and its reasons are kept), and extra leads rotate without favouritism.
- Mid-month changes re-split only what is left, and leave work already done untouched.

## 6. Points for the attorney to assess
- The combination of (i) capacity weights from rota and leave, (ii) a single proportion per agent applied to every campaign, and (iii) integral rounding by max-flow with the three bounds. Max-flow rounding of matrices ("controlled rounding") is known in statistics. Its use for lead distribution together with capacity weights and versioned re-allocation may be the novel part.
- The hash-based tie-break that rotates between versions.
- Re-allocating only the unworked remainder, using real dialer counts when they are available, and attendance otherwise.
- Whether software patents of this kind are possible in the EU (they need a "technical effect") and in the US. Also whether keeping it a trade secret is the better choice.

## 7. Where it is in the code
- `cap.js`: `flowGraph` (Dinic max-flow), `apportion`, `fairSplit`, `daily`, `hoursOn`.
- `routes-cap.js`: the view of a plan (worked, lost and remaining leads per person and day), the proposal, the approval and the versions.
- **Tests:** `test/capacity.test.js` checks the three guarantees on 400 random cases, and the re-allocation scenarios.
