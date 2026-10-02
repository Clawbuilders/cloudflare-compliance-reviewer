# Dependency licensing. Facts (SPDX expressions) come from deps.dev / ClearlyDefined; this policy decides.
#
# input:
#   dependencies [{name, version, license, discovered?, file?}]   file = the manifest or lockfile (default package.json)
#       license     SPDX id/expression, or null/""/NOASSERTION/NONE when the package declares none
#       discovered  licenses found inside the package's files (ClearlyDefined), optional
#   reuse        {enabled, files_missing_header}   only meaningful for repositories that follow the REUSE specification
#
# Ranks: 0 permissive, 1 weak copyleft, 2 unrecognised id, 3 strong copyleft, 4 missing.
# "A OR B" takes the better choice (min); "A AND B" the worse (max); "WITH <exception>" is judged on the base license.
package committee.licensing

import rego.v1

permissive := {
	"mit", "isc", "0bsd", "unlicense", "cc0-1.0", "zlib", "bsl-1.0", "python-2.0", "psf-2.0",
	"apache-2.0", "bsd-2-clause", "bsd-3-clause", "blueoak-1.0.0", "cc-by-4.0", "wtfpl",
	"unicode-3.0", "unicode-dfs-2016", "mit-0", "ncsa", "curl", "libpng-2.0", "bzip2-1.0.6", "ofl-1.1",
}

missing := {"", "none", "noassertion"}

strong_prefixes := ["gpl", "agpl", "sspl"]

weak_prefixes := ["lgpl", "mpl", "epl", "cddl", "cpl"]

license_of(dep) := l if {
	l := dep.license
	is_string(l)
} else := ""

base_id(component) := lower(trim_space(split(split(split(lower(component), " with ")[0], "+")[0], ")")[0]))

rank_of(id) := 4 if {
	id in missing
} else := 3 if {
	some p in strong_prefixes
	startswith(id, p)
} else := 1 if {
	some p in weak_prefixes
	startswith(id, p)
} else := 0 if {
	id in permissive
} else := 2

clean(expr) := replace(replace(expr, "(", ""), ")", "")

alternative_rank(alt) := max([rank_of(base_id(c)) | some c in split(alt, " AND ")])

expression_rank(expr) := min([alternative_rank(trim_space(a)) | some a in split(clean(expr), " OR ")])

rank(dep) := expression_rank(license_of(dep))

label(dep) := sprintf("%s@%s", [dep.name, object.get(dep, "version", "?")])

finding(dep, rule, title_suffix, message) := {
	"rule": rule,
	"title": sprintf("%s %s", [label(dep), title_suffix]),
	"message": message,
	"citations": [license_of(dep)],
	"file": object.get(dep, "file", "package.json"),
}

deny contains finding(dep, "license_missing", "has no declared license", "No license was found. Using unlicensed code is not permitted by default; confirm the license before adding it.") if {
	some dep in input.dependencies
	rank(dep) == 4
}

deny contains finding(dep, "license_strong_copyleft", "uses a strong copyleft license", "GPL/AGPL/SSPL terms can require you to release your own source. Choose another dependency or get a legal review.") if {
	some dep in input.dependencies
	rank(dep) == 3
}

warn contains finding(dep, "license_unrecognised", "uses a license not on the allow-list", "This SPDX identifier is not on the permissive allow-list. Review its terms before shipping.") if {
	some dep in input.dependencies
	rank(dep) == 2
}

warn contains finding(dep, "license_weak_copyleft", "uses a weak copyleft license", "LGPL/MPL/EPL-style terms apply to modifications of this library. Fine for unmodified use; check your obligations.") if {
	some dep in input.dependencies
	rank(dep) == 1
}

# ClearlyDefined scans the files themselves. A stricter license in the files than in the declaration is a real red flag.
warn contains finding(dep, "license_discovered_mismatch", "has a stricter license in its files than it declares", "The package's files contain GPL/AGPL/SSPL-style terms that its declared license does not mention. Review before using it.") if {
	some dep in input.dependencies
	rank(dep) < 3
	some d in object.get(dep, "discovered", [])
	is_string(d)
	expression_rank(d) == 3
}

reuse := object.get(input, "reuse", {})

warn contains {
	"rule": "missing_spdx_header",
	"title": sprintf("%s has no SPDX license header", [f]),
	"message": "This repository follows the REUSE specification, so every new file needs SPDX-License-Identifier and copyright tags.",
	"citations": ["REUSE Specification 3.3"],
	"file": f,
} if {
	object.get(reuse, "enabled", false)
	some f in object.get(reuse, "files_missing_header", [])
}
