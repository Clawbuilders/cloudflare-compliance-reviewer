# Privacy (GDPR, PIPEDA, Quebec Law 25). Facts are extracted from the diff by deterministic extractors; this policy decides.
#
# input:
#   pii_logging [{file, detail}]                 personal data written to logs
#   trackers    [{file, name, consent_gated}]    analytics/advertising SDKs; absent consent_gated counts as false
#   new_hosts   [{file, host}]                   newly introduced third-party hosts
package committee.privacy

import rego.v1

deny contains {
	"rule": "pii_logging",
	"title": "Personal data written to logs",
	"message": sprintf("Logging personal data (%s) widens who can see it and how long it is kept. Log an opaque id instead.", [object.get(s, "detail", "")]),
	"citations": ["GDPR Art. 5(1)(c)", "GDPR Art. 32", "PIPEDA Principle 4.7"],
	"file": s.file,
} if {
	some s in input.pii_logging
}

deny contains {
	"rule": "tracker_without_consent",
	"title": sprintf("Tracker %s is not gated by consent", [object.get(s, "name", "unknown")]),
	"message": "Analytics or advertising trackers must wait for the visitor's consent. Initialise the SDK only after consent is recorded.",
	"citations": ["GDPR Art. 6", "GDPR Art. 7", "PIPEDA Principle 4.3", "Quebec Law 25 (consent)"],
	"file": s.file,
} if {
	some s in input.trackers
	not object.get(s, "consent_gated", false)
}

warn contains {
	"rule": "new_third_party_host",
	"title": sprintf("New third-party host %s", [object.get(s, "host", "unknown")]),
	"message": "Data sent to a new third party needs a processor agreement and a check on where it is stored.",
	"citations": ["GDPR Art. 28", "GDPR Art. 44", "PIPEDA Principle 4.1.3"],
	"file": s.file,
} if {
	some s in input.new_hosts
}
