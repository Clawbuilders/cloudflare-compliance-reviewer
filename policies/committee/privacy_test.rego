package committee.privacy_test

import data.committee.privacy
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

test_pii_logging_denies_with_gdpr_and_pipeda_citations if {
	d := privacy.deny with input as {"pii_logging": [{"file": "src/user.ts", "detail": "console.log(user.email)"}]}
	"pii_logging" in rules(d)
	some f in d
	f.file == "src/user.ts"
	"GDPR Art. 5(1)(c)" in f.citations
	"PIPEDA Principle 4.7" in f.citations
}

test_ungated_tracker_denies if {
	d := privacy.deny with input as {"trackers": [{"file": "src/app.tsx", "name": "posthog", "consent_gated": false}]}
	"tracker_without_consent" in rules(d)
}

test_consent_gated_tracker_is_fine if {
	d := privacy.deny with input as {"trackers": [{"file": "src/app.tsx", "name": "posthog", "consent_gated": true}]}
	count(d) == 0
}

test_tracker_without_a_gate_flag_is_treated_as_ungated if {
	d := privacy.deny with input as {"trackers": [{"file": "src/app.tsx", "name": "ga"}]}
	"tracker_without_consent" in rules(d)
}

test_new_third_party_host_warns if {
	w := privacy.warn with input as {"new_hosts": [{"file": "src/api.ts", "host": "api.example-analytics.com"}]}
	"new_third_party_host" in rules(w)
	count(privacy.deny) == 0 with input as {"new_hosts": [{"file": "src/api.ts", "host": "api.example-analytics.com"}]}
}

test_clean_change_has_no_findings if {
	count(privacy.deny) == 0 with input as {"pii_logging": [], "trackers": [], "new_hosts": []}
	count(privacy.warn) == 0 with input as {"pii_logging": [], "trackers": [], "new_hosts": []}
}

test_empty_input_has_no_findings if {
	count(privacy.deny) == 0 with input as {}
	count(privacy.warn) == 0 with input as {}
}

test_one_finding_per_offending_site if {
	i := {"pii_logging": [{"file": "a.ts", "detail": "x"}, {"file": "b.ts", "detail": "y"}]}
	count(privacy.deny) == 2 with input as i
}
