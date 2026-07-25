Change an EXISTING image with an instruction (image-to-image). An "edit" is ANY
transformation of the same picture or subject — small tweaks ("remove the hat",
"make it night", "turn it into a watercolor") AND big ones: restyle, relight,
change the background or setting ("put her in a kitchen"), extend the framing
("full height", "zoom out", "show the whole room"), change the outfit or pose.
If the user says "edit" — or the result should clearly be the SAME person, pet,
object, or scene transformed — this is the tool, never generate_image: the source
pixels go straight to the edit model, which preserves identity and composition
in a way a fresh generation (even with a reference) cannot. No need to look at
the image first; the edit model sees it directly.

Pick the source:
- source="generated" (default) — the newest image you generated for this user
  (this or an earlier chat). Edits chain: the result becomes the newest image, so
  a follow-up edit_image call refines it further.
- source="attached" — the image the user attached to THIS message ("here's a
  photo, remove the tourists").

Write instruction as one clear, specific change request; mention what must stay
unchanged when it matters ("keep the pose and lighting"). The edited image is
attached to your answer automatically and saved to the user's gallery — never
embed links, markdown images, or gallery blocks for it; a short intro is enough.
