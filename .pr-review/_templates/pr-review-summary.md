# Consolidated review summary template

> The body the lead posts as the **single** advisory GitHub review (`event=COMMENT`). Inline findings are
> attached as `comments[]` anchored to `path:line`; this body is the roll-up. Keep it scannable.
> Remember: the verdict is **advisory text** — the GitHub review event stays `COMMENT`, so nothing is
> blocked.

```markdown
## PR-review panel — advisory verdict: **REQUEST CHANGES** | **APPROVE**

_Advisory only — posted as a comment; does not block merge or change required checks._

**Lenses:** correctness (lead) · security · over-engineering
**Findings:** <n> total → <m> after dedupe · blocker <b> · major <j> · minor <i> · nit <k>

### 🔴 Blockers
- **[correctness] `path:line`** — <one-line claim>. <fix.>
- **[security] `path:line`** — <category> — <attack path>. <fix.>

### 🟠 Major
- **[over-engineering] `path:line`** — <simpler alternative>. <why it still satisfies the requirement.>

### 🟡 Minor
- **[lens] `path:line`** — <claim + fix.>

### ⚪ Nits (non-gating)
- **[lens] `path:line`** — <suggestion.>

### Per-lens roll-up
- **correctness:** <verdict + one-line focus summary>
- **security:** <verdict + one-line focus summary>
- **over-engineering:** <verdict + one-line focus summary>

---
_Run `/pr-fix <N>` to address these, or fix manually. Findings merged from 3 independent lenses; a
`[a][b]` tag means multiple lenses flagged the same line._

<!-- pr-review-verdict
{"schema":"pr-review-verdict/v1","pr":<N>,"verdict":"approve","fix_required":false,"findings":{"blocker":0,"major":0,"minor":<i>,"nit":<k>,"total_after_dedupe":<m>},"lenses":["correctness","security","over-engineering"]}
-->
```

**Notes**
- Omit a severity section if it has no findings.
- A deduped finding flagged by more than one lens carries all contributing tags (`[correctness][security]`)
  and the highest severity.
- Only `blocker`/`major` drive a **request-changes** advisory verdict; `minor`/`nit` never gate it.
- The trailing `<!-- pr-review-verdict … -->` block is **required** and is the last thing in the body. It is
  the machine-readable mirror of the prose verdict (see `ENGINE.md` § Machine-readable verdict block):
  `fix_required == (blocker + major) > 0`, and `verdict` must agree (`request-changes` ⇔ `fix_required:true`).
  It is wrapped in an HTML comment so it doesn't render, and emitted as one line so a consumer can `grep` it
  out of the raw review body in a single step. Keep its counts identical to the **Findings:** line above.
