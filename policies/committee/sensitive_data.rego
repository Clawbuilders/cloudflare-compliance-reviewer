# Sensitive data: payment card data (PCI DSS) and personal health information (PHIPA, Ontario).
#
# input:
#   card_data   [{file, detail}]   card numbers/CVV in logs, fixtures, storage or telemetry
#   health_data [{file, detail}]   health identifiers in logs, fixtures, storage or telemetry
package committee.sensitive_data

import rego.v1

# Every committee policy exposes both `deny` and `warn` so specialists can query them uniformly.
# Exposure of card or health data is never merely a warning, so `warn` is intentionally empty.
warn := set()

deny contains {
	"rule": "card_data_exposure",
	"title": "Payment card data exposed",
	"message": sprintf("Card data appears in code or logs (%s). Never store or log card numbers or CVV; use a payment provider's tokens.", [object.get(s, "detail", "")]),
	"citations": ["PCI DSS v4.0 Req 3.3.1", "PCI DSS v4.0 Req 3.5.1"],
	"file": s.file,
} if {
	some s in input.card_data
}

deny contains {
	"rule": "health_data_exposure",
	"title": "Personal health information exposed",
	"message": sprintf("Health information appears in code or logs (%s). Keep it out of logs and fixtures and protect it with safeguards.", [object.get(s, "detail", "")]),
	"citations": ["PHIPA s. 12"],
	"file": s.file,
} if {
	some s in input.health_data
}
