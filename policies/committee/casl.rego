# CASL (Canada's Anti-Spam Legislation) for commercial electronic messages.
#
# input:
#   email_senders [{file, has_unsubscribe, has_consent_evidence, has_sender_identity}]   absent flags count as false
package committee.casl

import rego.v1

flag(s, name) := object.get(s, name, false)

deny contains {
	"rule": "missing_unsubscribe",
	"title": "Email sender has no unsubscribe mechanism",
	"message": "Commercial messages must include a working unsubscribe mechanism that is honoured promptly.",
	"citations": ["CASL s. 6(2)(c)"],
	"file": s.file,
} if {
	some s in input.email_senders
	not flag(s, "has_unsubscribe")
}

warn contains {
	"rule": "missing_consent_evidence",
	"title": "No record of recipient consent",
	"message": "CASL requires express or implied consent. Store when and how each recipient consented.",
	"citations": ["CASL s. 6(1)(a)"],
	"file": s.file,
} if {
	some s in input.email_senders
	not flag(s, "has_consent_evidence")
}

warn contains {
	"rule": "missing_sender_identity",
	"title": "Message does not identify the sender",
	"message": "Include the sender's name and a mailing address and contact details in each message.",
	"citations": ["CASL s. 6(2)(a)"],
	"file": s.file,
} if {
	some s in input.email_senders
	not flag(s, "has_sender_identity")
}
