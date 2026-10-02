# Change control (SOC 2-style, CC8.1). Facts come from the diff and the PR; this policy decides.
#
# input:
#   changed_paths      [string]  files touched by the PR
#   approvals          number    current approving reviews (default 0)
#   required_approvals number    approvals needed for sensitive changes (default 1)
#   max_files          number    blast-radius limit (default 25)
package committee.change_control

import rego.v1

approvals := object.get(input, "approvals", 0)

required := object.get(input, "required_approvals", 1)

max_files := object.get(input, "max_files", 25)

cites := ["SOC 2 CC8.1 (change management)"]

sensitive contains {"path": p, "category": "ci"} if {
	some p in input.changed_paths
	startswith(p, ".github/workflows/")
}

sensitive contains {"path": p, "category": "ci"} if {
	some p in input.changed_paths
	p == ".gitlab-ci.yml"
}

sensitive contains {"path": p, "category": "infra"} if {
	some p in input.changed_paths
	some prefix in ["infra/", "terraform/", "k8s/", "helm/", "deploy/"]
	startswith(p, prefix)
}

sensitive contains {"path": p, "category": "infra"} if {
	some p in input.changed_paths
	some suffix in ["wrangler.json", "wrangler.jsonc", "wrangler.toml", "Dockerfile", ".tf"]
	endswith(p, suffix)
}

sensitive contains {"path": p, "category": "auth"} if {
	some p in input.changed_paths
	contains(lower(p), "auth")
}

sensitive contains {"path": p, "category": "policy"} if {
	some p in input.changed_paths
	startswith(p, "policies/")
}

sensitive_non_policy := {s | some s in sensitive; s.category != "policy"}

policy_changes := {s | some s in sensitive; s.category == "policy"}

warn contains {
	"rule": "sensitive_change_without_approval",
	"title": "Sensitive files changed without enough approvals",
	"message": sprintf("%d sensitive file(s) (CI, infrastructure or authentication) changed with %d of %d required approval(s).", [count(sensitive_non_policy), approvals, required]),
	"citations": cites,
} if {
	count(sensitive_non_policy) > 0
	approvals < required
}

warn contains {
	"rule": "blast_radius",
	"title": "Very large change",
	"message": sprintf("This PR touches %d files (limit %d). Large changes are hard to review; consider splitting it.", [count(input.changed_paths), max_files]),
	"citations": cites,
} if {
	count(input.changed_paths) > max_files
}

# Weakening the policies must itself be reviewed, or the committee could be quietly switched off.
deny contains {
	"rule": "policy_tampering",
	"title": "Policy files changed without review",
	"message": sprintf("%d committee policy file(s) changed with %d of %d required approval(s).", [count(policy_changes), approvals, required]),
	"citations": array.concat(cites, ["Policy-as-code integrity"]),
} if {
	count(policy_changes) > 0
	approvals < required
}
