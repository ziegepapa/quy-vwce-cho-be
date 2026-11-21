# ADR — Exit Plan als ausdrücklich nutzergesteuerte Rechenskizze

**Status: accepted for Draft implementation by owner, 2026-11-21.**
**Scope:** Simulation read-only UI only. This is a *narrow exception* to the informational-only glide-path presentation in [ADR-financial-policy-boundary.md](./ADR-financial-policy-boundary.md), not a repeal of its financial or tax policy.

## Decision

The owner explicitly approved an illustrative **Auszahlungsplan** in Simulation, but will select the actual use date later. Show an empty state until the owner **actively selects an existing Goal with a valid dueDate**. Never infer a use date from `settings.endDate`, `settings.planTarget`, the child's age, the current date, or the simulation target year. In particular, 2042 and 2050 are *not* defaults.

Allow the owner to choose:
1. one existing Goal and its date (read only, no automatic goal creation),
2. a review horizon of 3, 5, or 7 years (risk-awareness stages only), and
3. a *mathematical* 12/18/24-month window and an explicitly typed **nominal euro illustration budget**.

Only after **both** an eligible Goal and a user-entered budget exist may the UI show an equal-in-euros installment schedule and its remaining **illustration budget**. These installments are a mathematical explanation of the selected assumptions, not a proposed number of shares, executable broker instruction, projected portfolio value or investment allocation.

The timeline can mark: long-term accumulation, owner review, and planned provision, but **must not** propose equity/safe allocation ratios (including the legacy 100/50/0 glide table), recommendation to reallocate, or guaranteed returns. The owner must set the budget explicitly; even `Goal.amount` must not be silently reused because it can represent historical purchasing power. `Goal.protectedAmount` is displayed separately and is never deducted from, reassigned to, or otherwise mutated by the illustration.

Calendar date arithmetic is deterministic; installment rounding must sum to exactly the entered euro amount. The UI must state that installments describe a **budget to consider**, not future portfolio holdings or actual sale proceeds. No projected prices or shares; do not use today's portfolio balance as a future available-sale amount. State that multiple dates diversify sale timing but do **not** guarantee a better price and could perform worse than a single date.

## German tax boundary — unchanged

Show short *general* German-language educational notes on the Sparer-Pauschbetrag (EUR 1,000 individual under 2026 law, applies to capital income, **not to gross sale proceeds**), possible sale dates across calendar years, the conditional 30% Aktienfonds Teilfreistellung, and previously taxed Vorabpauschale. Cite current legislative sources in the UI as source links. Recheck the law at execution time; **no personalized tax calculations, no tax savings claims, no sell-year optimization, no FIFO or Vorabpauschale algorithm**, and clearly recommend a Steuerberater prior to real trades. No `estimateGermanExitTax` imports, no after-tax totals.

## Data preservation and release gate

- No calls that write to transactions, Goals, AppSettings, sync, backup, broker interfaces or onboarding. No dependencies or schema changes.
- Reuse the existing Goals list passed into Simulation. Never auto-select an eligible goal, and never auto-save any illustration input.
- Maintain German and Vietnamese copy, 390x844 responsiveness, accessibility, recovery read-only/onboarding gates and the existing scenario engine.
- Add deterministic unit tests for missing goal/date/amount, calendar offsets (including month-end/leap day), cents conservation, and policy boundary tests. Run normal CI, release, bundle, benchmark and Playwright; submit a Draft PR, only merge after owner action.
- PR #399 Silent Guardian remains separate, Draft and untouched. No server deployment.
- If the owner needs trade recommendations, precise tax planning, projections with guaranteed spending, or execution, this exception **does not** authorize them; a new reviewed ADR is needed.

## Relation to existing policy

[ADR-financial-policy-boundary.md](./ADR-financial-policy-boundary.md) still prohibits personalized investment recommendations, numerical asset-allocation targets, broker automation and personal tax calculations. The sole exception here is showing an **owner-requested, equal-installment arithmetic illustration** in a dedicated component labeled as non-executable. The legacy `getPlanPhase` allocation table remains unreachable from production Simulation.
