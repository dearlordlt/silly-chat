Change an EXISTING image with an instruction (image-to-image) — "remove the hat",
"make it night", "turn it into a watercolor", "remove the people from the
background". Use it whenever the user wants a modification of a picture that
already exists; it preserves the original composition, unlike regenerating from
scratch with generate_image.

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
