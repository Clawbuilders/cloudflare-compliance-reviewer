package committee.casl_test

import data.committee.casl
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

sender(u, c, i) := {"email_senders": [{"file": "src/mail.ts", "has_unsubscribe": u, "has_consent_evidence": c, "has_sender_identity": i}]}

test_compliant_sender_has_no_findings if {
	count(casl.deny) == 0 with input as sender(true, true, true)
	count(casl.warn) == 0 with input as sender(true, true, true)
}

test_missing_unsubscribe_denies_citing_s6_2_c if {
	d := casl.deny with input as sender(false, true, true)
	"missing_unsubscribe" in rules(d)
	some f in d
	"CASL s. 6(2)(c)" in f.citations
}

test_missing_consent_evidence_warns_citing_s6_1_a if {
	w := casl.warn with input as sender(true, false, true)
	"missing_consent_evidence" in rules(w)
	some f in w
	"CASL s. 6(1)(a)" in f.citations
}

test_missing_sender_identity_warns_citing_s6_2_a if {
	w := casl.warn with input as sender(true, true, false)
	"missing_sender_identity" in rules(w)
}

test_absent_flags_are_treated_as_missing if {
	i := {"email_senders": [{"file": "src/mail.ts"}]}
	"missing_unsubscribe" in rules(casl.deny) with input as i
	count(casl.warn) == 2 with input as i
}

test_no_email_code_means_no_findings if {
	count(casl.deny) == 0 with input as {}
	count(casl.warn) == 0 with input as {"email_senders": []}
}
