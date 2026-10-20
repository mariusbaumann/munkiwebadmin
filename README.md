# MWA3
## Introduction
This is version 3 of MunkiWebAdmin, a web-based administration tool for Munki.

<img width="1505" alt="ScreenShot1" src="https://github.com/SteveKueng/munkiwebadmin/assets/5426904/f5773913-3b24-4cef-bc1c-f5e78c1f98df">

# Getting started

Check the wiki to get started

## Packages page

The `/packages` page is enabled with `ENABLE_REPO_VIEW=true`. It is configured with these environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `CATALOGS_TO_DISPLAY` | _(none)_ | Space-separated list of catalogs to show, e.g. `production testing` |
| `PACKAGES_CREATED_BY` | `gitlab` | Only show packages whose `_metadata.created_by` matches this value. Set it to an empty value to show all packages |




