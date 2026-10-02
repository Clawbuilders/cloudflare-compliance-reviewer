# AI governance. Our rules cover what a PR can show: AI is used but undeclared, or users are not told they face AI.
# Deeper declaration checks (EU AI Act, NIST AI RMF) are GOPAL queries run by the specialist on the declarations file.
#
# input:
#   ai_usage              [{file, provider}]   AI/LLM calls added by the PR
#   declarations_present  bool                 does compliance/ai-system.json exist? (absent = false)
#   user_facing           bool                 do end users interact with the AI output? (absent = false)
#   discloses_ai          bool                 does the UI tell users it is AI? (absent = false)
package committee.ai_governance

import rego.v1

uses_ai if count(input.ai_usage) > 0

deny contains {
	"rule": "missing_ai_declarations",
	"title": "AI used without a compliance declaration",
	"message": "This change adds AI usage but the repository has no compliance/ai-system.json describing the system, its oversight and its limits.",
	"citations": ["EU AI Act Art. 13", "NIST AI RMF GOVERN"],
	"file": object.get(input.ai_usage[0], "file", ""),
} if {
	uses_ai
	not object.get(input, "declarations_present", false)
}

warn contains {
	"rule": "missing_ai_disclosure",
	"title": "Users may not be told they are interacting with AI",
	"message": "User-facing AI output should be disclosed as AI-generated or AI-driven.",
	"citations": ["EU AI Act Art. 50"],
	"file": object.get(input.ai_usage[0], "file", ""),
} if {
	uses_ai
	object.get(input, "user_facing", false)
	not object.get(input, "discloses_ai", false)
}
