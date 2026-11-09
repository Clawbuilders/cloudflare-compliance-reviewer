package committee.canada_ai_test

import data.committee.canada_ai
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

decision := [{"file": "src/hiring/screen.ts", "detail": "await rejectApplicant(applicant.id);"}]

screening := [{"file": "src/hiring/screen.ts", "detail": "AI call in a hiring context"}]

# ---------- Quebec Law 25, s. 12.1: decisions based exclusively on automated processing ----------

test_automated_decision_without_review_or_notice_blocks_citing_s_12_1 if {
	d := canada_ai.deny with input as {"automated_decisions": decision}
	"automated_decision_without_notice" in rules(d)
	some f in d
	"Quebec Law 25, s. 12.1 (Act respecting the protection of personal information in the private sector)" in f.citations
	contains(f.message, "human review")
}

test_human_review_in_the_change_means_not_exclusively_automated if {
	count(canada_ai.deny) == 0 with input as {"automated_decisions": decision, "human_review_in_change": true}
}

test_declared_notice_and_review_route_clears_the_block if {
	count(canada_ai.deny) == 0 with input as {
		"automated_decisions": decision,
		"declarations": {"automated_decisions": {"notice": "Emailed with the decision", "human_review": "Reply to request a review by our team"}},
	}
}

test_a_notice_alone_is_not_enough if {
	"automated_decision_without_notice" in rules(canada_ai.deny) with input as {
		"automated_decisions": decision,
		"declarations": {"automated_decisions": {"notice": "Emailed with the decision"}},
	}
}

test_blank_declarations_do_not_count if {
	"automated_decision_without_notice" in rules(canada_ai.deny) with input as {
		"automated_decisions": decision,
		"declarations": {"automated_decisions": {"notice": "  ", "human_review": ""}},
	}
}

test_no_decision_no_finding if {
	count(canada_ai.deny) == 0 with input as {}
}

# ---------- Ontario ESA 2000, ss. 8.1-8.6 and O. Reg. 476/24: AI in hiring must be disclosed on job postings ----------

test_ai_screening_without_disclosure_warns_citing_esa if {
	w := canada_ai.warn with input as {"ai_screening": screening}
	"ai_screening_without_disclosure" in rules(w)
	some f in w
	"Ontario Employment Standards Act, 2000, ss. 8.1-8.6" in f.citations
	"O. Reg. 476/24" in f.citations
	contains(f.message, "25 or more employees")
}

test_ai_screening_is_a_warning_never_a_block if {
	count(canada_ai.deny) == 0 with input as {"ai_screening": screening}
}

test_disclosure_in_a_job_posting_clears_the_warning if {
	count(canada_ai.warn) == 0 with input as {"ai_screening": screening, "posting_discloses_ai": true}
}

test_declared_disclosure_clears_the_warning if {
	count(canada_ai.warn) == 0 with input as {
		"ai_screening": screening,
		"declarations": {"hiring": {"ai_screening_disclosure": "We use AI to screen applications."}},
	}
}
