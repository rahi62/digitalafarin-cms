# Contributing

Thanks for helping improve DigitalAfarin CMS.

## Development principles

- Keep the Django package host-project friendly; do not replace host settings unnecessarily.
- Keep content storage structured and presentation-agnostic.
- Keep site/organization boundaries explicit in new models and queries.
- Avoid introducing commercial-only code into the Community repository.
- Add migrations and tests for model/API changes.
- Keep Python and npm package versions synchronized.

## Pull requests

1. Create a focused branch.
2. Add or update tests.
3. Run the relevant checks locally.
4. Explain migrations and backwards-incompatible API changes in the PR description.
5. Do not commit secrets, `.env` files, registry tokens or customer data.

## Versioning

This project follows Semantic Versioning. During the `0.x` period, APIs can still change between minor versions, but breaking changes should be documented.
