# Security Policy

[繁體中文](SECURITY.md) | **English** | [日本語](SECURITY.ja.md)

## Privacy & Security Architecture

**Slipknotting on Heaven's Door (大相無形)** is a local-first photo darkroom and AI-assisted curatorial workstation:

- **Local Image & File Processing**: RAW and JPEG photos are processed locally in your browser (WebGL2 / Canvas) or Tauri desktop runtime. Compressed previews are only sent to your chosen AI provider endpoint when you explicitly trigger AI vision analysis.
- **Bring Your Own Key (BYOK)**: This project does not host any cloud backend or database. API keys remain on your local device; we recommend choosing **Master Password Encryption (PBKDF2 + AES-GCM)** in the Key Vault.

## Supported Versions

| Version | Security Updates |
| :--- | :--- |
| Latest release (`main` / latest `v*` tag) | Yes |
| Older releases | No — please upgrade to the latest version |

## Reporting a Vulnerability

If you discover a potential security vulnerability in this project (including but not limited to XSS, Tauri IPC privilege issues, path traversal, or high-severity dependency CVEs), **please do not open a public Issue**.

Please report it privately through:

1. **GitHub Private Vulnerability Reporting (Recommended)**:
   Go to **Security → Advisories → Report a vulnerability** in this GitHub repository.
2. **Helpful details to include**:
   - Vulnerability type and affected component/environment (Web / Cloudflare Pages or Tauri Desktop)
   - Steps to reproduce or a minimal proof of concept (PoC)
   - Estimated impact and suggested remediation (if any)

We will acknowledge your report as soon as possible, evaluate a fix, and credit you in the release advisory if you wish.
