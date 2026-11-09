# Canada AI: the two binding, code-checkable AI rules in Canada today. Canada has no federal AI act (the proposed Artificial
# Intelligence and Data Act died when Parliament was prorogued in January 2025), so this specialist checks a Quebec privacy
# rule and an Ontario employment rule. Facts come from src/extractors.ts; this policy decides. Not legal advice.
#
# input:
#   automated_decisions     [{file, detail}]  code that approves/rejects/bans/... a person from a score or model output
#   human_review_in_change  bool              the change routes decisions to a person (absent = false)
#   ai_screening            [{file, detail}]  AI/model calls in a hiring (applicant, resume, candidate) context
#   posting_discloses_ai    bool              a job-posting template in the change says AI is used to screen (absent = false)
#   declarations            object            compliance/ai-system.json (absent = {}); see docs/examples/ai-system.json
package committee.canada_ai

import rego.v1

# A declared value counts only if it is a non-blank string.
declared(path) if {
	value := object.get(object.get(input, "declarations", {}), path, "")
	is_string(value)
	trim_space(value) != ""
}

# ---------- Quebec Law 25, s. 12.1 (in force 2023-09-22) ----------
# A business that makes a decision about a person based exclusively on automated processing must tell the person, and on
# request let them have the decision reviewed by someone who can change it.

automated_decision_covered if {
	declared(["automated_decisions", "notice"])
	declared(["automated_decisions", "human_review"])
}

deny contains {
	"rule": "automated_decision_without_notice",
	"title": "Automated decision about a person with no notice or human review route",
	"message": sprintf(
		"This change appears to decide about a person by automated processing alone (%s), and nothing in the change sends the decision to a person. Quebec requires telling the person and offering a review by someone who can change the decision. Add a human-review step, or declare automated_decisions.notice and automated_decisions.human_review in compliance/ai-system.json. This is a pattern match: it flags the code for human review, it does not prove a violation.",
		[object.get(s, "detail", "")],
	),
	"citations": ["Quebec Law 25, s. 12.1 (Act respecting the protection of personal information in the private sector)"],
	"file": s.file,
} if {
	some s in input.automated_decisions
	not object.get(input, "human_review_in_change", false)
	not automated_decision_covered
}

# ---------- Ontario Employment Standards Act, 2000, s. 8.4(1) and O. Reg. 476/24 (in force 2026-01-01) ----------
# Employers with 25 or more employees must say in a publicly advertised job posting if AI is used to screen, assess or
# select applicants. A warning, not a block: headcount and exemptions cannot be seen in code.

warn contains {
	"rule": "ai_screening_without_disclosure",
	"title": "AI screens job applicants but no posting discloses it",
	"message": sprintf(
		"This change uses AI in a hiring context (%s). In Ontario, an employer with 25 or more employees must state in a publicly advertised job posting that AI is used to screen, assess or select applicants. Add the statement to your posting template, or record it as hiring.ai_screening_disclosure in compliance/ai-system.json. Only a warning: the employee threshold and exemptions (internal postings, work performed outside Ontario) cannot be known from code.",
		[object.get(s, "detail", "")],
	),
	"citations": ["Ontario Employment Standards Act, 2000, s. 8.4(1)", "O. Reg. 476/24"],
	"file": s.file,
} if {
	some s in input.ai_screening
	not object.get(input, "posting_discloses_ai", false)
	not declared(["hiring", "ai_screening_disclosure"])
}
