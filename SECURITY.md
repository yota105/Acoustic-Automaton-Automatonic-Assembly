# Security Policy

## Supported Versions

We release patches for security vulnerabilities for the following versions:

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability within this template, please send an email to yotayota105@gmail.com. All security vulnerabilities will be promptly addressed.

Please do not report security vulnerabilities through public GitHub issues.

### What to Include

When reporting a vulnerability, please include:

- A description of the vulnerability
- Steps to reproduce the issue
- Possible impact of the vulnerability
- Any suggested fixes or mitigations

### Response Time

We will acknowledge receipt of your vulnerability report within 48 hours and will send you regular updates about our progress. If you have not received a response within 48 hours, please follow up via email.

### Disclosure Policy

- We will investigate and confirm the vulnerability
- We will work on a fix and prepare a security release
- We will notify you when the fix is ready and coordinate disclosure timing
- We will credit you in the security advisory (unless you prefer to remain anonymous)

## Security Best Practices for Users

When using this template for production applications:

1. **Keep Dependencies Updated**: Regularly update npm packages and Rust crates
2. **Review Code**: Audit any custom DSP code or visualizations you add
3. **Secure Configuration**: Use appropriate CSP settings and security headers
4. **Input Validation**: Validate all user inputs, especially for audio parameters
5. **Network Security**: Use HTTPS in production environments

## Security Features

This template includes:

- Content Security Policy (CSP) configuration
- Secure defaults in Tauri configuration
- Input sanitization for audio parameters
- Secure WebAssembly integration with Faust
