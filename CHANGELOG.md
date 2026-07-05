# Changelog

All notable changes to @ifdog/pi-statuswrap.

## [1.0.1] - 2026-07-05

- Guard against `FooterComponent` export disappearing/reshaping in future pi versions: no-op instead of crashing the extension loader. Complements the existing `try/catch` instance-field fallback.
- README: note tested pi version (0.80.x).

## [1.0.0] - 2026-07-05

- Initial release. One extension status per footer line; built-in lines untouched.
