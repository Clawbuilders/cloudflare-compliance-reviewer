package committee.change_control_test

import data.committee.change_control
import rego.v1

titles(set) := {x | some f in set; x := f.rule}

test_ci_change_without_approval_warns if {
	w := change_control.warn with input as {"changed_paths": [".github/workflows/deploy.yml", "src/a.ts"], "approvals": 0}
	"sensitive_change_without_approval" in titles(w)
}

test_ci_change_with_approval_is_quiet if {
	w := change_control.warn with input as {"changed_paths": [".github/workflows/deploy.yml"], "approvals": 1}
	count(w) == 0
}

test_docs_only_is_quiet if {
	w := change_control.warn with input as {"changed_paths": ["README.md", "docs/a.md"], "approvals": 0}
	d := change_control.deny with input as {"changed_paths": ["README.md"], "approvals": 0}
	count(w) == 0
	count(d) == 0
}

test_required_approvals_is_configurable if {
	w := change_control.warn with input as {"changed_paths": ["infra/main.tf"], "approvals": 1, "required_approvals": 2}
	"sensitive_change_without_approval" in titles(w)
}

test_blast_radius_warns_over_the_limit if {
	paths := [sprintf("src/f%d.ts", [i]) | some i in numbers.range(1, 30)]
	w := change_control.warn with input as {"changed_paths": paths, "approvals": 1}
	"blast_radius" in titles(w)
}

test_blast_radius_respects_override if {
	paths := [sprintf("src/f%d.ts", [i]) | some i in numbers.range(1, 30)]
	w := change_control.warn with input as {"changed_paths": paths, "approvals": 1, "max_files": 50}
	count(w) == 0
}

test_policy_files_changed_without_approval_denies if {
	d := change_control.deny with input as {"changed_paths": ["policies/committee/privacy.rego"], "approvals": 0}
	"policy_tampering" in titles(d)
}

test_policy_files_changed_with_approval_is_ok if {
	d := change_control.deny with input as {"changed_paths": ["policies/committee/privacy.rego"], "approvals": 1}
	count(d) == 0
}

test_auth_and_infra_paths_are_sensitive if {
	w := change_control.warn with input as {"changed_paths": ["src/auth/session.ts", "wrangler.jsonc", "Dockerfile"], "approvals": 0}
	count(w) >= 1
}

test_findings_carry_citations if {
	w := change_control.warn with input as {"changed_paths": [".github/workflows/x.yml"], "approvals": 0}
	some f in w
	count(f.citations) > 0
	f.title != ""
	f.message != ""
}

test_empty_input_has_no_findings if {
	count(change_control.warn) == 0 with input as {}
	count(change_control.deny) == 0 with input as {}
}
