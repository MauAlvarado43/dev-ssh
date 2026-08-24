# Security policy

Please report vulnerabilities privately to the repository owner instead of opening a public issue.

Dev SSH imports private keys only into its extension-owned VS Code `globalStorage` directory. Managed directories use `0700` and key files use `0600` on POSIX systems. Source files must never be modified or deleted, and key contents must never be logged or transmitted.
