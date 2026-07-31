# Demo artwork asset provenance

The JPEGs in this directory are packaged with Curatium so the opt-in demo
showcase remains complete without an Art Institute provider request at startup
or during automated tests. They are not temporary stand-ins.

The replacements below were downloaded on 2026-07-31 from the Art Institute of
Chicago's official IIIF service. The corresponding official API records report
`is_public_domain: true`. The thumbnail and display derivatives use the same
image identifier as the seeded artwork and the same 400 px and 843 px width
contracts used by Curatium's image-delivery service.

| Packaged image ID | Stored record | Official collection record | Official IIIF derivatives |
| --- | --- | --- | --- |
| `3ccdfe37-97e5-4849-2ee9-aef8e7e27595` | *Landscape* — Georges Seurat; c. 1881; black Conté crayon on off-white laid paper; Art Institute record 202357 | [artic.edu/artworks/202357/landscape](https://www.artic.edu/artworks/202357/landscape) | [400 px JPEG](https://www.artic.edu/iiif/2/3ccdfe37-97e5-4849-2ee9-aef8e7e27595/full/400,/0/default.jpg), [843 px JPEG](https://www.artic.edu/iiif/2/3ccdfe37-97e5-4849-2ee9-aef8e7e27595/full/843,/0/default.jpg) |
| `360e3e61-bb1c-1eb5-a9f5-e620f305b75b` | *Portrait of an Artist* — Artist unknown (French, active 18th century); c. 1735; oil on canvas; Art Institute record 61741 | [artic.edu/artworks/61741/portrait-of-an-artist](https://www.artic.edu/artworks/61741/portrait-of-an-artist) | [400 px JPEG](https://www.artic.edu/iiif/2/360e3e61-bb1c-1eb5-a9f5-e620f305b75b/full/400,/0/default.jpg), [843 px JPEG](https://www.artic.edu/iiif/2/360e3e61-bb1c-1eb5-a9f5-e620f305b75b/full/843,/0/default.jpg) |

For record metadata and the public-domain designation, use the official API:

- `https://api.artic.edu/api/v1/artworks/202357`
- `https://api.artic.edu/api/v1/artworks/61741`
