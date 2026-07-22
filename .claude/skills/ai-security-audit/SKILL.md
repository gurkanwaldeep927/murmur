---
name: ai-security-audit
description: Method for stage-09 — auditing product-embedded LLM surfaces against OWASP LLM Top 10 with promptfoo/garak probes and static output-handling checks. Used by ai-security-agent.
---
# ai-security-audit

## Applicability test (run first, record evidence)
LLM SDK in lockfiles (anthropic, openai, @google/genai, bedrock, ollama,
langchain, llamaindex...) OR TRD integrations list names an LLM API. Neither
=> `applicable:false`, done.

## Method (per surface)
1. **Surface card:** entry point; which user-controlled text reaches the
   prompt (direct input, retrieved docs, tool results); what the output can
   do (rendered? executed? passed to tools? stored?). Excessive-agency check:
   list every tool/function the LLM can call and whether a human or policy
   gates destructive ones.
2. **Risk map:** tag each surface with LLM01–LLM10. Minimum mandatory checks:
   - LLM01 prompt injection: `promptfoo eval` with the built-in injection +
     jailbreak plugins against a dev instance; fallback `garak` probes.
     Record pass rate per probe class.
   - LLM02 insecure output handling: static — LLM output flowing into
     eval/exec, SQL, shell, unescaped HTML, or file paths => critical.
   - LLM06 sensitive info disclosure: grep prompt-assembly code and logs for
     secrets/PII interpolation; system prompts containing credentials =>
     critical.
   - LLM08 excessive agency: any write/delete/pay tool callable without
     confirmation gate => high.
   - LLM10-adjacent cost DoS: per-user rate limit + max_tokens bound on
     every LLM call; absent => high.
3. **No fabricated probes:** if a surface isn't reachable in dev, static
   checks only + finding `probe-not-run` (medium) so stage 15 sees the gap.
4. Findings/counts/status per the standard gate rule.
