# U.S. historical states and territories

Peter Siczewicz and Emily Kelley, digital compilers, and John H. Long,
editor. *U.S. Historical States and Territories*, edition 2.0, Atlas of
Historical County Boundaries, Newberry Library, Chicago, 2011.

The state, territory, and colonial jurisdiction geometry is distributed separately under
[CC BY-NC-SA 2.5](https://creativecommons.org/licenses/by-nc-sa/2.5/).
The source is the Newberry's
[Generalized .05 degree archive](https://publications.newberry.org/ahcb/pages/United_States.html).
Its [metadata](https://publications.newberry.org/ahcb/documents/US_HistStateTerr_Metadata2.htm)
describes the coverage, effective dates, and scale.

The atlas converts the state and territory records to projected, quantized
`us-states.topo.json` and clips them to its North American map frame. For
1629 to September 1783, it groups dated county geometries by colonial
jurisdiction and dissolves internal county lines in
`colonial-jurisdictions.topo.json`. The import combines the Carolina county
records into one province through 1711. The county series has partial
coverage of overlapping and unsettled charter claims.
[Historical Counties metadata](https://publications.newberry.org/ahcb/documents/US_HistCounties_Metadata2.htm)

The atlas code has its own licence.
