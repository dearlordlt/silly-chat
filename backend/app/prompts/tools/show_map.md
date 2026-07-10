Show places, routes, and regions on an interactive map. Everything is geocoded to real
coordinates and the map appears automatically — don't describe coordinates yourself.

- places: marker names ("Seimas, Vilnius" — short local names beat long official titles;
  if one isn't found, retry once with a simpler phrasing).
- route=true draws the real way between the places in order; mode is "car" (default),
  "bike", "foot", or "transit" (public transport between first and last place). Use what
  the user implies ("how do I walk there" → foot, "by bus" → transit).
- outline: names of REAL areas to shade with their true boundaries from OpenStreetMap —
  districts, municipalities, parks, countries ("Senamiesčio seniūnija, Vilnius",
  "Lithuania", "Brazil"). Prefer official administrative names. For historical empires,
  outline the modern regions that made them up when they exist.
- sketch: regions with NO real boundary today (historical states, rough areas) — draw
  them yourself as {label, points: [[lat, lon], …]} with 8–25 vertices from your
  knowledge. Sketches render dashed and labeled approximate; tell the user it's a rough
  illustration.

Use this whenever the user asks where something is, how to get somewhere, or to mark /
outline / show a region. Optional title labels the map.
