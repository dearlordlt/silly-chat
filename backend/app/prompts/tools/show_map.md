Show places on an interactive map. Pass a list of place names — they are geocoded to
real coordinates and shown as markers (the map appears automatically; don't describe
coordinates yourself). Set route=true to also draw the real way between them in the
order given (returns distance and travel time). mode picks how: "car" (default),
"bike", "foot", or "transit" (public transport — bus/tram/train, routed between the
first and last place) — use what the user implies ("how do I walk there" → foot,
"by bus" → transit). Use this
whenever the user asks where something is, how to get from A to B, or anything
location-shaped. Use short, local place names ("Seimas, Vilnius" — not long official
titles); if a place isn't found, retry once with a simpler or more local phrasing.
Optional title labels the map.
