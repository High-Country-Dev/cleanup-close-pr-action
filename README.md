# Delete Database on PR Close - Mountain Dev Action

This Mountain Dev action automatically deletes the preview database associated with a pull request when the PR is closed. It's designed to clean up resources and prevent unnecessary database accumulation.

## Features

- Automatically deletes the preview database when a PR is closed
- Uses `dotenv-vault` for secure handling of environment variables
- Includes safety checks to prevent deletion of protected databases (dev, staging, prod)
- Dynamically generates database names based on branch names

## Configuration

The action uses the following environment variables:

- `DOTENV_ME`: Required. The Dotenv Vault `DOTENV_ME` token for accessing encrypted environment variables.
- `DATABASE_URL`: Extracted from the CI environment. The base database URL used to generate the preview database name.

## Safety Measures

- The action includes a safety check to prevent deletion of databases with names ending in `_dev`, `_staging`, or `_prod`.
- It only attempts to delete databases that follow the naming convention of the preview databases.

## Troubleshooting

If the action fails, check the following:

1. Ensure `DOTENV_ME` is correctly set in your Mountain Dev secrets.
2. Verify that the PostgreSQL client is installed and accessible in the Mountain Dev environment.
3. Check that the `dotenv-vault` CLI tool is installed and functioning correctly.
4. Review the action logs for any specific error messages.

## Contributing

Contributions to improve the action are welcome. Please follow these steps:

1. Fork the repository
2. Create a new branch for your feature
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have questions, please file an issue in the project's issue tracker.
