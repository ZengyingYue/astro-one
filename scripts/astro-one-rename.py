#!/usr/bin/env python3
"""Rename DeepSeek Harness (dsh) product identifiers to Astro One (astro-one) in a checkout.

Usage: python3 scripts/astro-one-rename.py [ROOT]

Rewrites every tracked UTF-8 text file and renames tracked paths whose segments name dsh.
Generated digests, catalogs, pairing records, and the lockfile are not recomputed here.

Upstream synchronization replays the fork onto a fresh upstream checkout:
1. cherry-pick the fork commits written before the rename;
2. run this script and commit its output;
3. cherry-pick the `fix(rename)` commit that holds the manual follow-ups;
4. run `pnpm install` and the repository generators, and commit the regenerated files;
5. cherry-pick the fork commits written after the rename.
"""
import os
import re
import subprocess
import sys

# Externally published names that keep their scope, in every spelling the tree uses.
PROTECTED = [
    '@deepseek-ai/libreoffice-kit',
    '@deepseek-ai\\/libreoffice-kit',
    "'@deepseek-ai', 'libreoffice-kit",
    "'@deepseek-ai', `libreoffice-kit",
    # Scope directory joins in tests that only locate the external libreoffice-kit engines.
    "'node_modules/@deepseek-ai', ",
    '@deepseek-ai/create-sdk',
    '@deepseek-ai/fixture',
    'deepseek-ai/dsh-libreoffice-kit',
    '@deepseek-ai/node-addon-landlock',
    # Test fixtures standing in for externally published platform packages.
    '@deepseek-ai/platform-package',
    '@deepseek-ai/missing-platform',
    '@deepseek-ai/unused',
]

# File extensions after `dsh.` that name a file, not a manifest field.
FILE_EXTENSIONS = 'cmd|exe|ps1|sh|bat|js|mjs|cjs|ts|mts|json|md|yml|yaml|txt|log|lock|tgz|app|plist|desktop|svg|png|ico|zip|dmg|deb|AppImage'
# package.json `dsh` manifest fields, named the same way in prose.
MANIFEST_FIELDS = 'client|bundle|profile|sessionFormatMigration|optionalBundles|engines|publishOrder|configTrees|manifestVersion|file'
UNQUOTED = r'(?<![A-Za-z0-9_$/.\-\'"`])'
CODE_FILE = re.compile(r'\.(?:[cm]?[jt]sx?)$')
# Agent Notes record the npm organization's history under its own name.
NOTES = '.agents/notes/'
SCOPE_ALONE = re.compile(r'@deepseek-ai(?![\w/-])')
# A bare `dsh` that cannot sit inside a word, a path segment, or a package name.
BARE = r'(?<![A-Za-z0-9_$/.\-])'
# Escape sequences such as `\n`, `\0`, or `\x07` directly before a word.
ESCAPED = r'(?<=\\[nrt0])|(?<=\\x[0-9a-fA-F]{2})|(?<=\\u[0-9a-fA-F]{4})'

# Ordered (pattern, replacement) pairs; earlier rules win.
RULES = [
    (r'deepseek-harness\.github\.io/deepseek-harness', 'zengyingyue.github.io/astro-one'),
    # Repository guards keep upstream-only jobs disabled in the fork; other references name the fork.
    (r"(?:(?<=github\.repository == ')|(?<=full_name: '))deepseek-harness/deepseek-harness", 'astro-one/astro-one'),
    (r'deepseek-harness/deepseek-harness', 'ZengyingYue/astro-one'),
    (r'deepseek-ai/deepseek-harness', 'ZengyingYue/astro-one'),
    (r'@deepseek-ai(\\?/|\\|%2[fF])dsh-', r'@astro-one\1'),
    (r"'@deepseek-ai', 'dsh-", "'@astro-one', '"),
    (r"'@deepseek-ai', 'dsh'", "'@astro-one', 'cli'"),
    (r"'@deepseek-ai', ", "'@astro-one', "),
    (r"'@deepseek-ai'", "'@astro-one'"),
    (r'"@deepseek-ai", "dsh-', '"@astro-one", "'),
    (r'@deepseek-ai/dsh\b', '@astro-one/cli'),
    (r'@deepseek-ai(?=\\?/|%2[fF])', '@astro-one'),
    # Markdown heading slugs of scoped package names.
    (r'deepseek-aidsh-', 'astro-one'),
    (r'deepseek-aidsh(?![\w-])', 'astro-onecli'),
    (r'deepseek-ai(?=[a-z])', 'astro-one'),
    # Generated slugs and npm tarball names flatten the scope with a hyphen.
    (r'deepseek-ai-dsh-', 'astro-one-'),
    (r'deepseek-ai-(?!libreoffice)(?=[a-z][a-z0-9-]*-\d+\.\d+\.\d+\.tgz)', 'astro-one-'),
    (r'DeepSeek Harness', 'Astro One'),
    (r'Local Harness', 'Astro One'),
    (r'LOCAL HARNESS', 'ASTRO ONE'),
    (r'local-harness', 'astro-one'),
    (r'LOCAL_HARNESS', 'ASTRO_ONE'),
    (r'DEEPSEEK HARNESS', 'ASTRO ONE'),
    (r'deepseekharness', 'astroone'),
    (r'com\.deepseek\.(?:harness|dsh)\b', 'com.astro.one'),
    (r'DeepSeek-Harness', 'Astro-One'),
    (r'DeepSeekHarness', 'AstroOne'),
    # The deepseek-harness GitHub organization keeps its other repositories.
    (r'(?<!github\.com/)(?<!github:)deepseek-harness', 'astro-one'),
    (r'deepseek_harness', 'astro_one'),
    (r'DEEPSEEK_HARNESS', 'ASTRO_ONE'),
    (r'(?:(?<![A-Za-z0-9])|(?<=/D)|' + ESCAPED + r')DSH_', 'ASTRO_ONE_'),
    (r'__DSH_', '__ASTRO_ONE_'),
    (r'(?<=X-)DSH(?=-)', 'Astro-One'),
    (r'(?<=[a-z])DSH(?=[A-Z])|(?<![A-Za-z0-9_])DSH(?=-[A-Z]|[A-Z][a-z])', 'AstroOne'),
    (r'(?<=_)DSH(?![A-Za-z0-9])', 'ASTRO_ONE'),
    (r'(?<![A-Za-z0-9_])DSH(?![A-Za-z0-9_])', 'Astro One'),
    (r'Dsh(?=[A-Z0-9_]|\b)', 'AstroOne'),
    (r'(?<![A-Za-z0-9])dsh(?=[A-Z$])', 'astroOne'),
    # Manifest field and code identifiers.
    (r'(?<=")dsh(?=\\?"\s*:\s*\{)', 'astroOne'),
    (BARE + r'dsh(?=\??:\s*\{)', 'astroOne'),
    (r'(?<![A-Za-z0-9_$/.\-\'"])dsh(?=[?!]?\.(?:' + MANIFEST_FIELDS + r')\b)', 'astroOne'),
    (r'(?<=[\w)\]!?]\.)dsh(?![\w-])', 'astroOne'),
    (r'(?:(?<=\bconst )|(?<=\blet )|(?<=\bvar ))dsh\b', 'astroOne'),
    (r'(?<![A-Za-z0-9])dsh_', 'astro_one_'),
    (r'(?<=%2[fF])dsh(?=[-_.])', 'astro-one'),
    (r'(?:' + ESCAPED + r')dsh(?![A-Za-z0-9_])', 'astro-one'),
    (r'(?<![A-Za-z0-9])dsh(?![A-Za-z0-9_])', 'astro-one'),
]
# Code identifiers: variables, parameters, object keys, and member access outside string literals.
CODE_RULES = [
    # Script and archive entries named `dsh` are not identifiers.
    (re.compile(r'(?:(?<=\bscripts\?\.)|(?<=\bfiles\?\.))dsh\b'), "['astro-one']"),
    (re.compile(r"(?<=bridges\.get\(')dsh(?=')"), 'astroOne'),
    (re.compile(r"(Object\.hasOwn\([\w.?]+, ')dsh(?=')"), r'\1astroOne'),
    (re.compile(r'(?<=[(\[,] )dsh(?=[,)\].])|(?<=[(\[])dsh(?=[,)\].])|(?<=\btypeof )dsh\b|(?<=\breadonly )dsh\b'), 'astroOne'),
    # Member access on a `dsh` value in code position; prose inside strings keeps the command name.
    (re.compile(r'(?:(?<=[(\[{,!=:?&|+])|(?<=[(\[{,!=:?&|+] )|(?<=\breturn )|(?<=\bawait ))dsh(?=[?!]?\.(?!(?:' + FILE_EXTENSIONS + r')\b)[A-Za-z])'), 'astroOne'),
    (re.compile(r'^([ \t]*)dsh(?=[?!]?\.[A-Za-z])', re.M), r'\1astroOne'),
    (re.compile(r'(?:(?<=[{,(] )|(?<=[{(]))dsh(?=\??:)'), 'astroOne'),
    (re.compile(r'^([ \t]*)dsh(?=\??:)', re.M), r'\1astroOne'),
    (re.compile(r'(?<=, )dsh(?=\s*\})|(?<=\{ )dsh(?=,| \})'), 'astroOne'),
    (re.compile(UNQUOTED + r'dsh(?= [!=]==| as )'), 'astroOne'),
    (re.compile(r"(?<=exposeInMainWorld\(')dsh(?=')"), 'astroOne'),
    (re.compile(r"(?<=')dsh(?=\.(?:" + MANIFEST_FIELDS + r")\.)"), 'astroOne'),
    (re.compile(r'(?<=: )dsh(?=\s*[,}])'), 'astroOne'),
]
COMPILED = [(re.compile(p), r) for p, r in RULES]
SELF = os.path.basename(__file__)


def rewrite(text: str, code: bool = False, notes: bool = False) -> str:
    """Apply the protected-name guard and the ordered rules to one text."""
    for i, name in enumerate(PROTECTED):
        text = text.replace(name, f'\x00P{i}\x00')
    if code:
        for pattern, replacement in CODE_RULES:
            text = pattern.sub(replacement, text)
    for pattern, replacement in COMPILED:
        text = pattern.sub(replacement, text)
    if not notes:
        text = SCOPE_ALONE.sub('@astro-one', text)
    for i, name in enumerate(PROTECTED):
        text = text.replace(f'\x00P{i}\x00', name)
    return text


def rename_path(path: str) -> str:
    """Rename dsh path segments the same way as text."""
    return '/'.join(rewrite(part) for part in path.split('/'))


def main() -> None:
    """Rewrite and rename the tracked files under ROOT (default: the working directory)."""
    root = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else '.')
    files = subprocess.run(['git', '-C', root, 'ls-files', '-z'], capture_output=True, check=True).stdout.decode().split('\0')
    for rel in filter(None, files):
        if os.path.basename(rel) == SELF:
            continue
        path = os.path.join(root, rel)
        if os.path.islink(path) or not os.path.isfile(path):
            continue
        data = open(path, 'rb').read()
        # Binary files carry NUL bytes; source files may embed one in test data.
        if b'\0' in data and not CODE_FILE.search(rel):
            continue
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            continue
        new = rewrite(text, bool(CODE_FILE.search(rel)), rel.startswith(NOTES))
        if new != text:
            open(path, 'w', encoding='utf-8', newline='').write(new)
    for rel in filter(None, files):
        target = rename_path(rel)
        if target != rel and os.path.lexists(os.path.join(root, rel)):
            os.makedirs(os.path.dirname(os.path.join(root, target)) or root, exist_ok=True)
            subprocess.run(['git', '-C', root, 'mv', '-k', rel, target], check=True)


if __name__ == '__main__':
    main()
