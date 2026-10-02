package committee.sensitive_data_test

import data.committee.sensitive_data
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

test_card_data_denies_citing_pci_dss if {
	d := sensitive_data.deny with input as {"card_data": [{"file": "src/pay.ts", "detail": "console.log(cardNumber)"}]}
	"card_data_exposure" in rules(d)
	some f in d
	"PCI DSS v4.0 Req 3.3.1" in f.citations
}

test_health_data_denies_citing_phipa if {
	d := sensitive_data.deny with input as {"health_data": [{"file": "src/visit.ts", "detail": "log(healthCardNumber)"}]}
	"health_data_exposure" in rules(d)
	some f in d
	"PHIPA s. 12" in f.citations
}

test_both_kinds_produce_separate_findings if {
	i := {"card_data": [{"file": "a.ts", "detail": "x"}], "health_data": [{"file": "b.ts", "detail": "y"}]}
	count(sensitive_data.deny) == 2 with input as i
}

test_clean_change_has_no_findings if {
	count(sensitive_data.deny) == 0 with input as {"card_data": [], "health_data": []}
	count(sensitive_data.deny) == 0 with input as {}
	count(sensitive_data.warn) == 0 with input as {}
}
