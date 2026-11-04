# Media upload security

## What the API enforces (v0.8.0)

`POST/PATCH /api/cms/v1/media/assets/` validates every upload on the server:

| Rule | Detail |
|---|---|
| Extension allowlist | `.jpg .jpeg .png .gif .webp .avif .pdf .mp4 .webm` |
| Signature check | The leading bytes must match the extension (magic bytes, no extra dependencies). |
| Client `Content-Type` | Ignored. `mime_type` is derived from the verified type. |
| Size | `DIGITALAFARIN_CMS_MEDIA_MAX_BYTES`, default `10485760` (10 MB). |
| HTML / JavaScript | Always rejected (not on the allowlist). |
| SVG | Rejected unless `DIGITALAFARIN_CMS_MEDIA_ALLOW_SVG = True`; even then files containing `<script>`, event handlers, `javascript:`, `foreignObject`, `iframe/object/embed` or entities are rejected. |

Violations return HTTP 400 with a field error on `file`.

## Serving `MEDIA_URL` directly (nginx)

The API validates uploads, but the web server decides how stored files are delivered.
Serve media from a path that never executes code and always sends defensive headers:

```nginx
location /media/ {
    alias /srv/app/media/;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Content-Security-Policy "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox" always;
    add_header Cross-Origin-Resource-Policy "same-site" always;

    # Anything that is not an image/video is downloaded, never rendered inline.
    types { }
    default_type application/octet-stream;
    location ~* \.(jpe?g|png|gif|webp|avif|mp4|webm)$ {
        add_header X-Content-Type-Options "nosniff" always;
        add_header Content-Security-Policy "default-src 'none'; sandbox" always;
        include /etc/nginx/mime.types;
    }
    location ~* \.pdf$ {
        add_header Content-Disposition "attachment" always;
        add_header X-Content-Type-Options "nosniff" always;
    }
}
```

Keep `MEDIA_ROOT` outside the application directory, do not enable PHP/CGI handlers on it,
and if you enable SVG add `Content-Disposition: attachment` for `*.svg`.
