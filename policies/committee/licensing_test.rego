package committee.licensing_test

import data.committee.licensing
import rego.v1

rules(set) := {x | some f in set; x := f.rule}

dep(name, license) := {"dependencies": [{"name": name, "version": "1.0.0", "license": license}]}

test_permissive_licenses_pass if {
	every l in ["MIT", "Apache-2.0", "ISC", "BSD-3-Clause", "0BSD", "Unlicense"] {
		count(licensing.deny) == 0 with input as dep("x", l)
		count(licensing.warn) == 0 with input as dep("x", l)
	}
}

test_strong_copyleft_denies if {
	every l in ["GPL-3.0", "GPL-2.0-only", "GPL-3.0-or-later", "AGPL-3.0", "AGPL-3.0-only", "SSPL-1.0", "GPL-2.0+"] {
		"license_strong_copyleft" in rules(licensing.deny) with input as dep("x", l)
	}
}

test_weak_copyleft_warns_not_denies if {
	every l in ["LGPL-3.0", "LGPL-2.1-only", "MPL-2.0", "EPL-2.0", "CDDL-1.0"] {
		"license_weak_copyleft" in rules(licensing.warn) with input as dep("x", l)
		count(licensing.deny) == 0 with input as dep("x", l)
	}
}

test_missing_license_denies if {
	"license_missing" in rules(licensing.deny) with input as dep("x", null)
	"license_missing" in rules(licensing.deny) with input as dep("x", "")
	"license_missing" in rules(licensing.deny) with input as dep("x", "NOASSERTION")
	"license_missing" in rules(licensing.deny) with input as dep("x", "NONE")
	"license_missing" in rules(licensing.deny) with input as {"dependencies": [{"name": "x", "version": "1"}]}
}

test_unrecognised_license_warns if {
	"license_unrecognised" in rules(licensing.warn) with input as dep("x", "Some-Custom-1.0")
	count(licensing.deny) == 0 with input as dep("x", "Some-Custom-1.0")
}

test_or_expression_takes_the_most_permissive_choice if {
	count(licensing.deny) == 0 with input as dep("x", "MIT OR GPL-3.0")
	count(licensing.deny) == 0 with input as dep("x", "(MIT OR GPL-3.0-or-later)")
}

test_and_expression_takes_the_most_restrictive_choice if {
	"license_strong_copyleft" in rules(licensing.deny) with input as dep("x", "Apache-2.0 AND GPL-3.0")
}

test_with_exception_is_judged_on_the_base_license if {
	"license_strong_copyleft" in rules(licensing.deny) with input as dep("x", "GPL-2.0-only WITH Classpath-exception-2.0")
}

test_case_insensitive if {
	"license_strong_copyleft" in rules(licensing.deny) with input as dep("x", "gpl-3.0")
}

test_finding_names_the_package_and_cites_the_license if {
	some f in licensing.deny with input as dep("left-pad", "AGPL-3.0")
	contains(f.title, "left-pad")
	"AGPL-3.0" in f.citations
}

test_one_finding_per_offending_dependency if {
	i := {"dependencies": [{"name": "a", "version": "1", "license": "GPL-3.0"}, {"name": "b", "version": "1", "license": "MIT"}, {"name": "c", "version": "1", "license": "AGPL-3.0"}]}
	count(licensing.deny) == 2 with input as i
}

test_empty_input_has_no_findings if {
	count(licensing.deny) == 0 with input as {}
	count(licensing.warn) == 0 with input as {}
	count(licensing.deny) == 0 with input as {"dependencies": []}
}

# --- ClearlyDefined enrichment: licenses discovered in the package's files ---

test_discovered_strong_copyleft_under_a_permissive_declaration_warns if {
	i := {"dependencies": [{"name": "x", "version": "1", "license": "MIT", "discovered": ["MIT AND GPL-3.0"]}]}
	"license_discovered_mismatch" in rules(licensing.warn) with input as i
}

test_discovered_permissive_licenses_do_not_warn if {
	i := {"dependencies": [{"name": "x", "version": "1", "license": "MIT", "discovered": ["MIT", "Apache-2.0"]}]}
	count(licensing.warn) == 0 with input as i
}

test_discovered_copyleft_is_not_double_reported_when_already_denied if {
	i := {"dependencies": [{"name": "x", "version": "1", "license": "GPL-3.0", "discovered": ["GPL-3.0"]}]}
	w := licensing.warn with input as i
	not "license_discovered_mismatch" in rules(w)
	"license_strong_copyleft" in rules(licensing.deny) with input as i
}

# --- REUSE-style SPDX headers (only when the repository follows REUSE) ---

test_missing_spdx_header_warns_when_the_repo_uses_reuse if {
	i := {"reuse": {"enabled": true, "files_missing_header": ["src/new.ts"]}}
	some f in licensing.warn with input as i
	f.rule == "missing_spdx_header"
	f.file == "src/new.ts"
	"REUSE Specification 3.3" in f.citations
}

test_missing_spdx_header_is_silent_when_the_repo_does_not_use_reuse if {
	i := {"reuse": {"enabled": false, "files_missing_header": ["src/new.ts"]}}
	count(licensing.warn) == 0 with input as i
	count(licensing.warn) == 0 with input as {"reuse": {"files_missing_header": ["src/new.ts"]}}
}

# --- the finding names the manifest or lockfile the dependency came from ---

test_finding_reports_the_dependency_file if {
	i := {"dependencies": [{"name": "evil", "version": "1.0.0", "license": "GPL-3.0", "file": "Cargo.lock"}]}
	some f in licensing.deny with input as i
	f.file == "Cargo.lock"
}

test_finding_file_defaults_to_package_json if {
	some f in licensing.deny with input as dep("x", "AGPL-3.0")
	f.file == "package.json"
}
