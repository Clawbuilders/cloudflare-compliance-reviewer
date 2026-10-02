package committee.ai_governance_test

import data.committee.ai_governance
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

usage := [{"file": "src/chat.ts", "provider": "workers-ai"}]

test_ai_usage_without_declarations_denies if {
	d := ai_governance.deny with input as {"ai_usage": usage, "declarations_present": false}
	"missing_ai_declarations" in rules(d)
	some f in d
	"NIST AI RMF GOVERN" in f.citations
}

test_ai_usage_with_declarations_does_not_deny if {
	count(ai_governance.deny) == 0 with input as {"ai_usage": usage, "declarations_present": true}
}

test_missing_flag_counts_as_no_declarations if {
	"missing_ai_declarations" in rules(ai_governance.deny) with input as {"ai_usage": usage}
}

test_user_facing_ai_without_disclosure_warns_citing_art_50 if {
	w := ai_governance.warn with input as {"ai_usage": usage, "declarations_present": true, "user_facing": true, "discloses_ai": false}
	"missing_ai_disclosure" in rules(w)
	some f in w
	"EU AI Act Art. 50" in f.citations
}

test_user_facing_ai_with_disclosure_is_fine if {
	count(ai_governance.warn) == 0 with input as {"ai_usage": usage, "declarations_present": true, "user_facing": true, "discloses_ai": true}
}

test_internal_ai_does_not_need_a_disclosure if {
	count(ai_governance.warn) == 0 with input as {"ai_usage": usage, "declarations_present": true, "user_facing": false}
}

test_no_ai_usage_means_no_findings if {
	count(ai_governance.deny) == 0 with input as {"ai_usage": [], "declarations_present": false}
	count(ai_governance.deny) == 0 with input as {}
	count(ai_governance.warn) == 0 with input as {}
}
