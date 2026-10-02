# Dependency licensing. Facts (SPDX expressions) come from deps.dev / ClearlyDefined; this policy decides.
#
# input:
#   dependencies [{name, version, license}]   license is an SPDX id/expression, or null/""/NOASSERTION/NONE when unknown
#
# Ranks: 0 permissive, 1 weak copyleft, 2 unrecognised id, 3 strong copyleft, 4 missing.
# "A OR B" takes the better choice (min); "A AND B" the worse (max); "WITH <exception>" is judged on the base license.
package committee.licensing

import rego.v1

permissive := {
	"mit", "isc", "0bsd", "unlicense", "cc0-1.0", "zlib", "bsl-1.0", "python-2.0", "psf-2.0",
	"apache-2.0", "bsd-2-clause", "bsd-3-clause", "blueoak-1.0.0", "cc-by-4.0", "wtfpl",
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
	"file": "package.json",
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
